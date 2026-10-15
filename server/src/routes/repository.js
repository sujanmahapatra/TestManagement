import { Router } from 'express';

import {
  addCasesSchema,
  caseIdsSchema,
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
  deleteCases,
  deleteFolder,
  getRepository,
  moveCases,
  renameFolder,
  renameProject,
  updateCase,
} from '../domain/repository.js';
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

/** GET /api/repository -> { projectName, folders, cases } */
repositoryRoutes.get('/', handle(() => getRepository()));

/** PATCH /api/repository/project { name } -> { projectName } */
repositoryRoutes.patch('/project', handle((req) => renameProject(parse(renameProjectSchema, req.body).name)));

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
