import { useState } from 'react';
import { Box, Button, IconButton, InputBase, MenuItem, OutlinedInput, Select } from '@mui/material';
import { EditableList, lineSx } from '../components/EditableTestCase';
import { DatasetEditor, Label, LinksEditor, StepsEditor } from './CaseDrawer';
import { ChevronRight, PaperclipIcon, PriorityIcon, SparkleIcon } from './icons';
import { PRIORITY_STYLE } from './theme';

const HINT_KEY = 'tm.inlineEditHint';
const hintSeen = () => {
  try {
    return localStorage.getItem(HINT_KEY) === '1';
  } catch {
    return false;
  }
};

/**
 * One generated case, beside the list, edited in place: every change applies
 * as it is typed, so there is nothing to save before adding. "Add Test Case"
 * files just this one to the chosen folder.
 */
export default function CaseDetailsPane({ testCase, options, files, addedKey, adding, onChange, onAdd, onClose, exporting = false }) {
  const [showHint, setShowHint] = useState(() => !hintSeen());
  const set = (patch) => onChange({ ...testCase, ...patch });
  const perStep = testCase.stepResults?.length > 0;
  const dismissHint = () => {
    setShowHint(false);
    try {
      localStorage.setItem(HINT_KEY, '1');
    } catch {
      // the hint simply shows again next time
    }
  };

  const select = (value, items, onPick, render) => (
    <Select
      value={value}
      onChange={(e) => onPick(e.target.value)}
      input={<OutlinedInput size="small" />}
      fullWidth
      MenuProps={{ disableScrollLock: true, sx: { zIndex: 1500 } }}
      renderValue={render}
    >
      {items.map((i) => (
        <MenuItem key={i} value={i} sx={{ gap: 1 }}>
          {render ? render(i) : i}
        </MenuItem>
      ))}
    </Select>
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%', borderLeft: '1px solid var(--tm-rule)', bgcolor: 'var(--tm-surface)' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1.25, borderBottom: '1px solid var(--tm-rule)' }}>
        <IconButton size="small" onClick={onClose} aria-label="Back to the list" sx={{ color: 'var(--tm-muted)', transform: 'rotate(180deg)' }}>
          <ChevronRight size={18} />
        </IconButton>
        <Box sx={{ fontSize: 12.5, fontWeight: 600, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--tm-ink-soft)' }}>Test case details</Box>
        <Box sx={{ ml: 'auto', display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: 12, fontWeight: 500, color: 'var(--tm-ai)', bgcolor: 'var(--tm-ai-soft)', px: 1, py: '2px', borderRadius: '10px' }}>
          <SparkleIcon size={12} /> AI Generated
        </Box>
      </Box>

      {showHint && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1, bgcolor: 'var(--tm-sunken)', fontSize: 12.5, color: 'var(--tm-muted)' }}>
          You can tweak test details by inline editing before saving.
          <Button size="small" variant="text" onClick={dismissHint} sx={{ ml: 'auto', minWidth: 0, fontSize: 12.5, color: 'var(--tm-ink)' }}>
            Okay, got it
          </Button>
        </Box>
      )}

      <Box sx={{ flex: 1, overflowY: 'auto', px: 2, py: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <InputBase
          value={testCase.title}
          onChange={(e) => set({ title: e.target.value })}
          multiline
          fullWidth
          inputProps={{ 'aria-label': 'Title' }}
          sx={{ ...lineSx, ml: '-6px', fontSize: 16, fontWeight: 600, color: 'var(--tm-ink)' }}
        />

        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.25 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Label>Type</Label>
            {select(testCase.category ?? 'Functional', options.agent.categories, (category) => set({ category }))}
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Label>Priority</Label>
            {select(testCase.priority ?? 'medium', options.agent.priorities, (priority) => set({ priority }), (p) => (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <PriorityIcon priority={p} /> {PRIORITY_STYLE[p]?.label}
              </Box>
            ))}
          </Box>
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Label>Description</Label>
          <OutlinedInput
            value={testCase.description ?? ''}
            onChange={(e) => set({ description: e.target.value })}
            multiline
            minRows={3}
            fullWidth
            inputProps={{ maxLength: 2000, 'aria-label': 'Description' }}
          />
        </Box>

        <EditableList title="Preconditions" items={testCase.preconditions} ordered addLabel="Add precondition" onChange={(preconditions) => set({ preconditions })} />

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          <Label>Steps &amp; results</Label>
          {perStep ? (
            <StepsEditor
              steps={testCase.steps}
              results={testCase.stepResults}
              onChange={(steps, stepResults) => {
                const asserted = stepResults.filter((r) => r.trim());
                set({ steps, stepResults, expectedResults: asserted.length ? asserted : testCase.expectedResults });
              }}
            />
          ) : (
            <>
              <EditableList title="Steps" items={testCase.steps} ordered onChange={(steps) => set({ steps })} />
              <EditableList title="Expected results" items={testCase.expectedResults} onChange={(expectedResults) => set({ expectedResults })} />
            </>
          )}
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          <Label>Additional data</Label>
          {testCase.dataset ? (
            <DatasetEditor dataset={testCase.dataset} onChange={(dataset) => set({ dataset })} />
          ) : (
            <Box sx={{ fontSize: 13.5, color: 'var(--tm-faint)' }}>--</Box>
          )}
        </Box>

        <LinksEditor links={testCase.links ?? []} onChange={(links) => set({ links })} />

        {testCase.source?.excerpt && (
          <Box sx={{ borderLeft: '3px solid var(--tm-ai)', bgcolor: 'var(--tm-ai-soft)', borderRadius: '0 6px 6px 0', px: 1.5, py: 1, fontSize: 13.5, color: 'var(--tm-ink-soft)' }}>
            <Box sx={{ fontSize: 12, fontWeight: 600, color: 'var(--tm-ai)', mb: 0.5 }}>Primary source · {testCase.source.name}</Box>
            “{testCase.source.excerpt}”
          </Box>
        )}

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          <Label>Attachments</Label>
          {files.length ? (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {files.map((f) => (
                <Box
                  key={f.name}
                  title={f.name}
                  sx={{ display: 'flex', alignItems: 'center', gap: 0.75, maxWidth: 220, px: 1.25, py: 1, border: '1px solid var(--tm-rule)', borderRadius: '8px', fontSize: 12.5, color: 'var(--tm-ink-soft)' }}
                >
                  <PaperclipIcon size={15} sx={{ color: 'var(--tm-muted)' }} />
                  <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</Box>
                </Box>
              ))}
            </Box>
          ) : (
            <Box sx={{ fontSize: 13.5, color: 'var(--tm-faint)' }}>--</Box>
          )}
        </Box>
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, px: 2, py: 1.25, borderTop: '1px solid var(--tm-rule)' }}>
        {addedKey ? (
          <Box sx={{ fontSize: 13.5, color: 'var(--tm-ok)', fontWeight: 500, py: 1 }}>{exporting ? 'Exported' : 'Added'} as {addedKey}</Box>
        ) : (
          <Button variant="outlined" onClick={onAdd} disabled={adding}>
            {exporting ? (adding ? 'Exporting…' : 'Export Test Case') : adding ? 'Adding…' : 'Add Test Case'}
          </Button>
        )}
      </Box>
    </Box>
  );
}
