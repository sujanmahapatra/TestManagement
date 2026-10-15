import { Router } from 'express';

import {
  addCasesSchema,
  caseIdsSchema,
  duplicatesSchema,
  createFolderSchema,
  moveCasesSchema,
  renameFolderSchema,
  renameProjectSchema,
  toFieldErrors,
  updateCaseSchema,
} from '../domain/testCase.js';
import {
  addCases,
  createFolder,
  createProject,
  deleteCases,
  deleteFolder,
  deleteProject,
  getRepository,
  moveCases,
  renameFolder,
  renameProject,
  updateCase,
} from '../domain/repository.js';
import { reviewDuplicates } from '../domain/duplicateReview.js';
import { ValidationError } from '../utils/errors.js';

/**
 * The test case repository: folders and saved cases. The UI's test case
 * list reads it, the agent's "Add" writes to it, and the existing export
 * endpoint files any selection from it to a tracker.
 */
export const repositoryRoutes = Router();

const parse = (schema, body) => {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ValidationError(toFieldErrors(parsed.error));
  return parsed.data;
};

/** Wraps an async handler so a rejection reaches the error handler. */
const handle = (fn) => async (req, res, next) => {
  try {
    res.json({ success: true, ...(await fn(req)) });
  } catch (err) {
    next(err);
  }
};

/** GET /api/repository?projectId= -> { projects, projectId, projectName, folders, cases } for one project (default: the first) */
repositoryRoutes.get('/', handle((req) => getRepository(typeof req.query.projectId === 'string' ? req.query.projectId : undefined)));

/** POST /api/repository/projects { name } -> { project } */
repositoryRoutes.post('/projects', handle((req) => createProject(parse(renameProjectSchema, req.body).name)));

/** PATCH /api/repository/projects/:id { name } -> { project } */
repositoryRoutes.patch('/projects/:id', handle((req) => renameProject(req.params.id, parse(renameProjectSchema, req.body).name)));

/** DELETE /api/repository/projects/:id -> { removedCases }; removes its folders and cases too. */
repositoryRoutes.delete('/projects/:id', handle((req) => deleteProject(req.params.id)));

/** POST /api/repository/folders { name, parentId? } -> { folder } */
repositoryRoutes.post('/folders', handle(async (req) => ({ folder: await createFolder(parse(createFolderSchema, req.body)) })));

/** PATCH /api/repository/folders/:id { name } -> { folder } */
repositoryRoutes.patch(
  '/folders/:id',
  handle(async (req) => ({ folder: await renameFolder(req.params.id, parse(renameFolderSchema, req.body).name) })),
);

/** DELETE /api/repository/folders/:id -> { removedFolders, removedCases }; removes its subfolders and cases too. */
repositoryRoutes.delete('/folders/:id', handle((req) => deleteFolder(req.params.id)));

/** POST /api/repository/cases { folderId, subfolders?, testCases } -> { added, folders } */
repositoryRoutes.post('/cases', handle((req) => addCases(parse(addCasesSchema, req.body))));

/** PATCH /api/repository/cases/:id { testCase } -> { testCase } */
repositoryRoutes.patch(
  '/cases/:id',
  handle(async (req) => ({ testCase: await updateCase(req.params.id, parse(updateCaseSchema, req.body).testCase) })),
);

/**
 * POST /api/repository/duplicates { projectId?, folderId? }
 *   -> { verified, scanned, checked, groups: [{ id, similarity, keepId, caseIds, reason }] }
 * Finds likely duplicates and, when an AI provider is set, has it verify them.
 */
repositoryRoutes.post(
  '/duplicates',
  handle(async (req) => {
    const { projectId, folderId } = parse(duplicatesSchema, req.body);
    const { folders, cases } = await getRepository(projectId);
    let scope = cases;
    if (folderId) {
      const ids = new Set([folderId]);
      for (let grew = true; grew; ) {
        grew = false;
        for (const f of folders) if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) grew = ids.add(f.id) && true;
      }
      scope = cases.filter((c) => ids.has(c.folderId));
    }
    return reviewDuplicates(scope);
  }),
);

/** POST /api/repository/cases/delete { ids } -> { removed } */
repositoryRoutes.post('/cases/delete', handle((req) => deleteCases(parse(caseIdsSchema, req.body).ids)));

/** POST /api/repository/cases/move { ids, folderId } -> { moved } */
repositoryRoutes.post(
  '/cases/move',
  handle((req) => {
    const { ids, folderId } = parse(moveCasesSchema, req.body);
    return moveCases(ids, folderId);
  }),
);
