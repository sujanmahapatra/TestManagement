import { useRef, useState } from 'react';
import { Box, Button, Checkbox, MenuItem, OutlinedInput, Select } from '@mui/material';
import { Chip, Eyebrow, Field } from './ui';
import { SOURCE_LIMITS, selectedRequirements } from '../domain/testCase';
import { MONO } from '../theme';

/** Text formats the server parses. Binary documents must be exported first. */
const ACCEPT = '.txt,.md,.markdown,.csv,.tsv,.feature,.gherkin,.text';
const BINARY = /\.(docx?|pdf|xlsx?|pptx?|odt|rtf)$/i;

/**
 * The import half of the form: pick what kind of document this is, paste it
 * or load a file, extract, then tick the requirements to generate from.
 *
 * Presentational apart from reading a chosen file into text -- extraction is
 * the parent's call, and every change is reported upward.
 */
export default function RequirementsImport({ form, errors, busy, sources, onChange, onExtract }) {
  const fileInput = useRef(null);
  const [fileError, setFileError] = useState(null);

  const source = sources.find((s) => s.key === form.sourceType);
  const requirements = form.requirements ?? [];
  const selectedCount = selectedRequirements(form).length;

  const loadFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow choosing the same file again
    if (!file) return;

    if (BINARY.test(file.name)) {
      setFileError(`${file.name} is a binary document. Save it as text, Markdown or CSV and load that instead.`);
      return;
    }
    const text = await file.text();
    if (text.length > SOURCE_LIMITS.content) {
      setFileError(`${file.name} is ${text.length.toLocaleString()} characters; the limit is ${SOURCE_LIMITS.content.toLocaleString()}.`);
      return;
    }
    setFileError(null);
    onChange('sourceContent', text);
    onChange('requirements', []);
  };

  const setRequirements = (next) => onChange('requirements', next);
  const toggle = (index) =>
    setRequirements(requirements.map((r, i) => (i === index ? { ...r, selected: !r.selected } : r)));
  const toggleAll = (selected) => setRequirements(requirements.map((r) => ({ ...r, selected })));

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
      <Field label="Read requirements from" htmlFor="sourceType" hint={source?.hint} error={errors.sourceType}>
        <Select
          id="sourceType"
          value={sources.some((s) => s.key === form.sourceType) ? form.sourceType : ''}
          onChange={(e) => {
            onChange('sourceType', e.target.value);
            onChange('requirements', []);
          }}
          input={<OutlinedInput size="small" />}
          disabled={busy}
          fullWidth
          MenuProps={{ disableScrollLock: true }}
        >
          {sources.map((s) => (
            <MenuItem key={s.key} value={s.key}>
              {s.label}
            </MenuItem>
          ))}
        </Select>
      </Field>

      <Field
        label="Document"
        htmlFor="sourceContent"
        required
        hint="Paste it, or load a .txt, .md, .csv or .feature file."
        error={errors.sourceContent ?? fileError}
        count={`${form.sourceContent.length.toLocaleString()} / ${SOURCE_LIMITS.content.toLocaleString()}`}
      >
        <OutlinedInput
          id="sourceContent"
          multiline
          minRows={7}
          maxRows={16}
          value={form.sourceContent}
          onChange={(e) => {
            onChange('sourceContent', e.target.value);
            if (requirements.length) onChange('requirements', []);
          }}
          error={Boolean(errors.sourceContent || fileError)}
          disabled={busy}
          fullWidth
          sx={{ fontFamily: MONO, fontSize: 12.5, lineHeight: 1.55 }}
        />
      </Field>

      <Box sx={{ display: 'flex', gap: '9px', flexWrap: 'wrap', mt: '-4px' }}>
        <input ref={fileInput} type="file" accept={ACCEPT} hidden onChange={loadFile} />
        <Button variant="outlined" onClick={() => fileInput.current?.click()} disabled={busy}>
          Load file…
        </Button>
        <Button
          variant="outlined"
          onClick={onExtract}
          disabled={busy || !form.sourceContent.trim()}
          sx={{ color: 'var(--accent-ink)', borderColor: 'var(--accent)', '&:hover': { bgcolor: 'var(--accent-soft)', borderColor: 'var(--accent)' } }}
        >
          Extract requirements
        </Button>
      </Box>

      {requirements.length > 0 && (
        <Box sx={{ border: '1px solid var(--rule)', borderRadius: '4px', overflow: 'hidden' }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 1.5,
              py: 0.75,
              bgcolor: 'var(--surface-sunken)',
              borderBottom: '1px solid var(--rule)',
            }}
          >
            <Eyebrow>Requirements</Eyebrow>
            <Chip tone="accent">
              {selectedCount} / {requirements.length}
            </Chip>
            <Box sx={{ ml: 'auto', display: 'flex' }}>
              <Button size="small" variant="text" onClick={() => toggleAll(true)} disabled={busy}>
                All
              </Button>
              <Button size="small" variant="text" onClick={() => toggleAll(false)} disabled={busy}>
                None
              </Button>
            </Box>
          </Box>

          <Box sx={{ maxHeight: 320, overflowY: 'auto' }}>
            {requirements.map((r, index) => (
              <Box
                component="label"
                key={`${r.ref ?? ''}-${r.name}`}
                sx={{
                  display: 'flex',
                  gap: 1,
                  alignItems: 'flex-start',
                  px: 1.5,
                  py: 1,
                  cursor: 'pointer',
                  borderTop: index ? '1px solid var(--rule)' : 0,
                  opacity: r.selected ? 1 : 0.6,
                  '&:hover': { bgcolor: 'var(--surface-sunken)' },
                }}
              >
                <Checkbox checked={Boolean(r.selected)} onChange={() => toggle(index)} disabled={busy} sx={{ p: 0, mt: '2px' }} />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'baseline', flexWrap: 'wrap' }}>
                    {r.ref && (
                      <Box component="span" sx={{ fontFamily: MONO, fontSize: 11.5, color: 'var(--accent)' }}>
                        {r.ref}
                      </Box>
                    )}
                    <Box component="span" sx={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>
                      {r.name}
                    </Box>
                  </Box>
                  <Box
                    sx={{ fontSize: 11.5, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                  >
                    Expect: {r.expectedResult.replace(/\n/g, '; ')}
                  </Box>
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {errors.requirements && (
        <Box sx={{ fontSize: 11.5, color: 'var(--bad)', fontWeight: 500, mt: '-8px' }}>{errors.requirements}</Box>
      )}
    </Box>
  );
}
