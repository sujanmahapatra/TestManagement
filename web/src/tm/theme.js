import { createTheme } from '@mui/material';

/**
 * The test management look: white surfaces on a cool grey ground, one blue
 * for actions, and a violet-to-pink gradient reserved for AI. Light only, like
 * the tools it mirrors. Components read the tokens as `var(--tm-*)`.
 */
export const TM = {
  ground: '#f6f7f9',
  surface: '#ffffff',
  sunken: '#f3f4f6',
  hover: '#f5f8ff',
  ink: '#111827',
  inkSoft: '#374151',
  muted: '#6b7280',
  faint: '#9ca3af',
  rule: '#e5e7eb',
  ruleStrong: '#d1d5db',
  primary: '#2563eb',
  primaryHover: '#1d4ed8',
  primarySoft: '#eff4ff',
  primaryInk: '#1e40af',
  ai: '#7c3aed',
  aiSoft: '#f5f3ff',
  ok: '#16a34a',
  okSoft: '#ecfdf3',
  warn: '#b45309',
  warnSoft: '#fffbeb',
  bad: '#dc2626',
  badSoft: '#fef2f2',
  shadow: '0 1px 2px rgba(16, 24, 40, .06), 0 1px 3px rgba(16, 24, 40, .08)',
  shadowLg: '0 12px 32px -8px rgba(16, 24, 40, .18), 0 4px 8px -4px rgba(16, 24, 40, .06)',
};

export const AI_GRADIENT = 'linear-gradient(135deg, #8b5cf6 0%, #d946ef 55%, #f472b6 100%)';
export const HERO_GRADIENT = 'linear-gradient(180deg, #f1edff 0%, #f7f5ff 38%, #ffffff 100%)';
export const FONT = '"Inter", "Segoe UI", system-ui, -apple-system, sans-serif';

const kebab = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
export const tmVariables = Object.fromEntries(Object.entries(TM).map(([k, v]) => [`--tm-${kebab(k)}`, v]));

export const PRIORITY_STYLE = {
  critical: { label: 'Critical', color: '#dc2626', bg: '#fef2f2' },
  high: { label: 'High', color: '#ea580c', bg: '#fff7ed' },
  medium: { label: 'Medium', color: '#ca8a04', bg: '#fefce8' },
  low: { label: 'Low', color: '#16a34a', bg: '#f0fdf4' },
};

export const tmTheme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: TM.primary, dark: TM.primaryHover, contrastText: '#ffffff' },
    secondary: { main: TM.ai },
    error: { main: TM.bad },
    success: { main: TM.ok },
    warning: { main: TM.warn },
    background: { default: TM.ground, paper: TM.surface },
    text: { primary: TM.ink, secondary: TM.muted },
    divider: TM.rule,
  },
  shape: { borderRadius: 6 },
  typography: {
    fontFamily: FONT,
    fontSize: 14,
    button: { textTransform: 'none', fontWeight: 500, fontSize: 14 },
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true, disableRipple: true },
      styleOverrides: {
        root: { borderRadius: 6, padding: '7px 14px', lineHeight: 1.45 },
        sizeSmall: { padding: '4px 10px', fontSize: 13 },
        containedPrimary: { '&:hover': { backgroundColor: TM.primaryHover } },
        outlined: {
          color: TM.inkSoft,
          borderColor: TM.ruleStrong,
          backgroundColor: TM.surface,
          '&:hover': { backgroundColor: TM.sunken, borderColor: TM.ruleStrong },
        },
        text: { color: TM.primary, '&:hover': { backgroundColor: TM.primarySoft } },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: TM.surface,
          fontSize: 14,
          borderRadius: 6,
          '& .MuiOutlinedInput-notchedOutline': { borderColor: TM.ruleStrong },
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: TM.faint },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: TM.primary, borderWidth: 1 },
          '&.Mui-focused': { boxShadow: `0 0 0 3px ${TM.primarySoft}` },
        },
        input: { padding: '8px 11px' },
        multiline: { padding: '9px 11px' },
      },
    },
    MuiCheckbox: { defaultProps: { disableRipple: true, size: 'small' } },
    MuiIconButton: { defaultProps: { disableRipple: true } },
    MuiMenu: { styleOverrides: { paper: { border: `1px solid ${TM.rule}`, boxShadow: TM.shadowLg, borderRadius: 8 } } },
    MuiPopover: { styleOverrides: { paper: { border: `1px solid ${TM.rule}`, boxShadow: TM.shadowLg, borderRadius: 10 } } },
    MuiMenuItem: { styleOverrides: { root: { fontSize: 14, minHeight: 36 } } },
    MuiTooltip: { styleOverrides: { tooltip: { fontSize: 12, backgroundColor: TM.ink, borderRadius: 6 } } },
    MuiSwitch: { defaultProps: { disableRipple: true } },
  },
});
