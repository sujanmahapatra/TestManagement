import { useCallback, useEffect, useMemo, useState } from 'react';
import { Box } from '@mui/material';

import ConnectionBar from './components/ConnectionBar';
import TestCaseForm from './components/TestCaseForm';
import FeedbackArea from './components/FeedbackArea';
import GeneratedPanel from './components/EditableTestCase';
import { useTestCaseSubmission } from './hooks/useTestCaseSubmission';
import { api, startJiraLogin } from './api/client';
import { EMPTY_FORM, expectedCaseCount } from './domain/testCase';
import { MONO } from './theme';

/** Messages for the ?auth= flag the OAuth callback redirects back with. */
const AUTH_FEEDBACK = {
  success: { kind: 'success', title: 'Atlassian connected', message: 'You can now file to Jira and Confluence.' },
  denied: { kind: 'error', title: 'Authorization declined', message: 'Consent was not granted, so no session was created.' },
  invalid: { kind: 'error', title: 'Authorization failed', message: 'The callback was invalid or expired. Please try connecting again.' },
  failed: { kind: 'error', title: 'Authorization failed', message: 'The token exchange did not complete. Check the service logs.' },
};

const NO_OPTIONS = {
  destinations: [],
  platforms: [],
  testTypes: [],
  negativeVariants: [],
  requirementSources: [],
  agent: { enabled: false, templates: [], categories: [], priorities: [] },
};

export default function App() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [auth, setAuth] = useState(null);
  const [options, setOptions] = useState(NO_OPTIONS);

  const refreshAuth = useCallback(async () => {
    try {
      setAuth(await api.getAuthStatus());
    } catch {
      setAuth({ connected: false });
    }
  }, []);

  const {
    busy, errors, status, cases, edited,
    submit, fileCases, requestPreview, extractRequirements, editCases, discardEdits, setStatus, dismiss,
  } = useTestCaseSubmission({
    // Keep the chosen options; clear only the written or imported content.
    onCreated: () =>
      setForm((f) => ({
        ...EMPTY_FORM,
        destination: f.destination,
        platform: f.platform,
        testType: f.testType,
        mode: f.mode,
        sourceType: f.sourceType,
      })),
  });

  const handleExtract = async () => {
    const requirements = await extractRequirements(form);
    if (requirements) setForm((f) => ({ ...f, requirements }));
  };

  useEffect(() => {
    // Surface the OAuth outcome, then strip the query flag so a refresh does
    // not replay the message.
    const flag = new URLSearchParams(window.location.search).get('auth');
    if (flag && AUTH_FEEDBACK[flag]) {
      setStatus(AUTH_FEEDBACK[flag]);
      window.history.replaceState({}, '', window.location.pathname);
    }

    api
      .getOptions()
      .then((o) => {
        setOptions(o);
        // Adopt the server's first platform/type if the defaults are absent
        // from this deployment's generation config.
        setForm((f) => ({
          ...f,
          platform: o.platforms.some((p) => p.key === f.platform) ? f.platform : o.platforms[0]?.key,
          testType: o.testTypes.some((t) => t.key === f.testType) ? f.testType : o.testTypes[0]?.key,
          destination: o.destinations.some((d) => d.key === f.destination)
            ? f.destination
            : o.destinations[0]?.key,
        }));
      })
      .catch(() => setStatus({ kind: 'error', message: 'Could not load options from the server.' }));

    refreshAuth();
  }, [refreshAuth, setStatus]);

  const selected = options.destinations.find((d) => d.key === form.destination);

  // Only Atlassian destinations are gated on the OAuth session; Excel needs
  // nothing and the work-item trackers authenticate with a server-side PAT.
  const blockedReason = useMemo(() => {
    if (!selected || selected.auth !== 'atlassian' || auth?.connected) return null;
    return `${selected.label} needs an Atlassian connection. Connect above, or switch destination — previewing works either way.`;
  }, [selected, auth]);

  const caseCount = expectedCaseCount(form, options.testTypes, options.negativeVariants.length);

  const handleChange = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    const result = await submit(form);
    if (!result) refreshAuth(); // a 401 clears the server session
  };

  const handleDisconnect = async () => {
    await api.logout().catch(() => {});
    await refreshAuth();
    setStatus({ kind: 'info', title: 'Disconnected', message: 'The in-memory Atlassian tokens for this browser were discarded.' });
  };

  return (
    <Box sx={{ maxWidth: 1140, mx: 'auto', px: '20px', pt: '28px', pb: '40px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <Box component="header" sx={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <Box component="h1" sx={{ m: 0, fontSize: 25, fontWeight: 600, letterSpacing: '-.02em', textWrap: 'balance' }}>
            Quick generator
          </Box>
          <Box component="p" sx={{ m: '3px 0 0', color: 'var(--muted)', maxWidth: '68ch' }}>
            Expand a note about a UI component — or the requirements in a test plan, spec, backlog or
            existing suite — into preconditions, numbered steps and assertions from templates, then file
            them in Jira, Confluence, Azure DevOps, TFS, or Excel. For AI-written suites, use{' '}
            <b>Generate with AI</b> under Test cases.
          </Box>
        </div>

        <ConnectionBar
          status={auth}
          selected={selected}
          generator={options.generator}
          onConnect={startJiraLogin}
          onDisconnect={handleDisconnect}
        />
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 420px) minmax(0, 1fr)' },
          gap: '18px',
          alignItems: 'start',
        }}
      >
        <TestCaseForm
          form={form}
          errors={errors}
          busy={busy}
          options={options}
          caseCount={caseCount}
          blockedReason={blockedReason}
          onChange={handleChange}
          onSubmit={handleSubmit}
          onPreview={() => requestPreview(form)}
          onExtract={handleExtract}
        />

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '14px', minWidth: 0 }}>
          <FeedbackArea status={status} onConnect={startJiraLogin} onDismiss={dismiss} />
          <GeneratedPanel
            testCases={cases}
            edited={edited}
            disabled={busy}
            destination={form.destination}
            onChange={editCases}
            onReset={discardEdits}
          />
        </Box>
      </Box>

      <Box
        component="footer"
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '6px 18px',
          pt: '4px',
          fontSize: 12,
          color: 'var(--muted)',
          '& code': { fontFamily: MONO, fontSize: 11.5, color: 'var(--ink-soft)' },
        }}
      >
        <span>
          <code>GET /api/options</code> · <code>POST /api/import-requirements</code> ·{' '}
          <code>POST /api/agent/generate</code> ·{' '}
          <code>POST /api/create-test-case</code> → <code>201 {'{ success, items }'}</code>
        </span>
        <span>
          <code>422</code> validation · <code>401</code> not connected · <code>400</code> destination disabled ·{' '}
          <code>502</code> tracker rejected
        </span>
      </Box>
    </Box>
  );
}
