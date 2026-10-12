import { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Button, IconButton, Snackbar, ThemeProvider } from '@mui/material';
import { api, startJiraLogin } from '../api/client';
import { fileApprovedCases } from '../services/testCaseService';
import { useRepository } from '../hooks/useRepository';
import { useTestCaseAgent } from '../hooks/useTestCaseAgent';
import { buildTheme } from '../theme';
import ClassicApp from '../App';
import RepositoryPage from './RepositoryPage';
import GenerateWizard from './GenerateWizard';
import JiraStatus from './JiraStatus';
import { AiBadge, CheckIcon, CloseIcon, ListIcon, WandIcon } from './icons';

const NO_OPTIONS = {
  destinations: [],
  platforms: [],
  testTypes: [],
  negativeVariants: [],
  requirementSources: [],
  agent: { enabled: false, templates: [], categories: [], priorities: [], languages: [], sources: {} },
};

const NAV = [
  { key: 'cases', label: 'Test cases', icon: ListIcon },
  { key: 'classic', label: 'Quick generator', icon: WandIcon },
];

const classicTheme = buildTheme('light');

/** " Linked to QA-7, QA-9." / " 1 link failed (QA-8)." after a Jira export. */
function linkSummary(items) {
  const linked = [...new Set(items.flatMap((i) => i.linked ?? []))];
  const failed = [...new Set(items.flatMap((i) => i.failed ?? []))];
  return (
    (linked.length ? ` Linked to ${linked.join(', ')}.` : '') +
    (failed.length ? ` Could not link to ${failed.join(', ')} — check the issues exist.` : '')
  );
}

const TOAST_TONE = {
  success: { color: 'var(--tm-ok)', icon: <CheckIcon size={16} /> },
  error: { color: 'var(--tm-bad)', icon: '!' },
  info: { color: 'var(--tm-primary)', icon: 'i' },
};

/**
 * The test management shell: a top bar, a left navigation, the test case
 * list with its AI generator, and the earlier one-note generator kept as
 * "Quick generator". It owns the shared state -- options, the Atlassian
 * session, the repository and the agent -- so a generation keeps running
 * while the reviewer moves around.
 */
