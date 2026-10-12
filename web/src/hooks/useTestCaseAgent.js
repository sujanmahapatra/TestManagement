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
});

/**
 * The test case agent's state: what the reviewer gave it, its progress while
 * it runs, the suite it produced (selection included -- selecting both
 * chooses what is added and scopes a refinement), and the conversation that
 * led there, shown beside the cases the way an AI review panel shows it.
 *
 * `notify` reports outcomes that are not errors of the current step.
 */
export function useTestCaseAgent({ agentOptions, notify }) {
  const [input, setInput] = useState(() => emptyAgentInput(agentOptions));
  const [fileErrors, setFileErrors] = useState([]);
  const [fetching, setFetching] = useState(null); // the source type being fetched
  const [error, setError] = useState(null); // { title, message, needsAuth? } for the current step
  const [running, setRunning] = useState(null); // { stage, drafted, refining } while a call is in flight
  const [cases, setCases] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [history, setHistory] = useState([]);
  const [conversation, setConversation] = useState([]);
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
    async (type, ref, { quiet = false } = {}) => {
      setFetching(type);
      setFileErrors([]);
      try {
        const { label, attachments, skipped } = await api.fetchAgentSource({ type, ref });
        const kept = attachments.map((a) => ({ ...a, origin: type }));
        let added = [];
        setInput((prev) => {
          added = kept.slice(0, Math.max(AGENT_MAX_TOTAL_FILES - prev.files.length, 0));
          return { ...prev, files: [...prev.files, ...added] };
        });
        if (!quiet) {
          const notes = [skipped > 0 && `${skipped} more frames were not rendered; link a single frame to include it.`].filter(Boolean);
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
      setRunning({ stage: 'analyze', drafted: 0, refining: Boolean(refinement) });

      const files = [...input.files, ...extraFiles.filter((f) => !input.files.some((g) => g.name === f.name && g.size === f.size))];
      // All selected means "everything", which needs no scope.
      const scope = refinement && selected.size > 0 && selected.size < cases.length ? [...selected] : [];
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
        ...(refinement && { instruction: refinement, history, current: cases, selectedIds: scope }),
      };

      if (refinement) {
        setConversation((prev) => [...prev, { role: 'user', text: refinement, scope: scope.length }]);
      }

      try {
        const answer = await api.runAgent(
          body,
          (event) =>
            setRunning((prev) => ({
              ...prev,
              ...(event.type === 'stage' && { stage: event.stage }),
              ...(event.type === 'progress' && { drafted: event.drafted }),
            })),
          controller.signal,
        );

        setCases(answer.testCases);
        // Fresh output starts fully selected; after a scoped refinement only
        // the cases that were selected, or are new, stay selected.
        setSelected((prev) =>
          refinement && scope.length
            ? new Set(answer.testCases.filter((tc) => prev.has(tc.id) || tc.change === 'new').map((tc) => tc.id))
            : new Set(answer.testCases.map((tc) => tc.id)),
        );
        setHistory((prev) => (refinement ? [...prev, refinement] : []));
        const scenarios = new Set(answer.testCases.map((tc) => tc.scenario ?? '')).size;
        const reply = {
          role: 'ai',
          summary: answer.summary,
          assumptions: answer.assumptions,
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
    [input, history, cases, selected, agentOptions, notify],
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
    history,
    conversation,
    generate,
    refine,
    updateCase,
    reset,
  };
}
