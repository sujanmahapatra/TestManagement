import { useEffect, useState } from 'react';
import { Box, Button, Drawer, IconButton, InputBase, MenuItem, OutlinedInput, Select } from '@mui/material';
import { EditableList, PayloadView, lineSx } from '../components/EditableTestCase';
import { CloseIcon, PriorityIcon } from './icons';
import { PRIORITY_STYLE } from './theme';
import { TEMPLATE_LABELS } from './SettingsPopover';

const ctrlSx = { width: 24, height: 24, fontSize: 13, color: 'var(--tm-muted)', '&:hover': { color: 'var(--tm-ink)' } };

export const Label = ({ children }) => (
  <Box component="h3" sx={{ m: 0, fontSize: 12, fontWeight: 600, color: 'var(--tm-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
    {children}
  </Box>
);

/** Steps paired with their own expected result, kept index-aligned. */
export function StepsEditor({ steps, results, onChange }) {
  const aligned = () => steps.map((_, i) => results[i] ?? '');
  const edit = (index, key, value) => {
    const s = [...steps];
    const r = aligned();
    (key === 'action' ? s : r)[index] = value;
    onChange(s, r);
  };
  const remove = (index) => onChange(steps.filter((_, i) => i !== index), aligned().filter((_, i) => i !== index));
  const move = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= steps.length) return;
    const s = [...steps];
    const r = aligned();
    [s[index], s[target]] = [s[target], s[index]];
    [r[index], r[target]] = [r[target], r[index]];
    onChange(s, r);
  };

  return (
    <Box sx={{ border: '1px solid var(--tm-rule)', borderRadius: '8px', overflow: 'hidden' }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: '36px 1fr 1fr 76px',
          bgcolor: 'var(--tm-sunken)',
          borderBottom: '1px solid var(--tm-rule)',
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--tm-muted)',
          '& > span': { px: 1, py: 0.75 },
        }}
      >
        <span>#</span>
        <span>Step</span>
        <span>Expected result</span>
        <span />
      </Box>
      {steps.map((step, index) => (
        <Box
          key={index}
          sx={{
            display: 'grid',
            gridTemplateColumns: '36px 1fr 1fr 76px',
            alignItems: 'start',
            borderTop: index ? '1px solid var(--tm-rule)' : 0,
            '& .ctrl': { opacity: 0 },
            '&:hover .ctrl, &:focus-within .ctrl': { opacity: 1 },
          }}
        >
          <Box sx={{ px: 1, py: '9px', fontSize: 12.5, color: 'var(--tm-muted)', fontVariantNumeric: 'tabular-nums' }}>{index + 1}</Box>
          <InputBase value={step} onChange={(e) => edit(index, 'action', e.target.value)} multiline sx={{ ...lineSx, m: '3px' }} inputProps={{ 'aria-label': `Step ${index + 1}` }} />
          <InputBase
            value={results[index] ?? ''}
            onChange={(e) => edit(index, 'expected', e.target.value)}
            multiline
            placeholder="—"
            sx={{ ...lineSx, m: '3px', color: 'var(--tm-ink)' }}
            inputProps={{ 'aria-label': `Expected result of step ${index + 1}` }}
          />
          <Box className="ctrl" sx={{ display: 'flex', pt: '5px', transition: 'opacity .12s' }}>
            <IconButton size="small" sx={ctrlSx} onClick={() => move(index, -1)} disabled={index === 0} title="Move up">↑</IconButton>
            <IconButton size="small" sx={ctrlSx} onClick={() => move(index, 1)} disabled={index === steps.length - 1} title="Move down">↓</IconButton>
            <IconButton size="small" sx={ctrlSx} onClick={() => remove(index)} disabled={steps.length === 1} title="Remove">×</IconButton>
          </Box>
        </Box>
      ))}
      <Button size="small" variant="text" onClick={() => onChange([...steps, ''], [...aligned(), ''])} sx={{ m: 0.75 }}>
        + Add step
      </Button>
    </Box>
  );
}