export default function TestManagement({ onSignOut }) {
  const [options, setOptions] = useState(NO_OPTIONS);
  const [auth, setAuth] = useState(null);
  const [page, setPage] = useState('cases');
  const [folderId, setFolderId] = useState(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [toast, setToast] = useState(null);

  const notify = useCallback((t) => setToast({ ...t, id: Date.now() }), []);
  const repo = useRepository({ notify });
  const agent = useTestCaseAgent({ agentOptions: options.agent, notify });

  const refreshAuth = useCallback(() => api.getAuthStatus().then(setAuth).catch(() => setAuth({ connected: false })), []);

  useEffect(() => {
    api.getOptions().then(setOptions).catch(() => notify({ kind: 'error', message: 'Could not load settings from the server. Is the API running?' }));
    refreshAuth();
    // The OAuth callback returns here with ?auth=…
    const flag = new URLSearchParams(window.location.search).get('auth');
    if (flag) {
      notify(flag === 'success' ? { kind: 'success', message: 'Atlassian connected.' } : { kind: 'error', message: 'Atlassian authorization did not complete.' });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [notify, refreshAuth]);

  // Keep a valid folder selected.
  useEffect(() => {
    if (repo.folders.length && !repo.folders.some((f) => f.id === folderId)) setFolderId(repo.folders[0].id);
  }, [repo.folders, folderId]);

  // A run that finishes while the generator is closed says so.
  const [wasRunning, setWasRunning] = useState(false);
  useEffect(() => {
    if (agent.running) setWasRunning(true);
    else if (wasRunning) {
      setWasRunning(false);
      if (!wizardOpen && agent.cases.length) {
        notify({ kind: 'success', message: `${agent.cases.length} test cases are ready to review.`, action: { label: 'Review', onClick: () => setWizardOpen(true) } });
      }
    }
  }, [agent.running, agent.cases.length, wasRunning, wizardOpen, notify]);

  const atlassian = options.destinations.some((d) => d.auth === 'atlassian') || options.agent.sources?.jira || options.agent.sources?.confluence;

  const openGenerator = () => setWizardOpen(true);

  const addFromAgent = async ({ folderId: target, subfolders, testCases }) => {
    const payload = testCases.map(({ id, change, ...tc }) => tc);
    const result = await repo.addCases({ folderId: target, subfolders, testCases: payload });
    if (!result) return false;
    setWizardOpen(false);
    agent.reset();
    setFolderId(target);
    setPage('cases');
    notify({ kind: 'success', message: `Added ${result.added.length} test cases to ${repo.pathOf(target) || 'the folder'}${result.folders.length ? `, in ${result.folders.length} new sub-folders` : ''}.` });
    return true;
  };

  /** The quick-create bar: the agent writes one case for a title, saved straight to the folder. */
  const quickGenerate = async (title, target) => {
    try {
      const answer = await api.runAgent(
        {
          platform: agent.input.platform,
          testType: 'regression',
          prompt: `Write exactly one test case for this title, and keep the title exactly as given: "${title}"`,
          files: [],
          template: 'steps',
          categories: [],
          priorities: options.agent.priorities,
          language: agent.input.language,
          datasets: false,
          scanRepository: true,
        },
        () => {},
      );
      const first = answer.testCases[0];
      if (!first) throw new Error('The agent returned no test case. Try a more specific title.');
      const { id, change, ...testCase } = first;
      const result = await repo.addCases({ folderId: target, subfolders: false, testCases: [{ ...testCase, title }] });
      if (!result) return false;
      notify({ kind: 'success', message: `Created ${result.added[0].key} with ${testCase.steps.length} AI-written steps.` });
      return true;
    } catch (err) {
      notify({ kind: 'error', message: err.message });
      return false;
    }
  };

  const exportCases = async (destination, cases) => {
    const label = options.destinations.find((d) => d.key === destination)?.label ?? destination;
    try {
      const result = await fileApprovedCases({ destination, testCases: cases });
      notify(
        result.kind === 'file'
          ? { kind: 'success', message: `Downloaded ${result.issueKey} with ${result.count} test cases.` }
          : {
              kind: 'success',
              message:
                `Exported ${result.items.length} test cases to ${label}: ${result.items.map((i) => i.ref).slice(0, 6).join(', ')}${result.items.length > 6 ? '…' : ''}.` +
                linkSummary(result.items),
              action: result.url ? { label: 'Open', href: result.url } : null,
            },
      );
      return true;
    } catch (err) {
      if (err.needsAuth) refreshAuth();
      notify({ kind: 'error', message: err.message, action: err.needsAuth ? { label: 'Connect', onClick: startJiraLogin } : null });
      return false;
    }
  };

  const badge = useMemo(() => {
    if (agent.running) return 'Generating';
    if (agent.cases.length) return `${agent.cases.length} to review`;
    return null;
  }, [agent.running, agent.cases.length]);

  const tone = TOAST_TONE[toast?.kind] ?? TOAST_TONE.info;

  return (
    <Box sx={{ height: '100vh', display: 'grid', gridTemplateRows: '52px 1fr', bgcolor: 'var(--tm-ground)', color: 'var(--tm-ink)' }}>
      {/* top bar */}
      <Box component="header" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, bgcolor: '#0f172a', color: '#fff' }}>
        <Box sx={{ width: 28, height: 28, borderRadius: '7px', bgcolor: '#2563eb', display: 'grid', placeItems: 'center' }}>
          <CheckIcon size={18} sx={{ strokeWidth: 2.4 }} />
        </Box>
        <Box sx={{ fontSize: 15, fontWeight: 600, letterSpacing: '-.01em' }}>Test Management</Box>
        <Box sx={{ fontSize: 13, color: '#94a3b8', borderLeft: '1px solid #334155', pl: 1.5, display: { xs: 'none', sm: 'block' } }}>Default project</Box>
        <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {!options.agent.enabled && (
            <Box sx={{ fontSize: 12.5, color: '#fbbf24', display: { xs: 'none', md: 'block' } }}>AI is off: set ANTHROPIC_API_KEY</Box>
          )}
          <JiraStatus enabled={options.destinations.some((d) => d.key === 'jira')} />
          {onSignOut && (
            <Button size="small" onClick={onSignOut} sx={{ color: '#cbd5e1', minWidth: 0, '&:hover': { bgcolor: '#1e293b' } }}>
              Sign out
            </Button>
          )}
          {atlassian &&
            (auth?.connected ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: 13, color: '#cbd5e1' }}>
                <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: '#22c55e' }} />
                Atlassian connected
                <Button size="small" onClick={() => api.logout().finally(refreshAuth)} sx={{ color: '#94a3b8', minWidth: 0 }}>Disconnect</Button>
              </Box>
            ) : (
              <Button size="small" variant="outlined" onClick={startJiraLogin} sx={{ color: '#fff', borderColor: '#475569', bgcolor: 'transparent', '&:hover': { bgcolor: '#1e293b', borderColor: '#64748b' } }}>
                Connect Atlassian
              </Button>
            ))}
        </Box>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '208px 1fr' }, minHeight: 0 }}>
        {/* navigation */}
        <Box component="nav" aria-label="Main" sx={{ display: { xs: 'none', sm: 'flex' }, flexDirection: 'column', gap: 0.5, p: 1.25, bgcolor: 'var(--tm-surface)', borderRight: '1px solid var(--tm-rule)' }}>
          {NAV.map(({ key, label, icon: Icon }) => {
            const active = page === key;
            return (
              <Box
                key={key}
                component="button"
                type="button"
                onClick={() => setPage(key)}
                aria-current={active ? 'page' : undefined}
                sx={{
                  all: 'unset',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.25,
                  px: 1.25,
                  py: 1,
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: active ? 600 : 500,
                  color: active ? 'var(--tm-primary-ink)' : 'var(--tm-ink-soft)',
                  bgcolor: active ? 'var(--tm-primary-soft)' : 'transparent',
                  '&:hover': { bgcolor: active ? 'var(--tm-primary-soft)' : 'var(--tm-sunken)' },
                  '&:focus-visible': { outline: '2px solid var(--tm-primary)' },
                }}
              >
                <Icon size={18} />
                {label}
              </Box>
            );
          })}
          <Box sx={{ mt: 'auto', p: 1.25, borderRadius: '8px', bgcolor: 'var(--tm-ai-soft)', display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <AiBadge size={22} />
              <Box sx={{ fontSize: 13, fontWeight: 600 }}>AI test generator</Box>
            </Box>
            <Box sx={{ fontSize: 12.5, color: 'var(--tm-muted)' }}>
              {agent.running ? 'Generating…' : agent.cases.length ? `${agent.cases.length} cases waiting for review.` : 'From PRDs, stories, designs and more.'}
            </Box>
            <Button size="small" variant="contained" onClick={openGenerator}>
              {agent.cases.length || agent.running ? 'Open' : 'Generate'}
            </Button>
          </Box>
        </Box>

        {/* page */}
        <Box component="main" sx={{ minHeight: 0, minWidth: 0, overflow: page === 'classic' ? 'auto' : 'hidden' }}>
          {page === 'cases' ? (
            <RepositoryPage
              repo={repo}
              options={options}
              folderId={folderId}
              onFolderChange={setFolderId}
              onGenerate={openGenerator}
              generateBadge={badge}
              onExport={exportCases}
              onQuickGenerate={quickGenerate}
              notify={notify}
            />
          ) : (
            <ThemeProvider theme={classicTheme}>
              <ClassicApp />
            </ThemeProvider>
          )}
        </Box>
      </Box>

      <GenerateWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        agent={agent}
        options={options}
        repo={repo}
        folderId={folderId}
        onAdd={addFromAgent}
        onConnect={startJiraLogin}
      />

      <Snackbar
        key={toast?.id}
        open={Boolean(toast)}
        autoHideDuration={toast?.kind === 'error' ? 9000 : 5000}
        onClose={(_, reason) => reason !== 'clickaway' && setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        sx={{ zIndex: 1600 }}
      >
        <Box
          role={toast?.kind === 'error' ? 'alert' : 'status'}
          sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 300, maxWidth: 520, px: 1.75, py: 1.25, bgcolor: '#111827', color: '#f9fafb', borderRadius: '8px', boxShadow: 'var(--tm-shadow-lg)', fontSize: 14 }}
        >
          <Box sx={{ width: 22, height: 22, flex: 'none', borderRadius: '50%', bgcolor: tone.color, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700 }}>
            {tone.icon}
          </Box>
          <Box sx={{ flex: 1 }}>{toast?.message}</Box>
          {toast?.action && (
            <Button
              size="small"
              href={toast.action.href}
              target={toast.action.href ? '_blank' : undefined}
              onClick={() => {
                toast.action.onClick?.();
                setToast(null);
              }}
              sx={{ color: '#93c5fd', minWidth: 0 }}
            >
              {toast.action.label}
            </Button>
          )}
          <IconButton size="small" onClick={() => setToast(null)} aria-label="Dismiss" sx={{ color: '#9ca3af' }}>
            <CloseIcon size={15} />
          </IconButton>
        </Box>
      </Snackbar>
    </Box>
  );
}
