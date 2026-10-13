import { useCallback, useEffect, useState } from 'react';
import { Box, Button } from '@mui/material';
import { api, startJiraLogin } from '../api/client';

const STATUS = {
  ok: { label: 'Connected', color: 'var(--tm-ok)', bg: 'var(--tm-ok-soft)' },
  warn: { label: 'Needs attention', color: 'var(--tm-warn)', bg: 'var(--tm-warn-soft)' },
  off: { label: 'Not set up', color: 'var(--tm-muted)', bg: 'var(--tm-sunken)' },
  checking: { label: 'Checking…', color: 'var(--tm-muted)', bg: 'var(--tm-sunken)' },
};

function Card({ name, color, mark, status, detail, help, action }) {
  const s = STATUS[status];
  return (
    <Box sx={{ border: '1px solid var(--tm-rule)', borderRadius: '10px', bgcolor: 'var(--tm-surface)', p: 2, display: 'flex', flexDirection: 'column', gap: 1.25, minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
        <Box sx={{ width: 34, height: 34, borderRadius: '8px', bgcolor: color, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 15, flex: 'none' }}>{mark}</Box>
        <Box sx={{ fontSize: 15, fontWeight: 600, color: 'var(--tm-ink)' }}>{name}</Box>
        <Box sx={{ ml: 'auto', fontSize: 12, fontWeight: 600, px: 1, py: '2px', borderRadius: '10px', color: s.color, bgcolor: s.bg, whiteSpace: 'nowrap' }}>{s.label}</Box>
      </Box>
      <Box sx={{ fontSize: 13.5, color: 'var(--tm-ink-soft)', minHeight: 40 }}>{detail}</Box>
      {help && <Box sx={{ fontSize: 12.5, color: 'var(--tm-muted)' }}>{help}</Box>}
      {action}
    </Box>
  );
}

/**
 * What the app is connected to, checked live: the AI provider, Jira,
 * Confluence, Figma, and the export destinations. Settings live on the
 * server (server/.env, or Render's Environment page), so this page says
 * what to set rather than taking secrets in the browser.
 */
export default function IntegrationsPage({ options }) {
  const [jira, setJira] = useState(null);
  const jiraOn = options.destinations.some((d) => d.key === 'jira') || options.pausedDestinations?.includes('jira');

  const checkJira = useCallback(async () => {
    setJira({ checking: true });
    try {
      setJira(await api.checkJira());
    } catch (err) {
      setJira({ ok: false, message: err.message });
    }
  }, []);

  useEffect(() => {
    if (jiraOn) checkJira();
  }, [jiraOn, checkJira]);

  const has = (key) => options.destinations.some((d) => d.key === key);
  const sources = options.agent.sources ?? {};

  return (
    <Box sx={{ height: '100%', overflowY: 'auto' }}>
      <Box sx={{ px: 3, pt: 2.5, pb: 2, borderBottom: '1px solid var(--tm-rule)', bgcolor: 'var(--tm-surface)' }}>
        <Box component="h1" sx={{ m: 0, fontSize: 22, fontWeight: 600, color: 'var(--tm-ink)' }}>Integrations</Box>
        <Box sx={{ fontSize: 14, color: 'var(--tm-muted)', mt: 0.5 }}>
          Connections are configured on the server — in <code>server/.env</code> locally, or the service&apos;s Environment page on Render.
        </Box>
      </Box>
      <Box sx={{ p: 3, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 2 }}>
        <Card
          name="AI test generator"
          color="#7c3aed"
          mark="✦"
          status={options.agent.enabled ? 'ok' : 'off'}
          detail={options.agent.enabled ? `${options.agent.provider} · ${options.agent.model}` : 'No AI provider is configured, so Generate with AI cannot run.'}
          help={options.agent.enabled ? null : 'Set GROQ_API_KEY (free at console.groq.com) or ANTHROPIC_API_KEY.'}
        />
        <Card
          name="Jira"
          color="#2684ff"
          mark="J"
          status={!jiraOn ? 'off' : !jira || jira.checking ? 'checking' : jira.ok ? 'ok' : 'warn'}
          detail={!jiraOn ? 'File test cases as Jira issues, link them to their stories, and generate from Jira issues.' : jira?.message ?? 'Checking…'}
          help={jiraOn && jira?.site ? `${jira.site} · ${jira.mode === 'api-token' ? 'API token' : 'OAuth'}` : !jiraOn ? 'Set ATLASSIAN_EMAIL, ATLASSIAN_API_TOKEN, JIRA_BASE_URL, JIRA_PROJECT_KEY and add jira to DESTINATIONS.' : null}
          action={
            jiraOn && (
              <Box sx={{ display: 'flex', gap: 1 }}>
                {jira?.needsAuth && <Button size="small" variant="contained" onClick={startJiraLogin}>Connect Atlassian</Button>}
                <Button size="small" variant="outlined" onClick={checkJira} disabled={jira?.checking}>Check again</Button>
              </Box>
            )
          }
        />
        <Card
          name="Confluence"
          color="#1868db"
          mark="C"
          status={sources.confluence ? 'ok' : 'off'}
          detail={sources.confluence ? 'Pages can be imported as requirements, and test cases filed as pages.' : 'Import Confluence pages as requirements, and file test cases as pages.'}
          help={sources.confluence ? null : 'Uses the same Atlassian token as Jira; add confluence to DESTINATIONS with CONFLUENCE_SPACE_KEY.'}
        />
        <Card
          name="Figma"
          color="#a259ff"
          mark="F"
          status={sources.figma ? 'ok' : 'off'}
          detail={sources.figma ? 'Designs can be added as requirements: frames, text, components and interactions.' : 'Add design frames as requirements; the agent reads layer names, text, components and interactions.'}
          help={sources.figma ? null : 'Set FIGMA_TOKEN (Figma → Settings → Security → personal access token).'}
        />
        <Card
          name="Excel"
          color="#217346"
          mark="X"
          status={has('excel') ? 'ok' : 'off'}
          detail="Download test cases as an .xlsx workbook, one sheet per case."
        />
        <Card
          name="Azure DevOps"
          color="#0078d4"
          mark="A"
          status={has('ado') ? 'ok' : 'off'}
          detail="File test cases as Test Case work items, with the steps grid filled."
          help={has('ado') ? null : 'Set ADO_ORG_URL, ADO_PROJECT and ADO_PAT, and add ado to DESTINATIONS.'}
        />
      </Box>
    </Box>
  );
}