/** The dataset as an editable grid: one column per variable, one row per run. */
export function DatasetEditor({ dataset, onChange }) {
  const { columns, rows } = dataset;
  const setCell = (r, c, value) => onChange({ columns, rows: rows.map((row, i) => (i === r ? row.map((v, j) => (j === c ? value : v)) : row)) });
  const removeRow = (r) => onChange(rows.length > 1 ? { columns, rows: rows.filter((_, i) => i !== r) } : null);

  return (
    <Box sx={{ border: '1px solid var(--tm-rule)', borderRadius: '8px', overflowX: 'auto' }}>
      <Box component="table" sx={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
        <thead>
          <tr>
            <Box component="th" sx={{ width: 52, px: 1, py: 0.75, textAlign: 'left', bgcolor: 'var(--tm-sunken)', color: 'var(--tm-muted)', fontWeight: 600, fontSize: 12 }}>Run</Box>
            {columns.map((c) => (
              <Box component="th" key={c} sx={{ px: 1, py: 0.75, textAlign: 'left', bgcolor: 'var(--tm-sunken)', color: 'var(--tm-muted)', fontWeight: 600, fontSize: 12 }}>
                {c}
              </Box>
            ))}
            <Box component="th" sx={{ width: 32, bgcolor: 'var(--tm-sunken)' }} />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <Box component="tr" key={r} sx={{ borderTop: '1px solid var(--tm-rule)' }}>
              <Box component="td" sx={{ px: 1, color: 'var(--tm-muted)' }}>{r + 1}</Box>
              {row.map((value, c) => (
                <td key={c}>
                  <InputBase value={value} onChange={(e) => setCell(r, c, e.target.value)} sx={{ ...lineSx, m: '2px', fontSize: 13 }} inputProps={{ 'aria-label': `${columns[c]}, run ${r + 1}` }} />
                </td>
              ))}
              <td>
                <IconButton size="small" sx={ctrlSx} onClick={() => removeRow(r)} title="Remove run">×</IconButton>
              </td>
            </Box>
          ))}
        </tbody>
      </Box>
      <Button size="small" variant="text" onClick={() => onChange({ columns, rows: [...rows, columns.map(() => '')] })} sx={{ m: 0.75 }}>
        + Add run
      </Button>
    </Box>
  );
}

/** The Jira stories this case tests; filing to Jira links the new issue to each. */
export function LinksEditor({ links, onChange }) {
  const [value, setValue] = useState('');
  const key = value.trim().toUpperCase();
  const valid = /^[A-Z][A-Z0-9_]+-\d+$/.test(key);
  const add = () => {
    if (valid && !links.includes(key) && links.length < 10) onChange([...links, key]);
    setValue('');
  };
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
      <Label>Linked requirements</Label>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, alignItems: 'center' }}>
        {links.map((k) => (
          <Box key={k} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, pl: 1, pr: 0.25, py: '2px', borderRadius: '6px', bgcolor: 'var(--tm-primary-soft)', color: 'var(--tm-primary-ink)', fontSize: 13, fontWeight: 500 }}>
            {k}
            <IconButton size="small" aria-label={`Remove link to ${k}`} onClick={() => onChange(links.filter((l) => l !== k))} sx={{ p: '2px', color: 'inherit' }}>
              <CloseIcon size={12} />
            </IconButton>
          </Box>
        ))}
        <OutlinedInput
          size="small"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          onBlur={() => valid && add()}
          placeholder="Add issue key, e.g. QA-12"
          inputProps={{ 'aria-label': 'Add a linked Jira issue', maxLength: 30 }}
          sx={{ width: 190, '& input': { py: '5px' } }}
        />
      </Box>
      <Box sx={{ fontSize: 12, color: 'var(--tm-muted)' }}>Filing to Jira links the test case to these issues.</Box>
    </Box>
  );
}

/**
 * View and edit one test case, in a panel over the right edge. Edits stay in
 * the panel until saved, so closing discards them.
 */
