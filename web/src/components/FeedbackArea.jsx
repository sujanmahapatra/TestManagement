import { Box, Button, IconButton, Link } from '@mui/material';
import { MONO } from '../theme';

const TONES = {
  success: { bg: 'var(--ok-soft)', color: 'var(--ok)', border: 'var(--ok)' },
  error: { bg: 'var(--bad-soft)', color: 'var(--bad)', border: 'var(--bad)' },
  info: { bg: 'var(--accent-soft)', color: 'var(--accent-ink)', border: 'var(--accent)' },
};

/**
 * The single place outcomes are reported. Taking `status` as data rather than
 * rendering alerts at each call site keeps success and failure phrasing
 * consistent across the app.
 *
 * status: { kind: 'success' | 'error' | 'info', message, title?, issueKey?, url?,
 *           details?: string[], needsAuth?: boolean }
 */
export default function FeedbackArea({ status, onConnect, onDismiss }) {
  if (!status) return null;

  const kind = status.kind === 'success' ? 'success' : status.kind === 'info' ? 'info' : 'error';
  const tone = TONES[kind];
  const title =
    status.kind === 'success' ? `Created ${status.issueKey}` : status.title ?? 'Could not create the test case';

  return (
    <Box
      role="status"
      aria-live="polite"
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1.25,
        px: '14px',
        py: '11px',
        borderRadius: '7px',
        border: '1px solid',
        borderColor: `color-mix(in srgb, ${tone.border} 28%, transparent)`,
        bgcolor: tone.bg,
        color: tone.color,
        fontSize: 13,
      }}
    >
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Box component="strong" sx={{ display: 'block', fontSize: 13.5, mb: '1px' }}>
          {title}
        </Box>
        {status.message}

        {status.details?.length > 0 && (
          <Box component="ul" sx={{ m: '5px 0 0', pl: '17px' }}>
            {status.details.map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </Box>
        )}

        {status.url && (
          <Box sx={{ mt: '5px' }}>
            <Link href={status.url} target="_blank" rel="noreferrer" sx={{ color: 'inherit', fontFamily: MONO }}>
              Open {status.issueKey}
            </Link>
          </Box>
        )}
      </Box>

      {status.needsAuth && (
        <Button size="small" variant="contained" onClick={onConnect} sx={{ py: '3px', flex: 'none' }}>
          Connect
        </Button>
      )}
      <IconButton size="small" onClick={onDismiss} aria-label="Dismiss" sx={{ color: 'inherit', mt: '-3px', mr: '-6px' }}>
        ×
      </IconButton>
    </Box>
  );
}
