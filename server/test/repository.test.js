import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Covers the saved test case repository: folders, adding approved agent
// cases (with per-scenario subfolders), editing, moving, deleting, and the
// titles the agent receives as context. Uses a throwaway file.
process.env.DESTINATIONS = 'excel';
process.env.LOG_LEVEL = 'silent';
process.env.ANTHROPIC_API_KEY = 'test-key';
process.env.REPOSITORY_PATH = join(mkdtempSync(join(tmpdir(), 'tcg-repo-')), 'repository.json');

const repo = await import('../src/domain/repository.js');
const { addCasesSchema } = await import('../src/domain/testCase.js');

const CASE = {
  title: 'Login succeeds',
  platform: 'web',
  platformLabel: 'Web',
  testType: 'regression',
  preconditions: [],
  steps: ['Open the page', 'Sign in'],
  stepResults: ['', 'Dashboard shown'],
  expectedResults: ['Dashboard shown'],
  environments: ['Chrome'],
  priority: 'high',
  category: 'Functional',
  scenario: 'Sign in',
  kind: 'positive',
  dataset: { columns: ['email'], rows: [['a@b.co']] },
};

test('a new repository starts with one folder and saves to disk', async () => {
  const { folders, cases } = await repo.getRepository();
  assert.equal(folders.length, 1);
  assert.equal(cases.length, 0);
  await repo.createFolder({ name: 'Checkout', parentId: null });
  const onDisk = JSON.parse(readFileSync(process.env.REPOSITORY_PATH, 'utf8'));
  assert.ok(onDisk.folders.some((f) => f.name === 'Checkout'));
});

test('adding cases numbers them and can file each scenario in its own subfolder', async () => {
  const { folders } = await repo.getRepository();
  const root = folders[0];
  const body = addCasesSchema.parse({
    folderId: root.id,
    subfolders: true,
    testCases: [CASE, { ...CASE, title: 'Lockout', scenario: 'Lockout' }, { ...CASE, title: 'Logout', scenario: 'Sign in' }],
  });
  const { added, folders: created } = await repo.addCases(body);
  assert.deepEqual(added.map((c) => c.key), ['TC-1', 'TC-2', 'TC-3']);
  assert.deepEqual(created.map((f) => f.name), ['Sign in', 'Lockout']);
  assert.equal(added[0].folderId, added[2].folderId);
  assert.deepEqual(added[0].dataset, CASE.dataset);

  // A second add reuses the scenario folder that already exists.
  const again = await repo.addCases(addCasesSchema.parse({ folderId: root.id, subfolders: true, testCases: [CASE] }));
  assert.equal(again.folders.length, 0);
  assert.equal(again.added[0].key, 'TC-4');
});

test('cases can be edited, moved and deleted; deleting a folder takes its subtree', async () => {
  const { folders, cases } = await repo.getRepository();
  const [first, second] = cases;
  const updated = await repo.updateCase(first.id, { ...CASE, title: 'Login succeeds (edited)' });
  assert.equal(updated.key, first.key);
  assert.equal(updated.title, 'Login succeeds (edited)');

  const checkout = folders.find((f) => f.name === 'Checkout');
  assert.deepEqual(await repo.moveCases([first.id], checkout.id), { moved: 1 });
  assert.deepEqual(await repo.deleteCases([second.id]), { removed: 1 });

  const signIn = folders.find((f) => f.name === 'Sign in');
  const result = await repo.deleteFolder(signIn.id);
  assert.equal(result.removedFolders, 1);
  const after = await repo.getRepository();
  assert.ok(!after.folders.some((f) => f.id === signIn.id));
  assert.ok(after.cases.every((c) => c.folderId !== signIn.id));
});

test('the last top-level folder cannot be deleted, and unknown folders are refused', async () => {
  const { folders } = await repo.getRepository();
  const tops = folders.filter((f) => !f.parentId);
  await repo.deleteFolder(tops.find((f) => f.name === 'Checkout').id);
  const [last] = (await repo.getRepository()).folders.filter((f) => !f.parentId);
  await assert.rejects(repo.deleteFolder(last.id), /at least one top-level folder/);
  await assert.rejects(repo.addCases({ folderId: 'f_missing', subfolders: false, testCases: [CASE] }), /no longer exists/);
});

test('saved titles are available to the agent as context', async () => {
  const { folders } = await repo.getRepository();
  await repo.addCases({ folderId: folders[0].id, subfolders: true, testCases: [{ ...CASE, title: 'Lockout', scenario: 'Lockout' }] });
  // Cases in subfolders count too.
  const titles = await repo.titlesIn([folders[0].id]);
  assert.ok(titles.includes('Lockout'));
});