export default function CaseDrawer({ testCase, open, options, onSave, onClose, saving, subtitle }) {
  const [draft, setDraft] = useState(testCase);
  const [tab, setTab] = useState('details');
  const [destination, setDestination] = useState(options.destinations[0]?.key ?? '');

  useEffect(() => {
    setDraft(testCase);
    setTab('details');
  }, [testCase]);

  if (!draft) return null;
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const perStep = draft.stepResults?.length > 0;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { width: { xs: '100%', md: 640 }, bgcolor: 'var(--tm-surface)', fontFamily: 'inherit' } }}
      sx={{ zIndex: 1400 }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Box sx={{ px: 3, pt: 2.5, pb: 0, borderBottom: '1px solid var(--tm-rule)' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Box sx={{ fontSize: 12.5, color: 'var(--tm-muted)', fontWeight: 500 }}>{subtitle}</Box>
            <IconButton onClick={onClose} aria-label="Close" sx={{ ml: 'auto', color: 'var(--tm-muted)' }}>
              <CloseIcon size={18} />
            </IconButton>
          </Box>
          <InputBase
            value={draft.title}
            onChange={(e) => set({ title: e.target.value })}
            multiline
            fullWidth
            inputProps={{ 'aria-label': 'Title' }}
            sx={{ ...lineSx, ml: '-6px', fontSize: 18, fontWeight: 600, color: 'var(--tm-ink)' }}
          />
          <Box role="tablist" sx={{ display: 'flex', gap: 2.5, mt: 1.5 }}>
            {[
              ['details', 'Details'],
              ['payload', 'Payload'],
            ].map(([key, label]) => (
              <Box
                key={key}
                component="button"
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                sx={{
                  all: 'unset',
                  cursor: 'pointer',
                  pb: 1.25,
                  fontSize: 14,
                  fontWeight: 500,
                  color: tab === key ? 'var(--tm-primary)' : 'var(--tm-muted)',
                  borderBottom: '2px solid',
                  borderColor: tab === key ? 'var(--tm-primary)' : 'transparent',
                  '&:focus-visible': { outline: '2px solid var(--tm-primary)', outlineOffset: 2 },
                }}
              >
                {label}
              </Box>
            ))}
          </Box>
        </Box>

        <Box sx={{ flex: 1, overflowY: 'auto', px: 3, py: 2.5 }}>
          {tab === 'details' ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
                <Box>
                  <Label>Priority</Label>
                  <Select
                    value={draft.priority ?? 'medium'}
                    onChange={(e) => set({ priority: e.target.value })}
                    input={<OutlinedInput size="small" />}
                    fullWidth
                    sx={{ mt: 0.75 }}
                    MenuProps={{ disableScrollLock: true, sx: { zIndex: 1500 } }}
                    renderValue={(p) => (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <PriorityIcon priority={p} /> {PRIORITY_STYLE[p].label}
                      </Box>
                    )}
                  >
                    {options.agent.priorities.map((p) => (
                      <MenuItem key={p} value={p} sx={{ gap: 1 }}>
                        <PriorityIcon priority={p} /> {PRIORITY_STYLE[p].label}
                      </MenuItem>
                    ))}
                  </Select>
                </Box>
                <Box>
                  <Label>Type</Label>
                  <Select
                    value={draft.category ?? 'Functional'}
                    onChange={(e) => set({ category: e.target.value })}
                    input={<OutlinedInput size="small" />}
                    fullWidth
                    sx={{ mt: 0.75 }}
                    MenuProps={{ disableScrollLock: true, sx: { zIndex: 1500 } }}
                  >
                    {options.agent.categories.map((c) => (
                      <MenuItem key={c} value={c}>{c}</MenuItem>
                    ))}
                  </Select>
                </Box>
              </Box>

              <Box>
                <Label>Description</Label>
                <OutlinedInput
                  value={draft.description ?? ''}
                  onChange={(e) => set({ description: e.target.value })}
                  multiline
                  minRows={2}
                  fullWidth
                  sx={{ mt: 0.75 }}
                  inputProps={{ maxLength: 2000, 'aria-label': 'Description' }}
                />
              </Box>

              <EditableList title="Preconditions" items={draft.preconditions} onChange={(preconditions) => set({ preconditions })} />

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                <Label>{perStep ? TEMPLATE_LABELS.steps.label : 'Steps'}</Label>
                {perStep ? (
                  <StepsEditor
                    steps={draft.steps}
                    results={draft.stepResults}
                    onChange={(steps, stepResults) => {
                      const asserted = stepResults.filter((r) => r.trim());
                      set({ steps, stepResults, expectedResults: asserted.length ? asserted : draft.expectedResults });
                    }}
                  />
                ) : (
                  <>
                    <EditableList title="Steps" items={draft.steps} ordered onChange={(steps) => set({ steps })} />
                    <EditableList title="Expected results" items={draft.expectedResults} onChange={(expectedResults) => set({ expectedResults })} />
                  </>
                )}
              </Box>

              {draft.dataset && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                  <Label>Dataset</Label>
                  <DatasetEditor dataset={draft.dataset} onChange={(dataset) => set({ dataset })} />
                </Box>
              )}

              <LinksEditor links={draft.links ?? []} onChange={(links) => set({ links })} />

              {draft.source?.excerpt && (
                <Box sx={{ borderLeft: '3px solid var(--tm-ai)', bgcolor: 'var(--tm-ai-soft)', borderRadius: '0 6px 6px 0', px: 1.5, py: 1, fontSize: 13.5, color: 'var(--tm-ink-soft)' }}>
                  <Box sx={{ fontSize: 12, fontWeight: 600, color: 'var(--tm-ai)', mb: 0.5 }}>Primary source · {draft.source.name}</Box>
                  “{draft.source.excerpt}”
                </Box>
              )}
            </Box>
          ) : (
            <Box sx={{ mx: -3, my: -2.5 }}>
              <Box sx={{ px: 3, py: 1.5, display: 'flex', alignItems: 'center', gap: 1, borderBottom: '1px solid var(--tm-rule)', fontSize: 13.5, color: 'var(--tm-muted)' }}>
                What
                <Select
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  input={<OutlinedInput size="small" />}
                  MenuProps={{ disableScrollLock: true, sx: { zIndex: 1500 } }}
                  sx={{ minWidth: 160 }}
                >
                  {options.destinations.map((d) => (
                    <MenuItem key={d.key} value={d.key}>{d.label}</MenuItem>
                  ))}
                </Select>
                would receive for this case
              </Box>
              <PayloadView testCase={draft} destination={destination} />
            </Box>
          )}
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, px: 3, py: 1.5, borderTop: '1px solid var(--tm-rule)' }}>
          <Button variant="outlined" onClick={onClose}>Cancel</Button>
          <Button variant="contained" onClick={() => onSave(draft)} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </Box>
      </Box>
    </Drawer>
  );
}
