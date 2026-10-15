import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';

const LAST_PROJECT = 'tm:project';
const remembered = () => {
  try {
    return localStorage.getItem(LAST_PROJECT) || undefined;
  } catch {
    return undefined;
  }
};
const remember = (id) => {
  try {
    localStorage.setItem(LAST_PROJECT, id);
  } catch {
    // A convenience only: without storage the first project opens.
  }
};

/**
 * The saved repository -- the open project's folders and test cases, and the
 * projects to switch between -- as the list page shows it. Every change goes to the server first and the local copy is updated
 * from its answer, so what is on screen is what is stored.
 */
export function useRepository({ notify }) {
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(remembered);
  const [projectName, setProjectName] = useState('');
  const [folders, setFolders] = useState([]);
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async (id) => {
    try {
      const data = await api.repository.get(id);
      setProjects(data.projects ?? []);
      setProjectId(data.projectId);
      setProjectName(data.projectName ?? 'Default project');
      if (data.projectId) remember(data.projectId);
      setFolders(data.folders);
      setCases(data.cases);
      setLoadError(null);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const reload = useCallback(() => load(projectId), [load, projectId]);

  useEffect(() => {
    load(remembered());
  }, [load]);

  /** Opens another project's folders and cases. */
  const switchProject = useCallback((id) => {
    setLoading(true);
    return load(id);
  }, [load]);

  /** Runs a change and reports a failure; resolves to the answer, or null. */
  const attempt = useCallback(
    async (fn) => {
      try {
        return await fn();
      } catch (err) {
        notify({ kind: 'error', message: err.message });
        return null;
      }
    },
    [notify],
  );

  const createProject = (name) =>
    attempt(async () => {
      const { project } = await api.repository.createProject(name);
      await switchProject(project.id);
      return project;
    });

  const renameProject = (name) =>
    attempt(async () => {
      const { project } = await api.repository.renameProject(projectId, name);
      setProjectName(project.name);
      setProjects((prev) => prev.map((p) => (p.id === project.id ? { ...p, name: project.name } : p)));
      return project.name;
    });

  /** Deletes the open project and opens the first remaining one. */
  const deleteProject = (id) =>
    attempt(async () => {
      const result = await api.repository.deleteProject(id);
      await switchProject(projects.find((p) => p.id !== id)?.id);
      return result;
    });

  const createFolder = (name, parentId) =>
    attempt(async () => {
      const { folder } = await api.repository.createFolder(name, parentId, projectId);
      setFolders((prev) => [...prev, folder]);
      return folder;
    });

  const renameFolder = (id, name) =>
    attempt(async () => {
      const { folder } = await api.repository.renameFolder(id, name);
      setFolders((prev) => prev.map((f) => (f.id === id ? folder : f)));
      return folder;
    });

  const deleteFolder = (id) =>
    attempt(async () => {
      const result = await api.repository.deleteFolder(id);
      await reload();
      return result;
    });

  const addCases = (payload) =>
    attempt(async () => {
      const result = await api.repository.addCases(payload);
      setFolders((prev) => [...prev, ...result.folders]);
      setCases((prev) => [...prev, ...result.added]);
      return result;
    });

  const updateCase = (id, testCase) =>
    attempt(async () => {
      const { testCase: saved } = await api.repository.updateCase(id, testCase);
      setCases((prev) => prev.map((c) => (c.id === id ? saved : c)));
      return saved;
    });

  const deleteCases = (ids) =>
    attempt(async () => {
      const result = await api.repository.deleteCases(ids);
      const drop = new Set(ids);
      setCases((prev) => prev.filter((c) => !drop.has(c.id)));
      return result;
    });

  const moveCases = (ids, folderId) =>
    attempt(async () => {
      const result = await api.repository.moveCases(ids, folderId);
      const move = new Set(ids);
      setCases((prev) => prev.map((c) => (move.has(c.id) ? { ...c, folderId } : c)));
      return result;
    });

  /** Folder id -> the folder and every folder under it. */
  const descendants = useMemo(() => {
    const children = new Map();
    for (const f of folders) {
      const key = f.parentId ?? null;
      if (!children.has(key)) children.set(key, []);
      children.get(key).push(f.id);
    }
    const out = {};
    const collect = (id) => {
      if (out[id]) return out[id];
      out[id] = new Set([id, ...(children.get(id) ?? []).flatMap((c) => [...collect(c)])]);
      return out[id];
    };
    folders.forEach((f) => collect(f.id));
    return out;
  }, [folders]);

  /** Cases per folder, counting its subfolders. */
  const counts = useMemo(() => {
    const out = {};
    for (const f of folders) out[f.id] = 0;
    for (const c of cases) {
      for (const f of folders) if (descendants[f.id]?.has(c.folderId)) out[f.id] += 1;
    }
    return out;
  }, [folders, cases, descendants]);

  /** "Parent / Child" for a folder id. */
  const pathOf = useCallback(
    (id) => {
      const names = [];
      for (let f = folders.find((x) => x.id === id); f; f = folders.find((x) => x.id === f.parentId)) names.unshift(f.name);
      return names.join(' / ');
    },
    [folders],
  );

  return {
    projects,
    projectId,
    projectName,
    switchProject,
    createProject,
    renameProject,
    deleteProject,
    folders,
    cases,
    loading,
    loadError,
    reload,
    counts,
    descendants,
    pathOf,
    createFolder,
    renameFolder,
    deleteFolder,
    addCases,
    updateCase,
    deleteCases,
    moveCases,
  };
}
