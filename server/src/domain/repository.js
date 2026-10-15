import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AppError } from '../utils/errors.js';

/**
 * The test case repository: folders and the cases filed in them, the way a
 * test management tool keeps them. The agent's "Add" saves approved cases
 * here; from here they are exported to Jira, Azure DevOps, Excel and the rest.
 *
 * Stored as one JSON file, which suits a single-team deployment. Every write
 * goes through one queue and lands via write-then-rename, so concurrent
 * requests cannot interleave and a crash cannot leave half a file.
 */

const DEFAULT_PATH = fileURLToPath(new URL('../../data/repository.json', import.meta.url));
const filePath = () => process.env.REPOSITORY_PATH || DEFAULT_PATH;

export const REPOSITORY_LIMITS = { cases: 5000, folders: 500, depth: 6 };

/** The name shown until someone renames the project; PROJECT_NAME sets it per deployment. */
const defaultProjectName = () => process.env.PROJECT_NAME?.trim() || 'Default project';

const now = () => new Date().toISOString();
const folderId = () => `f_${randomUUID().slice(0, 8)}`;
const caseId = () => `c_${randomUUID().slice(0, 12)}`;

function seed() {
  return {
    version: 1,
    seq: 0,
    folders: [{ id: folderId(), name: 'Test cases', parentId: null, createdAt: now() }],
    cases: [],
  };
}

let cache = null;
let queue = Promise.resolve();

async function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(await readFile(filePath(), 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    cache = seed();
  }
  return cache;
}

async function persist(data) {
  const path = filePath();
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 1));
  await rename(tmp, path);
}

/** Runs `change(data)` alone, then saves. Resolves to what `change` returns. */
function mutate(change) {
  const run = queue.then(async () => {
    const data = await load();
    const result = change(data);
    await persist(data);
    return result;
  });
  queue = run.catch(() => {});
  return run;
}

/** Forgets the in-memory copy; tests point REPOSITORY_PATH at a fresh file. */
export const resetRepositoryCache = () => {
  cache = null;
};

const notFound = (what) => new AppError(`That ${what} no longer exists.`, { status: 404, code: 'not_found' });
const invalid = (message) => new AppError(message, { status: 422, code: 'validation_failed' });

function requireFolder(data, id) {
  const folder = data.folders.find((f) => f.id === id);
  if (!folder) throw notFound('folder');
  return folder;
}

const depthOf = (data, id) => {
  let depth = 0;
  for (let f = data.folders.find((x) => x.id === id); f?.parentId; f = data.folders.find((x) => x.id === f.parentId)) depth++;
  return depth;
};

/** A folder and everything under it. */
function subtree(data, id) {
  const ids = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of data.folders) {
      if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) {
        ids.add(f.id);
        grew = true;
      }
    }
  }
  return ids;
}

/* ---------------- reads ---------------- */

export async function getRepository() {
  const data = await load();
  return { projectName: data.projectName || defaultProjectName(), folders: data.folders, cases: data.cases };
}

/** Titles of the cases in these folders (and their subfolders), for the agent's context. */
export async function titlesIn(folderIds, limit = 300) {
  const data = await load();
  const scope = new Set(folderIds.flatMap((id) => [...subtree(data, id)]));
  return data.cases.filter((c) => scope.has(c.folderId)).slice(0, limit).map((c) => c.title);
}

const STOP_WORDS = new Set(
  'the and for with that this from are was were will shall should must can could have has had not but into than then when what which who whom their there they them user users test case cases able also each other only some such very your about after before more most over under upon while'.split(' '),
);
const wordsOf = (text) =>
  new Set(
    String(text ?? '')
      .toLowerCase()
      .match(/[a-z][a-z0-9]{3,}/g)
      ?.filter((w) => !STOP_WORDS.has(w)) ?? [],
  );

/**
 * "Scan the repository": the saved cases most related to a requirement, by
 * shared words in their titles and descriptions. Cheap and deterministic --
 * enough to tell the agent what already exists so it covers what does not.
 *
 * @returns {Promise<{ scanned: number, related: string[] }>}
 */
