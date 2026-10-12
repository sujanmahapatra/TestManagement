import { useEffect, useRef } from 'react';
import { Box, Button } from '@mui/material';
import { AiBadge, CheckIcon, SparkleIcon } from './icons';
import { HERO_GRADIENT } from './theme';
import { AGENT_STAGES } from '../domain/agent';

/** A step's state mark: done tick, spinning ring, or empty ring. */
export function StageMark({ state, size = 20 }) {
  return (
    <Box
      aria-hidden
      sx={{
        width: size,
        height: size,
        flex: 'none',
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        border: '2px solid',
        borderColor: state === 'pending' ? 'var(--tm-rule-strong)' : 'var(--tm-ai)',
        bgcolor: state === 'done' ? 'var(--tm-ai)' : 'transparent',
        color: '#fff',
        ...(state === 'active' && {
          borderTopColor: 'transparent',
          animation: 'tm-spin .8s linear infinite',
          '@keyframes tm-spin': { to: { transform: 'rotate(360deg)' } },
          '@media (prefers-reduced-motion: reduce)': { animation: 'none', borderTopColor: 'var(--tm-ai)' },
        }),
      }}
    >
      {state === 'done' && <CheckIcon size={size * 0.62} sx={{ strokeWidth: 2.6 }} />}
    </Box>
  );
}

export const stageState = (running, index) => {
  const at = AGENT_STAGES.findIndex((s) => s.key === running.stage);
  return index < at ? 'done' : index === at ? 'active' : 'pending';
};

/** "Scanned 42 test cases · 6 related" -- what the repository scan found. */
export const contextLabel = (c) => {
  if (!c) return '';
  const parts = [];
  if (c.scanned) parts.push(`Scanned ${c.scanned} saved test cases · ${c.related} related`);
  if (c.folders) parts.push(`${c.folders} ${c.folders === 1 ? 'folder' : 'folders'} added`);
  return parts.join(' · ') || 'No saved test cases yet';
};

/**
 * The agent's reasoning as it streams: a rolling window that follows the
 * newest text, the way an AI panel shows its step-by-step analysis.
 */
export function LiveReasoning({ text, maxHeight = 180 }) {
  const box = useRef(null);
  useEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [text]);
  if (!text) return null;
  return (
    <Box sx={{ mt: 3, width: '100%', textAlign: 'left' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: 12, fontWeight: 600, color: 'var(--tm-ai)', textTransform: 'uppercase', letterSpacing: '.04em', mb: 0.75 }}>
        <SparkleIcon size={13} /> Live reasoning
      </Box>
      <Box
        ref={box}
        aria-live="off"
        sx={{
          maxHeight,
          overflowY: 'auto',
          whiteSpace: 'pre-wrap',
          fontSize: 13,
          lineHeight: 1.55,
          color: 'var(--tm-ink-soft)',
          bgcolor: 'var(--tm-ai-soft)',
          border: '1px solid #ede9fe',
          borderRadius: '8px',
          px: 1.5,
          py: 1.25,
          // Fade the oldest lines out at the top.
          maskImage: 'linear-gradient(to bottom, transparent 0, #000 28px)',
        }}
      >
        {text}
      </Box>
    </Box>
  );
}

/** Step two: what the agent is doing, while it does it. */
export default function GenerateProgress({ running, onStop, fileCount }) {
  return (
    <Box sx={{ minHeight: '100%', background: HERO_GRADIENT, display: 'grid', placeItems: 'start center', px: 2, pt: { xs: 6, md: 10 } }}>
      <Box
        aria-live="polite"
        sx={{
          width: '100%',
          maxWidth: 640,
          bgcolor: 'var(--tm-surface)',
          border: '1px solid var(--tm-rule)',
          borderRadius: '14px',
          boxShadow: 'var(--tm-shadow-lg)',
          p: { xs: 3, md: 4 },
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
        }}
      >
        <Box
          sx={{
            animation: 'tm-pulse 1.8s ease-in-out infinite',
            '@keyframes tm-pulse': { '50%': { transform: 'scale(1.08)' } },
            '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
          }}
        >
          <AiBadge size={52} />
        </Box>
        <Box component="h2" sx={{ m: '18px 0 4px', fontSize: 20, fontWeight: 600, color: 'var(--tm-ink)' }}>
          Generating test cases
        </Box>
        <Box sx={{ fontSize: 14, color: 'var(--tm-muted)', maxWidth: '40ch' }}>
          Reading your requirement{fileCount ? ` and ${fileCount} ${fileCount === 1 ? 'file' : 'files'}` : ''}. You can close this
          window — generation carries on in the background.
        </Box>

        <Box component="ol" sx={{ listStyle: 'none', m: '24px 0 0', p: 0, width: '100%', maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 1.75, textAlign: 'left' }}>
          {AGENT_STAGES.map((stage, i) => {
            const state = stageState(running, i);
            return (
              <Box component="li" key={stage.key} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, fontSize: 15 }}>
                <StageMark state={state} />
                <Box component="span" sx={{ color: state === 'pending' ? 'var(--tm-faint)' : 'var(--tm-ink)', fontWeight: state === 'active' ? 500 : 400 }}>
                  {stage.label}
                </Box>
                {stage.key === 'write' && running.drafted > 0 && (
                  <Box component="span" sx={{ ml: 'auto', fontSize: 13, color: 'var(--tm-muted)', fontVariantNumeric: 'tabular-nums' }}>
                    {running.drafted} drafted
                  </Box>
                )}
                {stage.key === 'scan' && running.context && (
                  <Box component="span" sx={{ ml: 'auto', fontSize: 13, color: 'var(--tm-muted)' }}>
                    {contextLabel(running.context)}
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>

        <LiveReasoning text={running.reasoning} />

        {running.notices?.map((n) => (
          <Box key={n} sx={{ mt: 1.5, fontSize: 13, color: 'var(--tm-warn)', bgcolor: 'var(--tm-warn-soft)', borderRadius: '6px', px: 1.25, py: 0.75, width: '100%', textAlign: 'left' }}>
            {n}
          </Box>
        ))}

        <Button variant="text" onClick={onStop} sx={{ mt: 3, color: 'var(--tm-muted)' }}>
          Stop generating
        </Button>
      </Box>
    </Box>
  );
}
