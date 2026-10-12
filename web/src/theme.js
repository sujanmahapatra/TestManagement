import { createTheme } from '@mui/material';

/**
 * Design tokens, one set per colour scheme. Components read them as CSS
 * custom properties (`var(--accent)`) so a scheme change is one swap at the
 * root; the MUI palette is derived from the same values so its own
 * components (selects, checkboxes, menus) agree with the hand-styled ones.
 */
export const TOKENS = {
  light: {
    ground: '#eef1f5',
    surface: '#ffffff',
    surfaceSunken: '#f4f6f9',
    ink: '#111823',
    inkSoft: '#3d4857',
    muted: '#5e6a7a',
    rule: '#d8dee7',
    ruleStrong: '#c2cbd7',
    accent: '#1f5fa8',
    accentSoft: '#e7eff8',
    accentInk: '#19497f',
    onAccent: '#ffffff',
    ok: '#1d7a4c',
    okSoft: '#e3f3ea',
    warn: '#8a5a0e',
    warnSoft: '#fbf0db',
    bad: '#ad3327',
    badSoft: '#fbe9e7',
    shadow: '0 1px 2px rgba(17, 24, 35, .05), 0 6px 16px -10px rgba(17, 24, 35, .18)',
  },
  dark: {
    ground: '#0c1016',
    surface: '#151b23',
    surfaceSunken: '#1b222c',
    ink: '#e5e9ef',
    inkSoft: '#c2cad6',
    muted: '#8e9aab',
    rule: '#2a333f',
    ruleStrong: '#3a4553',
    accent: '#6ba6e4',
    accentSoft: '#15283d',
    accentInk: '#a6cbf0',
    onAccent: '#0c1016',
    ok: '#5cc48c',
    okSoft: '#10281c',
    warn: '#d7a44f',
    warnSoft: '#2a2113',
    bad: '#e8857a',
    badSoft: '#2d1715',
    shadow: '0 1px 2px rgba(0, 0, 0, .4), 0 8px 20px -12px rgba(0, 0, 0, .6)',
  },
};

export const SANS = '"IBM Plex Sans", "Segoe UI", system-ui, -apple-system, sans-serif';
export const MONO = '"IBM Plex Mono", Consolas, "Cascadia Mono", monospace';

const kebab = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** `{ accentSoft: '#…' }` -> `{ '--accent-soft': '#…' }` for GlobalStyles. */
export const cssVariables = (mode) =>
  Object.fromEntries(Object.entries(TOKENS[mode]).map(([k, v]) => [`--${kebab(k)}`, v]));

export function buildTheme(mode) {
  const t = TOKENS[mode];

  return createTheme({
    palette: {
      mode,
      primary: { main: t.accent, dark: t.accentInk, contrastText: t.onAccent },
      success: { main: t.ok },
      warning: { main: t.warn },
      error: { main: t.bad },
      background: { default: t.ground, paper: t.surface },
      text: { primary: t.ink, secondary: t.muted },
      divider: t.rule,
    },
    shape: { borderRadius: 4 },
    typography: {
      fontFamily: SANS,
      fontSize: 14,
      button: { textTransform: 'none', fontWeight: 500, fontSize: 13.5 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: { fontSize: 14, lineHeight: 1.5, WebkitFontSmoothing: 'antialiased' },
          '@media (prefers-reduced-motion: reduce)': {
            '*': { transition: 'none !important', animation: 'none !important' },
          },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true, disableRipple: true },
        styleOverrides: {
          root: { padding: '8px 15px', borderRadius: 4, transition: 'background-color .12s, border-color .12s' },
          containedPrimary: { '&:hover': { backgroundColor: t.accentInk } },
          outlined: {
            color: t.inkSoft,
            borderColor: t.ruleStrong,
            '&:hover': { backgroundColor: t.surfaceSunken, borderColor: t.ruleStrong },
          },
          text: { color: t.accent, padding: '4px 8px' },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            backgroundColor: t.surface,
            fontSize: 14,
            transition: 'box-shadow .12s',
            '& .MuiOutlinedInput-notchedOutline': { borderColor: t.ruleStrong },
            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: t.muted },
            '&.Mui-focused': { boxShadow: `0 0 0 3px ${t.accentSoft}` },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: t.accent, borderWidth: 1 },
            '&.Mui-error .MuiOutlinedInput-notchedOutline': { borderColor: t.bad },
          },
          input: { padding: '8px 10px' },
          multiline: { padding: '8px 10px' },
        },
      },
      MuiCheckbox: { defaultProps: { disableRipple: true, size: 'small' } },
      MuiMenu: { styleOverrides: { paper: { border: `1px solid ${t.rule}`, boxShadow: t.shadow } } },
      MuiMenuItem: { styleOverrides: { root: { fontSize: 14 } } },
      MuiIconButton: { defaultProps: { disableRipple: true } },
    },
  });
}
