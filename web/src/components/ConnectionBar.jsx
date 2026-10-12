import { Box, Button } from '@mui/material';
import { Chip } from './ui';
import { MONO } from '../theme';

/**
 * Shows where the test case will land and, for destinations that need the
 * Atlassian OAuth session, whether that session is live. PAT-backed and
 * file destinations are always ready, so they show their auth instead.
 */
export default function ConnectionBar({ status, selected, generator, onConnect, onDisconnect }) {
  const connected = status?.connected;
  const needsAtlassian = selected?.auth === 'atlassian';

  const readiness = () => {
    if (!selected) return { label: 'Loading destinations…', tone: 'plain' };
    if (!needsAtlassian) {
      return selected.auth === 'none'
        ? { label: 'No sign-in needed', tone: 'ok' }
        : { label: 'Auth: personal access token', tone: 'ok' };
    }
    return connected
      ? { label: 'Atlassian connected', tone: 'ok' }
      : { label: 'No Atlassian session', tone: 'warn' };
  };

  const state = readiness();

  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '10px 14px',
        px: '13px',
        py: '9px',
        bgcolor: 'var(--surface)',
        border: '1px solid var(--rule)',
        borderRadius: '7px',
      }}
    >
      <Chip tone={state.tone} dot>
        {state.label}
      </Chip>

      {selected && (
        <Box component="span" sx={{ color: 'var(--muted)', fontSize: 13 }}>
          Filing to{' '}
          <Box
            component="code"
            sx={{
              fontFamily: MONO,
              fontSize: 12.5,
              color: 'var(--ink)',
              bgcolor: 'var(--surface-sunken)',
              border: '1px solid var(--rule)',
              borderRadius: '4px',
              px: '5px',
              py: '1px',
            }}
          >
            {selected.label}
          </Box>{' '}
          — {selected.target}
        </Box>
      )}

      <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1.25 }}>
        <Chip title={generator === 'llm' ? 'Claude writes the steps' : 'Deterministic templates, no network call'}>
          {generator === 'llm' ? 'LLM generation' : 'Template generator'}
        </Chip>
        {needsAtlassian &&
          (connected ? (
            <Button size="small" variant="outlined" onClick={onDisconnect} sx={{ py: '3px' }}>
              Disconnect
            </Button>
          ) : (
            <Button size="small" variant="contained" onClick={onConnect} sx={{ py: '3px' }}>
              Connect Atlassian
            </Button>
          ))}
      </Box>
    </Box>
  );
}
