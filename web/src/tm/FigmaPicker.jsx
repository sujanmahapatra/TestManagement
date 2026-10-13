import { useState } from 'react';
import { Box, Button, Checkbox, Dialog, OutlinedInput } from '@mui/material';
import { api } from '../api/client';

const STEPS = [
  'Make sure you can access the Figma url.',
  'Copy the link to a page, a section, or a frame.',
  'Paste the link here.',
  'Keep only essential frames on a dedicated page for a streamlined selection.',
  'First 50 frames will be imported.',
];

const FigmaMark = () => (
  <Box component="svg" viewBox="0 0 12 18" width={12} height={18} aria-hidden sx={{ flex: 'none' }}>
    <circle cx="9" cy="9" r="3" fill="#1abcfe" />
    <path d="M3 18a3 3 0 0 0 3-3v-3H3a3 3 0 0 0 0 6z" fill="#0acf83" />
    <path d="M0 9a3 3 0 0 1 3-3h3v6H3a3 3 0 0 1-3-3z" fill="#a259ff" />
    <path d="M0 3a3 3 0 0 1 3-3h3v6H3a3 3 0 0 1-3-3z" fill="#f24e1e" />
    <path d="M6 0h3a3 3 0 0 1 0 6H6z" fill="#ff7262" />
  </Box>
);

/**
 * Figma import in two steps, as design-to-test tools do it: paste a link,
 * then pick which frames the agent should read. The chosen frames come back
 * as their structure (text, components, interactions) plus pictures.
 */
export default function FigmaPicker({ open, onClose, onImport }) {
  const [step, setStep] = useState('link'); // link | frames
  const [link, setLink] = useState('');
  const [file, setFile] = useState(null); // { fileName, maxSelect, frames }
  const [chosen, setChosen] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const close = () => {
    setStep('link');
    setFile(null);
    setChosen(new Set());
    setError(null);
    onClose();
  };

  const load = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api.listFigmaFrames(link.trim());
      setFile(result);
      // A link to a single frame preselects it; otherwise nothing is assumed.
      setChosen(new Set(result.frames.length === 1 ? [result.frames[0].id] : []));
      setStep('frames');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    const ok = await onImport(link.trim(), [...chosen]);
    setBusy(false);
    if (ok) close();
    else setError('The frames could not be imported. Try again, or choose fewer frames.');
  };

  const toggle = (id) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < (file?.maxSelect ?? 20)) next.add(id);
      return next;
    });

  return (
    <Dialog open={open} onClose={busy ? undefined : close} maxWidth="xs" fullWidth sx={{ zIndex: 1450 }} PaperProps={{ sx: { borderRadius: '12px' } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2.5, pt: 2, pb: 1.25, fontSize: 15, fontWeight: 600 }}>
        <FigmaMark /> Figma
      </Box>

      {step === 'link' ? (
        <Box component="form" onSubmit={load} sx={{ px: 2.5, pb: 2, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
          <Box component="label" htmlFor="figma-link" sx={{ fontSize: 13.5, fontWeight: 500 }}>
            Figma Link <Box component="span" sx={{ color: 'var(--tm-bad)' }}>*</Box>
          </Box>
          <OutlinedInput id="figma-link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://www.figma.com/design/…" autoFocus fullWidth size="small" />
          <Box component="ol" sx={{ m: 0, pl: 2.5, fontSize: 13, color: 'var(--tm-muted)', display: 'flex', flexDirection: 'column', gap: 0.25 }}>
            {STEPS.map((s) => <li key={s}>{s}</li>)}
          </Box>
          {error && <Box role="alert" sx={{ fontSize: 13, color: 'var(--tm-bad)' }}>{error}</Box>}
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 1 }}>
            <Button variant="outlined" onClick={close} disabled={busy}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={busy || !/figma\.com\//.test(link)}>
              {busy ? 'Loading…' : 'Import'}
            </Button>
          </Box>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2.5, pb: 1, fontSize: 13 }}>
            <Checkbox
              checked={chosen.size > 0 && chosen.size === Math.min(file.frames.length, file.maxSelect)}
              indeterminate={chosen.size > 0 && chosen.size < Math.min(file.frames.length, file.maxSelect)}
              onChange={(e) => setChosen(new Set(e.target.checked ? file.frames.slice(0, file.maxSelect).map((f) => f.id) : []))}
              sx={{ p: 0 }}
              inputProps={{ 'aria-label': 'Select frames' }}
            />
            <Box component="span" sx={{ color: 'var(--tm-ink-soft)' }}>
              {chosen.size}/{file.frames.length} frame(s) selected
            </Box>
            <Button size="small" variant="text" onClick={() => setStep('link')} sx={{ ml: 'auto', fontSize: 13 }}>
              Choose another Figma file
            </Button>
          </Box>
          <Box sx={{ maxHeight: 420, overflowY: 'auto', px: 2.5, display: 'flex', flexDirection: 'column', gap: 1.5, pb: 1.5 }}>
            {file.frames.map((f) => {
              const on = chosen.has(f.id);
              return (
                <Box
                  key={f.id}
                  component="button"
                  type="button"
                  onClick={() => toggle(f.id)}
                  aria-pressed={on}
                  sx={{
                    all: 'unset',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 0.75,
                    p: 1,
                    borderRadius: '10px',
                    border: '1.5px solid',
                    borderColor: on ? 'var(--tm-primary)' : 'var(--tm-rule)',
                    '&:focus-visible': { outline: '2px solid var(--tm-primary)' },
                  }}
                >
                  <Box sx={{ position: 'relative', borderRadius: '6px', overflow: 'hidden', bgcolor: 'var(--tm-sunken)', aspectRatio: '16 / 9', display: 'grid', placeItems: 'center' }}>
                    {f.preview ? (
                      <Box component="img" src={f.preview} alt="" sx={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    ) : (
                      <Box sx={{ fontSize: 12, color: 'var(--tm-faint)' }}>No preview</Box>
                    )}
                    <Checkbox checked={on} tabIndex={-1} sx={{ position: 'absolute', top: 4, right: 4, p: 0, bgcolor: '#fff', borderRadius: '4px' }} inputProps={{ 'aria-hidden': true }} />
                  </Box>
                  <Box sx={{ fontSize: 13.5, fontWeight: 500, color: 'var(--tm-ink)' }}>{f.name}</Box>
                  {f.width && <Box sx={{ fontSize: 12, color: 'var(--tm-muted)', mt: -0.5 }}>{f.width}×{f.height}</Box>}
                </Box>
              );
            })}
          </Box>
          {error && <Box role="alert" sx={{ px: 2.5, fontSize: 13, color: 'var(--tm-bad)' }}>{error}</Box>}
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, px: 2.5, py: 1.5, borderTop: '1px solid var(--tm-rule)' }}>
            <Button variant="outlined" onClick={close} disabled={busy}>Cancel</Button>
            <Button variant="contained" onClick={save} disabled={busy || chosen.size === 0}>
              {busy ? 'Importing…' : 'Save Selection'}
            </Button>
          </Box>
        </Box>
      )}
    </Dialog>
  );
}
