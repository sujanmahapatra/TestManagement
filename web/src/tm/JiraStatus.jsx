import { useCallback, useEffect, useState } from 'react';
import { Box, Button, Popover } from '@mui/material';
import { api, startJiraLogin } from '../api/client';

/**
 * The Jira link at a glance, in the top bar: green when sign-in, project and
 * issue type all check out, amber with the fix when not. Shown only when Jira
 * is switched on.
 */
export default function JiraStatus({ enabled }) {
  const [state, setState] = useState(null); // the check's answer, or { loading }
  const [anchor, setAnchor] = useState(null);

  const check = useCallback(async () => {
    setState({ loading: true });
    try {
      setState(await api.checkJira());
    } catch (err) {
      setState({ ok: false, message: err.message });
    }
  }, []);

  useEffect(() => {
    if (enabled) check();
  }, [enabled, check]);

  if (!enabled || !state) return null;
  const ok = state.ok;
  const dot = state.loading ? '#94a3b8' : ok ? '#22c55e' : '#f59e0b';

  return (
    <>
      <Box
        component="button"
        type="button"
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-haspopup="dialog"
        sx={{
          all: 'unset',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          fontSize: 13,
          color: '#e2e8f0',
          px: 1.25,
          py: '5px',
          borderRadius: '6px',
          border: '1px solid #334155',
          '&:hover': { bgcolor: '#1e293b' },
          '&:focus-visible': { outline: '2px solid #60a5fa' },
        }}
      >
        <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: dot }} />
        {state.loading ? 'Checking Jira…' : ok ? `Jira · ${state.project?.key}` : 'Jira: needs attention'}
      </Box>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        disableScrollLock
      >
        <Box sx={{ p: 2, width: 340, display: 'flex', flexDirection: 'column', gap: 1.25, fontSize: 14 }}>
          <Box sx={{ fontWeight: 600, color: 'var(--tm-ink)' }}>Jira</Box>
          <Box sx={{ color: ok ? 'var(--tm-ink-soft)' : 'var(--tm-warn)' }}>{state.loading ? 'Checking…' : state.message}</Box>
          {state.site && (
            <Box sx={{ fontSize: 12.5, color: 'var(--tm-muted)' }}>
              {state.site} · {state.mode === 'api-token' ? 'API token' : 'OAuth'}
            </Box>
          )}
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
            {state.needsAuth && (
              <Button size="small" variant="contained" onClick={startJiraLogin}>
                Connect Atlassian
              </Button>
            )}
            <Button size="small" variant="outlined" onClick={check} disabled={state.loading}>
              Check again
            </Button>
          </Box>
        </Box>
      </Popover>
    </>
  );
}
