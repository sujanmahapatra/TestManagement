import { Box } from '@mui/material';
import { MONO } from '../theme';

/**
 * The handful of primitives the layout is built from. They read the design
 * tokens as CSS variables, so they follow the light/dark scheme without
 * knowing which one is active.
 */

export function Panel({ children, sx, ...rest }) {
  return (
    <Box
      component="section"
      sx={{
        bgcolor: 'var(--surface)',
        border: '1px solid var(--rule)',
        borderRadius: '7px',
        boxShadow: 'var(--shadow)',
        minWidth: 0,
        ...sx,
      }}
      {...rest}
    >
      {children}
    </Box>
  );
}

export function PanelHead({ children, sx }) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
        px: 2,
        py: 1.5,
        borderBottom: '1px solid var(--rule)',
        flexWrap: 'wrap',
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}

/** Small uppercase monospace label: panel titles and list headings. */
export function Eyebrow({ children, component = 'span', sx }) {
  return (
    <Box
      component={component}
      sx={{
        m: 0,
        fontFamily: MONO,
        fontSize: 11,
        fontWeight: 500,
        textTransform: 'uppercase',
        letterSpacing: '.09em',
        color: 'var(--muted)',
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}

const CHIP_TONES = {
  plain: { bg: 'transparent', border: 'var(--rule-strong)', color: 'var(--ink-soft)' },
  accent: { bg: 'var(--accent-soft)', border: 'transparent', color: 'var(--accent-ink)' },
  ok: { bg: 'var(--ok-soft)', border: 'transparent', color: 'var(--ok)' },
  warn: { bg: 'var(--warn-soft)', border: 'transparent', color: 'var(--warn)' },
  bad: { bg: 'var(--bad-soft)', border: 'transparent', color: 'var(--bad)' },
};

/** Pill-shaped monospace status tag, optionally with a leading dot. */
export function Chip({ children, tone = 'plain', dot = false, title, sx }) {
  const t = CHIP_TONES[tone];
  return (
    <Box
      component="span"
      title={title}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        fontFamily: MONO,
        fontSize: 11.5,
        letterSpacing: '.02em',
        px: '8px',
        py: '3px',
        borderRadius: '20px',
        border: `1px solid ${t.border}`,
        bgcolor: t.bg,
        color: t.color,
        whiteSpace: 'nowrap',
        lineHeight: 1.4,
        ...sx,
      }}
    >
      {dot && <Box component="span" sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'currentColor', flex: 'none' }} />}
      {children}
    </Box>
  );
}

/**
 * A labelled control: label above, control, then one line underneath for a
 * hint or the error (which replaces the hint) and an optional counter.
 */
export function Field({ label, htmlFor, required, hint, error, count, children }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '5px', minWidth: 0 }}>
      <Box
        component="label"
        htmlFor={htmlFor}
        sx={{ fontSize: 12.5, fontWeight: 500, color: 'var(--ink-soft)', display: 'flex', alignItems: 'baseline', gap: '5px' }}
      >
        {label}
        {required && (
          <Box
            component="span"
            aria-hidden
            sx={{ fontFamily: MONO, fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--muted)' }}
          >
            required
          </Box>
        )}
      </Box>
      {children}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1.25, fontSize: 11.5, color: 'var(--muted)', minHeight: 15 }}>
        <Box component="span" sx={error ? { color: 'var(--bad)', fontWeight: 500 } : undefined}>
          {error ?? hint}
        </Box>
        {count && (
          <Box component="span" sx={{ fontFamily: MONO, fontVariantNumeric: 'tabular-nums', flex: 'none' }}>
            {count}
          </Box>
        )}
      </Box>
    </Box>
  );
}

/** Compact monospace segmented tabs, as used in panel headers. */
export function Tabs({ value, options, onChange, disabled, label, sx }) {
  return (
    <Box role="tablist" aria-label={label} sx={{ display: 'flex', gap: '2px', ...sx }}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Box
            key={o.value}
            component="button"
            type="button"
            role="tab"
            aria-selected={selected}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            sx={{
              fontFamily: MONO,
              fontSize: 11.5,
              letterSpacing: '.03em',
              px: '10px',
              py: '5px',
              borderRadius: '4px',
              cursor: disabled ? 'not-allowed' : 'pointer',
              border: '1px solid',
              borderColor: selected ? 'color-mix(in srgb, var(--accent) 25%, transparent)' : 'transparent',
              bgcolor: selected ? 'var(--accent-soft)' : 'transparent',
              color: selected ? 'var(--accent-ink)' : 'var(--muted)',
              '&:focus-visible': { outline: '2px solid var(--accent)', outlineOffset: 2 },
              '&:disabled': { opacity: 0.55 },
            }}
          >
            {o.label}
          </Box>
        );
      })}
    </Box>
  );
}
