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

test('scanning the repository finds the saved cases related to a requirement', async () => {
  const { folders } = await repo.getRepository();
  await repo.addCases({
    folderId: folders[0].id,
    subfolders: false,
    testCases: [
      { ...CASE, title: 'Delete a sent message for everyone', description: 'Long press a message and delete it', scenario: 'Delete message' },
      { ...CASE, title: 'Change the profile photo', description: 'Upload a new avatar', scenario: 'Profile' },
    ],
  });
  const { scanned, related } = await repo.relatedCases('Users can delete messages they have sent, for everyone or only for themselves.');
  assert.ok(scanned >= 2);
  assert.ok(related.includes('Delete a sent message for everyone'));
  assert.ok(!related.includes('Change the profile photo'));
});

test('saved titles are available to the agent as context', async () => {
  const { folders } = await repo.getRepository();
  await repo.addCases({ folderId: folders[0].id, subfolders: true, testCases: [{ ...CASE, title: 'Lockout', scenario: 'Lockout' }] });
  // Cases in subfolders count too.
  const titles = await repo.titlesIn([folders[0].id]);
  assert.ok(titles.includes('Lockout'));
});

test('projects keep their own folders, cases and numbering', async () => {
  const first = await repo.getRepository();
  assert.equal(first.projectName, 'Default project');
  assert.equal(first.projects.length, 1);

  const { project } = await repo.createProject('Payments App');
  await assert.rejects(repo.createProject('payments app'), /already exists/);
  const payments = await repo.getRepository(project.id);
  assert.equal(payments.projectName, 'Payments App');
  assert.deepEqual(payments.folders.map((f) => f.name), ['Test cases']);
  assert.equal(payments.cases.length, 0);

  // Numbering starts again in a new project, and the first project is untouched.
  const { added } = await repo.addCases({ folderId: payments.folders[0].id, subfolders: false, testCases: [CASE] });
  assert.equal(added[0].key, 'TC-1');
  assert.equal(added[0].projectId, project.id);
  assert.equal((await repo.getRepository()).cases.length, first.cases.length);
  assert.deepEqual((await repo.getRepository()).projects.map((p) => [p.name, p.cases]), [['Default project', first.cases.length], ['Payments App', 1]]);

  // Top-level folders go in the chosen project; cases cannot move across projects.
  await repo.createFolder({ name: 'Refunds', parentId: null, projectId: project.id });
  assert.ok((await repo.getRepository(project.id)).folders.some((f) => f.name === 'Refunds'));
  await assert.rejects(repo.moveCases([added[0].id], first.folders[0].id), /within their project/);

  // The scan can be limited to one project.
  assert.equal((await repo.relatedCases('Login succeeds', { projectId: project.id })).scanned, 1);

  await repo.renameProject(project.id, 'Payments');
  assert.equal((await repo.getRepository(project.id)).projectName, 'Payments');
  assert.deepEqual(await repo.deleteProject(project.id), { removedCases: 1 });
  await assert.rejects(repo.deleteProject(first.projectId), /at least one project/);
  assert.equal((await repo.getRepository(project.id)).projectId, first.projectId);

  const { renameProjectSchema } = await import('../src/domain/testCase.js');
  assert.equal(renameProjectSchema.safeParse({ name: '   ' }).success, false);
  assert.equal(renameProjectSchema.safeParse({ name: 'x'.repeat(81) }).success, false);
});

test('a single-project file from before projects becomes the first project', async () => {
  const { writeFileSync } = await import('node:fs');
  const old = join(mkdtempSync(join(tmpdir(), 'tcg-old-')), 'repository.json');
  writeFileSync(old, JSON.stringify({
    version: 1,
    seq: 7,
    projectName: 'Chat',
    folders: [{ id: 'f_1', name: 'Test cases', parentId: null }],
    cases: [{ ...CASE, id: 'c_1', key: 'TC-7', folderId: 'f_1' }],
  }));
  process.env.REPOSITORY_PATH = old;
  repo.resetRepositoryCache();
  const data = await repo.getRepository();
  assert.equal(data.projectName, 'Chat');
  assert.equal(data.cases[0].key, 'TC-7');
  assert.equal(data.folders[0].projectId, data.projectId);
  const { added } = await repo.addCases({ folderId: 'f_1', subfolders: false, testCases: [CASE] });
  assert.equal(added[0].key, 'TC-8');
});

test('feedback on a generation is saved and summed up', async () => {
  process.env.FEEDBACK_PATH = join(mkdtempSync(join(tmpdir(), 'tcg-feedback-')), 'feedback.jsonl');
  const { saveFeedback, feedbackSummary } = await import('../src/domain/feedback.js');
  const { agentFeedbackSchema } = await import('../src/domain/testCase.js');
  assert.deepEqual(await feedbackSummary(), { up: 0, down: 0, recentDown: [] });
  await saveFeedback(agentFeedbackSchema.parse({ rating: 'up', cases: 8 }), { model: 'm' });
  await saveFeedback(agentFeedbackSchema.parse({ rating: 'down', comment: 'Missed the lockout rule', prompt: 'Login with OTP', cases: 5 }), { model: 'm' });
  const summary = await feedbackSummary();
  assert.equal(summary.up, 1);
  assert.equal(summary.down, 1);
  assert.equal(summary.recentDown[0].comment, 'Missed the lockout rule');
  assert.equal(summary.recentDown[0].prompt, 'Login with OTP');
  assert.equal(agentFeedbackSchema.safeParse({ rating: 'meh' }).success, false);
});
