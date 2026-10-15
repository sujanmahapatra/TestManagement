import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api/client';
import { AGENT_MAX_FILES, AGENT_MAX_TOTAL_FILES, detectLinks, toAttachment } from '../domain/agent';

/** Every type and priority selected means "let the agent choose", which is the default. */
export const emptyAgentInput = (agentOptions) => ({
  prompt: '',
  files: [],
  platform: 'web',
  template: 'steps',
  categories: [...(agentOptions?.categories ?? [])],
  priorities: [...(agentOptions?.priorities ?? [])],
  language: 'English',
  datasets: false,
  contextFolderIds: [],
  scanRepository: true,
});

/** Live reasoning is shown as a rolling tail; the whole of it is not needed. */
const REASONING_KEEP = 6000;

/**
 * The test case agent's state: what the reviewer gave it, its progress while
 * it runs, the suite it produced (selection included -- selecting both
 * chooses what is added and scopes a refinement), and the conversation that
 * led there, shown beside the cases the way an AI review panel shows it.
 *
 * `notify` reports outcomes that are not errors of the current step.
 */
export function useTestCaseAgent({ agentOptions, notify, projectId }) {
  const [input, setInput] = useState(() => emptyAgentInput(agentOptions));
  const [fileErrors, setFileErrors] = useState([]);
  const [fetching, setFetching] = useState(null); // the source type being fetched
  const [error, setError] = useState(null); // { title, message, needsAuth? } for the current step
  const [running, setRunning] = useState(null); // { stage, drafted, refining } while a call is in flight
  const [cases, setCases] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [history, setHistory] = useState([]);
  const [conversation, setConversation] = useState([]);
  // Reviewer verdicts by case id. Accepted cases are kept as they are through
  // refinements; rejected ones are left out of "Add" and named to the agent
  // so it does not write them again.
  const [reviews, setReviews] = useState({});
  const [rejectedHistory, setRejectedHistory] = useState([]);
  const [addedKeys, setAddedKeys] = useState({}); // case id -> repository key, once added
  const fetchedLinks = useRef(new Set());
  const abort = useRef(null);

  const change = useCallback((key, value) => setInput((prev) => ({ ...prev, [key]: value })), []);

  // The options arrive after the first render; select every type and
  // priority once they do, as the defaults.
  useEffect(() => {
    if (!agentOptions?.categories?.length) return;
    setInput((prev) => ({
      ...prev,
      categories: prev.categories.length ? prev.categories : [...agentOptions.categories],
      priorities: prev.priorities.length ? prev.priorities : [...agentOptions.priorities],
    }));
  }, [agentOptions]);

  const addFiles = useCallback(
    async (fileList) => {
      const uploads = input.files.filter((f) => f.origin === 'upload').length;
      const room = Math.min(AGENT_MAX_FILES - uploads, AGENT_MAX_TOTAL_FILES - input.files.length);
      const chosen = [...fileList];
      const problems = [];
      if (chosen.length > room) problems.push(`Attach at most ${AGENT_MAX_FILES} files; ${chosen.length - room} were left out.`);
      const accepted = [];
      for (const file of chosen.slice(0, Math.max(room, 0))) {
        try {
          accepted.push(await toAttachment(file));
        } catch (err) {
          problems.push(err.message);
        }
      }
      setFileErrors(problems);
      if (accepted.length) setInput((prev) => ({ ...prev, files: [...prev.files, ...accepted] }));
    },
    [input.files],
  );

  /**
   * Fetches a Jira issue, Confluence page or Figma design as attachments.
   * Resolves to the attachments added (empty on failure).
   */
  const addSource = useCallback(
    async (type, ref, { quiet = false, frameIds } = {}) => {
      setFetching(type);
      setFileErrors([]);
      try {
        const { label, attachments, skipped } = await api.fetchAgentSource({ type, ref, frameIds });
        const kept = attachments.map((a) => ({ ...a, origin: type }));
        let added = [];
        setInput((prev) => {
          added = kept.slice(0, Math.max(AGENT_MAX_TOTAL_FILES - prev.files.length, 0));
          return { ...prev, files: [...prev.files, ...added] };
        });
        if (!quiet) {
          const skippedNote =
            type === 'ado'
              ? `${skipped} work ${skipped === 1 ? 'item was' : 'items were'} not found or not readable.`
              : `${skipped} more frames were not rendered; link a single frame to include it.`;
          const notes = [skipped > 0 && skippedNote].filter(Boolean);
          notify?.({ kind: 'info', message: `Added ${label}.${notes.length ? ` ${notes.join(' ')}` : ''}` });
        }
        return kept;
      } catch (err) {
        setError({ title: 'Could not fetch the requirement', message: err.message, needsAuth: err.needsAuth });
        return [];
      } finally {
        setFetching(null);
      }
    },
    [notify],
  );

  const removeFile = useCallback((index) => {
    setFileErrors([]);
    setInput((prev) => ({ ...prev, files: prev.files.filter((_, i) => i !== index) }));
  }, []);

  /** Runs the agent; `refinement` carries the instruction when refining. */
  const call = useCallback(
    async ({ testType = 'regression', extraFiles = [] }, refinement) => {
      setError(null);
      const controller = new AbortController();
      abort.current = controller;
      setRunning({ stage: 'analyze', drafted: 0, refining: Boolean(refinement), reasoning: '', context: null, notices: [] });

      const files = [...input.files, ...extraFiles.filter((f) => !input.files.some((g) => g.name === f.name && g.size === f.size))];
      // Cases already added to a folder are settled: refinements keep them as they are.
      const lockedIds = cases.filter((tc) => reviews[tc.id] === 'added').map((tc) => tc.id);
      const editable = cases.filter((tc) => reviews[tc.id] !== 'added');
      // All selected means "everything", which needs no scope.
      const chosen = editable.filter((tc) => selected.has(tc.id));
      const scope = refinement && chosen.length > 0 && chosen.length < editable.length ? chosen.map((tc) => tc.id) : [];
      const allTypes = input.categories.length === (agentOptions?.categories?.length ?? 0);
      const body = {
        platform: input.platform,
        testType,
        prompt: input.prompt,
        files: files.map(({ name, mediaType, data }) => ({ name, mediaType, data })),
        template: input.template,
        categories: allTypes ? [] : input.categories,
        priorities: input.priorities,
        language: input.language,
        datasets: input.datasets,
        contextFolderIds: input.contextFolderIds,
        scanRepository: input.scanRepository,
        ...(projectId && { projectId }),
        ...(refinement && {
          instruction: refinement,
          history,
          current: cases,
          selectedIds: scope,
          lockedIds,
          rejectedTitles: rejectedHistory.slice(-200),
        }),
      };

      if (refinement) {
        setConversation((prev) => [...prev, { role: 'user', text: refinement, scope: scope.length }]);
      }

      try {
        // What the agent reported while working, kept for the conversation
        // once it is done, and mirrored into `running` for the live view.
        let live = { reasoning: '', context: null, notices: [] };
        const onEvent = (event) => {
          if (event.type === 'reasoning') live = { ...live, reasoning: `${live.reasoning}${event.text}`.slice(-REASONING_KEEP) };
          if (event.type === 'context') live = { ...live, context: event };
          if (event.type === 'notice') live = { ...live, notices: [...live.notices, event.message] };
          setRunning((prev) => ({
            ...prev,
            ...live,
            ...(event.type === 'stage' && { stage: event.stage }),
            ...(event.type === 'progress' && { drafted: event.drafted }),
          }));
        };
        const answer = await api.runAgent(
          body,
          onEvent,
          controller.signal,
        );

        setCases(answer.testCases);
        // Fresh output starts fully selected; after a scoped refinement only
        // the cases that were selected, or are new, stay selected.
        const addedIds = new Set(lockedIds);
        setSelected((prev) =>
          refinement && scope.length
            ? new Set(answer.testCases.filter((tc) => (prev.has(tc.id) || tc.change === 'new') && !addedIds.has(tc.id)).map((tc) => tc.id))
            : new Set(answer.testCases.filter((tc) => !addedIds.has(tc.id)).map((tc) => tc.id)),
        );
        setHistory((prev) => (refinement ? [...prev, refinement] : []));
        // "Added" carries over by id; a fresh run starts the record again.
        const present = new Set(answer.testCases.map((tc) => tc.id));
        setReviews((prev) => (refinement ? Object.fromEntries(Object.entries(prev).filter(([id]) => present.has(id))) : {}));
        if (!refinement) setRejectedHistory([]);
        const groups = new Map();
        for (const tc of answer.testCases) groups.set(tc.scenario ?? 'Ungrouped', (groups.get(tc.scenario ?? 'Ungrouped') ?? 0) + 1);
        const scenarios = groups.size;
        const reply = {
          role: 'ai',
          summary: answer.summary,
          assumptions: answer.assumptions,
          gaps: answer.gaps ?? [],
          analysis: answer.analysis ?? null,
          snapshot: [...groups.entries()].map(([name, count]) => ({ name, count })),
          reasoning: live.reasoning,
          context: live.context,
          notices: live.notices,
          changeSummary: answer.changeSummary,
          removed: answer.removed,
          count: answer.testCases.length,
          scenarios,
          truncated: answer.truncated,
          changed: answer.testCases.filter((tc) => tc.change === 'new' || tc.change === 'edited').length,
        };
        setConversation((prev) =>
          refinement
            ? [...prev, reply]
            : [{ role: 'user', text: input.prompt, files: files.map((f) => ({ name: f.name, origin: f.origin })) }, reply],
        );
        if (extraFiles.length) setInput((prev) => ({ ...prev, files }));
        return true;
      } catch (err) {
        if (refinement) setConversation((prev) => prev.slice(0, -1));
        if (err instanceof ApiError && err.code === 'agent_cancelled') {
          notify?.({ kind: 'info', message: 'Stopped. Nothing changed.' });
          return false;
        }
        setError({
          title: refinement ? 'Could not refine the test cases' : 'Could not generate test cases',
          message: err instanceof ApiError ? err.message : 'An unexpected error occurred. Please try again.',
          details: Object.values(err.fieldErrors ?? {}),
        });
        return false;
      } finally {
        abort.current = null;
        setRunning(null);
      }
    },
    [input, history, cases, selected, reviews, rejectedHistory, agentOptions, notify, projectId],
  );

  /**
   * Generates from the prompt and attachments. Jira, Confluence and Figma
   * links pasted into the prompt are fetched first, as the reviewer would
   * expect from "paste requirements, issue links or prompt your use case".
   */
  const generate = useCallback(
    async (options = {}) => {
      if (!input.prompt.trim() && input.files.length === 0) {
        setError({ title: 'Nothing to generate from', message: 'Describe the requirement, paste an issue link, or attach a file.' });
        return false;
      }
      const sources = agentOptions?.sources ?? {};
      const extraFiles = [];
      for (const link of detectLinks(input.prompt)) {
        if (!sources[link.type] || fetchedLinks.current.has(link.url)) continue;
        fetchedLinks.current.add(link.url);
        extraFiles.push(...(await addSource(link.type, link.url, { quiet: true })));
      }
      return call({ ...options, extraFiles });
    },
    [call, addSource, input.prompt, input.files.length, agentOptions],
  );

  const refine = useCallback((options, instruction) => call(options, instruction.trim()), [call]);

  const toggle = useCallback(
    (ids, on) =>
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of ids) (on ? next.add(id) : next.delete(id));
        return next;
      }),
    [],
  );

