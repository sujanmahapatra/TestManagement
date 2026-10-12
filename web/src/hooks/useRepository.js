import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';

/**
 * The saved repository -- folders and test cases -- as the list page shows
 * it. Every change goes to the server first and the local copy is updated
 * from its answer, so what is on screen is what is stored.
 */
export function useRepository({ notify }) {
  const [folders, setFolders] = useState([]);
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const reload = useCallback(async () => {
    try {
      const data = await api.repository.get();
      setFolders(data.folders);
      setCases(data.cases);
      setLoadError(null);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

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

  const createFolder = (name, parentId) =>
    attempt(async () => {
      const { folder } = await api.repository.createFolder(name, parentId);
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
