import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AppError } from '../utils/errors.js';

/**
 * The test case repository: projects, each with its own folders and the cases
 * filed in them, the way a test management tool keeps them. Case keys
 * (TC-1, TC-2, ...) are numbered per project. The agent's "Add" saves approved cases
 * here; from here they are exported to Jira, Azure DevOps, Excel and the rest.
 *
 * Stored as one JSON file, which suits a single-team deployment. Every write
 * goes through one queue and lands via write-then-rename, so concurrent
 * requests cannot interleave and a crash cannot leave half a file.
 */

const DEFAULT_PATH = fileURLToPath(new URL('../../data/repository.json', import.meta.url));
const filePath = () => process.env.REPOSITORY_PATH || DEFAULT_PATH;

export const REPOSITORY_LIMITS = { cases: 5000, folders: 500, depth: 6, projects: 50 };

/** The first project's name until it is renamed; PROJECT_NAME sets it per deployment. */
const defaultProjectName = () => process.env.PROJECT_NAME?.trim() || 'Default project';
const ROOT_FOLDER = 'Test cases';

const now = () => new Date().toISOString();
const folderId = () => `f_${randomUUID().slice(0, 8)}`;
const caseId = () => `c_${randomUUID().slice(0, 12)}`;
const projectId = () => `p_${randomUUID().slice(0, 8)}`;

const newProject = (name) => ({ id: projectId(), name, seq: 0, createdAt: now() });
const rootFolder = (project) => ({ id: folderId(), name: ROOT_FOLDER, parentId: null, projectId: project.id, createdAt: now() });

function seed() {
  const project = newProject(defaultProjectName());
  return { version: 2, projects: [project], folders: [rootFolder(project)], cases: [] };
}

/**
 * A version 1 file had one implicit project: its folders and cases become the
 * first project's, keeping their names, keys and numbering.
 */
function migrate(data) {
  if (Array.isArray(data.projects) && data.projects.length) return data;
  const project = { ...newProject(data.projectName || defaultProjectName()), seq: data.seq ?? 0 };
  const folders = (data.folders ?? []).map((x) => ({ ...x, projectId: project.id }));
  const cases = (data.cases ?? []).map((c) => ({ ...c, projectId: project.id }));
  if (!folders.some((x) => !x.parentId)) folders.push(rootFolder(project));
  return { version: 2, projects: [project], folders, cases };
}

let cache = null;
let queue = Promise.resolve();