export async function relatedCases(text, { limit = 60 } = {}) {
  const data = await load();
  const want = wordsOf(text);
  if (want.size === 0 || data.cases.length === 0) return { scanned: data.cases.length, related: [] };
  const scored = data.cases
    .map((c) => {
      const have = wordsOf(`${c.title} ${c.description ?? ''} ${c.scenario ?? ''}`);
      let shared = 0;
      for (const w of have) if (want.has(w)) shared += 1;
      return { title: c.title, score: shared / Math.sqrt(have.size || 1) };
    })
    .filter((c) => c.score >= 0.5)
    .sort((a, b) => b.score - a.score);
  return { scanned: data.cases.length, related: [...new Set(scored.map((c) => c.title))].slice(0, limit) };
}

/* ---------------- folders ---------------- */

function addFolder(data, name, parentId) {
  if (data.folders.length >= REPOSITORY_LIMITS.folders) throw invalid(`A repository holds at most ${REPOSITORY_LIMITS.folders} folders.`);
  if (parentId) {
    requireFolder(data, parentId);
    if (depthOf(data, parentId) + 1 >= REPOSITORY_LIMITS.depth) throw invalid('Folders nest at most six levels deep.');
  }
  const folder = { id: folderId(), name, parentId: parentId ?? null, createdAt: now() };
  data.folders.push(folder);
  return folder;
}

export const renameProject = (name) =>
  mutate((data) => {
    data.projectName = name;
    return { projectName: name };
  });

export const createFolder = ({ name, parentId }) => mutate((data) => addFolder(data, name, parentId));

export const renameFolder = (id, name) =>
  mutate((data) => {
    const folder = requireFolder(data, id);
    folder.name = name;
    return folder;
  });

export const deleteFolder = (id) =>
  mutate((data) => {
    requireFolder(data, id);
    if (data.folders.filter((f) => !f.parentId).length === 1 && !data.folders.find((f) => f.id === id).parentId) {
      throw invalid('Keep at least one top-level folder.');
    }
    const ids = subtree(data, id);
    const removedCases = data.cases.filter((c) => ids.has(c.folderId)).length;
    data.folders = data.folders.filter((f) => !ids.has(f.id));
    data.cases = data.cases.filter((c) => !ids.has(c.folderId));
    return { removedFolders: ids.size, removedCases };
  });

/* ---------------- cases ---------------- */

/**
 * Adds approved cases to a folder. With `subfolders`, each scenario gets a
 * subfolder of its own (reused when one by that name already exists), the
 * way the agent's "Save scenarios as sub-folders" option works.
 */
export const addCases = ({ folderId: target, subfolders, testCases }) =>
  mutate((data) => {
    requireFolder(data, target);
    if (data.cases.length + testCases.length > REPOSITORY_LIMITS.cases) {
      throw invalid(`A repository holds at most ${REPOSITORY_LIMITS.cases} test cases.`);
    }

    const created = [];
    const folderFor = (scenario) => {
      if (!subfolders || !scenario) return target;
      const existing = data.folders.find((f) => f.parentId === target && f.name === scenario);
      if (existing) return existing.id;
      const folder = addFolder(data, scenario, target);
      created.push(folder);
      return folder.id;
    };

    const added = testCases.map((tc) => {
      data.seq += 1;
      const stamp = now();
      const stored = { ...tc, id: caseId(), key: `TC-${data.seq}`, folderId: folderFor(tc.scenario), createdAt: stamp, updatedAt: stamp };
      data.cases.push(stored);
      return stored;
    });
    return { added, folders: created };
  });

export const updateCase = (id, testCase) =>
  mutate((data) => {
    const index = data.cases.findIndex((c) => c.id === id);
    if (index < 0) throw notFound('test case');
    const prior = data.cases[index];
    data.cases[index] = { ...testCase, id, key: prior.key, folderId: prior.folderId, createdAt: prior.createdAt, updatedAt: now() };
    return data.cases[index];
  });

export const deleteCases = (ids) =>
  mutate((data) => {
    const drop = new Set(ids);
    const before = data.cases.length;
    data.cases = data.cases.filter((c) => !drop.has(c.id));
    return { removed: before - data.cases.length };
  });

export const moveCases = (ids, target) =>
  mutate((data) => {
    requireFolder(data, target);
    const move = new Set(ids);
    let moved = 0;
    for (const c of data.cases) {
      if (move.has(c.id)) {
        c.folderId = target;
        c.updatedAt = now();
        moved++;
      }
    }
    return { moved };
  });