/**
   * Batch reject: the selected cases leave the list, and their titles are
   * passed to every later refinement so they do not come back.
   */
  const rejectSelected = useCallback(() => {
    const drop = cases.filter((tc) => selected.has(tc.id) && reviews[tc.id] !== 'added');
    if (drop.length === 0) return 0;
    const ids = new Set(drop.map((tc) => tc.id));
    setCases((prev) => prev.filter((tc) => !ids.has(tc.id)));
    setRejectedHistory((prev) => [...prev, ...drop.map((tc) => tc.title)]);
    setSelected(new Set());
    return drop.length;
  }, [cases, selected, reviews]);

  /** Marks cases as added to a folder: kept in view, deselected, and left alone by refinements. */
  const markAdded = useCallback((ids, keys = {}) => {
    setReviews((prev) => ({ ...prev, ...Object.fromEntries(ids.map((id) => [id, 'added'])) }));
    setAddedKeys((prev) => ({ ...prev, ...keys }));
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
  }, []);

  const updateCase = useCallback(
    (next) => setCases((prev) => prev.map((tc) => (tc.id === next.id ? { ...next, change: tc.change } : tc))),
    [],
  );

  /** Back to an empty input, keeping the settings; a new requirement means a new suite. */
  const reset = useCallback(
    ({ keepInput = false } = {}) => {
      setCases([]);
      setSelected(new Set());
      setHistory([]);
      setConversation([]);
      setReviews({});
      setAddedKeys({});
      setRejectedHistory([]);
      setError(null);
      fetchedLinks.current = new Set();
      if (!keepInput) setInput((prev) => ({ ...prev, prompt: '', files: [] }));
    },
    [],
  );

  return {
    input,
    change,
    addFiles,
    addSource,
    fetching,
    removeFile,
    fileErrors,
    error,
    clearError: () => setError(null),
    running,
    cancel: () => abort.current?.abort(),
    cases,
    selected,
    toggle,
    reviews,
    addedKeys,
    rejectSelected,
    markAdded,
    history,
    conversation,
    generate,
    refine,
    updateCase,
    reset,
  };
}