async function load() {
  if (cache) return cache;
  try {
    cache = migrate(JSON.parse(await readFile(filePath(), 'utf8')));
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

function requireProject(data, id) {
  const project = data.projects.find((p) => p.id === id);
  if (!project) throw notFound('project');
  return project;
}

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

/**
 * One project's folders and cases, plus the list of projects to switch
 * between. An unknown or missing id falls back to the first project.
 */
export async function getRepository(id) {
  const data = await load();
  const project = data.projects.find((p) => p.id === id) ?? data.projects[0];
  return {
    projects: data.projects.map((p) => ({
      id: p.id,
      name: p.name,
      cases: data.cases.filter((c) => c.projectId === p.id).length,
    })),
    projectId: project.id,
    projectName: project.name,
    folders: data.folders.filter((x) => x.projectId === project.id),
    cases: data.cases.filter((c) => c.projectId === project.id),
  };
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
export async function relatedCases(text, { limit = 60, projectId: id } = {}) {
  const data = await load();
  const pool = id ? data.cases.filter((c) => c.projectId === id) : data.cases;
  const want = wordsOf(text);
  if (want.size === 0 || pool.length === 0) return { scanned: pool.length, related: [] };
  const scored = pool
    .map((c) => {
      const have = wordsOf(`${c.title} ${c.description ?? ''} ${c.scenario ?? ''}`);
      let shared = 0;
      for (const w of have) if (want.has(w)) shared += 1;
      return { title: c.title, score: shared / Math.sqrt(have.size || 1) };
    })
    .filter((c) => c.score >= 0.5)
    .sort((a, b) => b.score - a.score);
  return { scanned: pool.length, related: [...new Set(scored.map((c) => c.title))].slice(0, limit) };
}

/* ---------------- projects ---------------- */

const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** A new project starts with one top-level folder, like the first one. */
export const createProject = (name) =>
  mutate((data) => {
    if (data.projects.length >= REPOSITORY_LIMITS.projects) throw invalid(`A repository holds at most ${REPOSITORY_LIMITS.projects} projects.`);
    if (data.projects.some((p) => sameName(p.name, name))) throw invalid('A project with that name already exists.');
    const project = newProject(name);
    data.projects.push(project);
    data.folders.push(rootFolder(project));
    return { project: { id: project.id, name: project.name, cases: 0 } };
  });

export const renameProject = (id, name) =>
  mutate((data) => {
    const project = requireProject(data, id);
    if (data.projects.some((p) => p.id !== id && sameName(p.name, name))) throw invalid('A project with that name already exists.');
    project.name = name;
    return { project: { id, name } };
  });

/** Removes a project with all its folders and cases; the last one stays. */
export const deleteProject = (id) =>
  mutate((data) => {
    requireProject(data, id);
    if (data.projects.length === 1) throw invalid('Keep at least one project.');
    const removedCases = data.cases.filter((c) => c.projectId === id).length;
    data.projects = data.projects.filter((p) => p.id !== id);
    data.folders = data.folders.filter((x) => x.projectId !== id);
    data.cases = data.cases.filter((c) => c.projectId !== id);
    return { removedCases };
  });

/* ---------------- folders ---------------- */

/** A subfolder belongs to its parent's project; a top-level one to `project` (default: the first). */
function addFolder(data, name, parentId, project) {
  if (data.folders.length >= REPOSITORY_LIMITS.folders) throw invalid(`A repository holds at most ${REPOSITORY_LIMITS.folders} folders.`);
  let owner;
  if (parentId) {
    owner = requireFolder(data, parentId).projectId;
    if (depthOf(data, parentId) + 1 >= REPOSITORY_LIMITS.depth) throw invalid('Folders nest at most six levels deep.');
  } else {
    owner = project ? requireProject(data, project).id : data.projects[0].id;
  }
  const folder = { id: folderId(), name, parentId: parentId ?? null, projectId: owner, createdAt: now() };
  data.folders.push(folder);
  return folder;
}

export const createFolder = ({ name, parentId, projectId: project }) => mutate((data) => addFolder(data, name, parentId, project));

export const renameFolder = (id, name) =>
  mutate((data) => {
    const folder = requireFolder(data, id);
    folder.name = name;
    return folder;
  });

export const deleteFolder = (id) =>
  mutate((data) => {
    const folder = requireFolder(data, id);
    const tops = data.folders.filter((x) => !x.parentId && x.projectId === folder.projectId);
    if (!folder.parentId && tops.length === 1) throw invalid('Keep at least one top-level folder.');
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
    const project = requireProject(data, requireFolder(data, target).projectId);
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
      project.seq += 1;
      const stamp = now();
      const stored = {
        ...tc,
        id: caseId(),
        key: `TC-${project.seq}`,
        projectId: project.id,
        folderId: folderFor(tc.scenario),
        createdAt: stamp,
        updatedAt: stamp,
      };
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
    data.cases[index] = {
      ...testCase,
      id,
      key: prior.key,
      projectId: prior.projectId,
      folderId: prior.folderId,
      createdAt: prior.createdAt,
      updatedAt: now(),
    };
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
    const owner = requireFolder(data, target).projectId;
    const move = new Set(ids);
    if (data.cases.some((c) => move.has(c.id) && c.projectId !== owner)) throw invalid('Test cases can only be moved within their project.');
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
