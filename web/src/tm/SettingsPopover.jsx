import { useState } from 'react';
import { Box, Checkbox, Popover, Switch, Tooltip } from '@mui/material';
import { CheckIcon, ChevronRight, FolderIcon, InfoIcon, PriorityIcon } from './icons';
import { PRIORITY_STYLE } from './theme';

export const TEMPLATE_LABELS = {
  text: { label: 'Test cases (Text)', hint: 'The procedure as one paragraph, with the full expected outcome.' },
  steps: { label: 'Test cases (Steps)', hint: 'Numbered steps, each with its own expected result.' },
  bdd: { label: 'Test cases (BDD)', hint: 'Gherkin scenarios: Given, When, Then.' },
};

const rowSx = (active) => ({
  all: 'unset',
  boxSizing: 'border-box',
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: 1,
  px: 2,
  py: '9px',
  cursor: 'pointer',
  fontSize: 14,
  color: 'var(--tm-ink-soft)',
  bgcolor: active ? 'var(--tm-sunken)' : 'transparent',
  '&:hover': { bgcolor: 'var(--tm-sunken)' },
  '&:focus-visible': { outline: '2px solid var(--tm-primary)', outlineOffset: -2 },
});

function Info({ text }) {
  return (
    <Tooltip title={text} placement="top" arrow>
      <Box component="span" sx={{ color: 'var(--tm-faint)', display: 'inline-flex' }} tabIndex={0} aria-label={text}>
        <InfoIcon size={15} />
      </Box>
    </Tooltip>
  );
}

function Row({ label, info, value, active, onOpen }) {
  return (
    <Box component="button" type="button" onClick={onOpen} onMouseEnter={onOpen} aria-expanded={active} sx={rowSx(active)}>
      <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, flex: 1 }}>
        {label}
        {info && <Info text={info} />}
      </Box>
      <Box component="span" sx={{ color: 'var(--tm-muted)', fontSize: 13.5 }}>{value}</Box>
      <ChevronRight size={16} sx={{ color: 'var(--tm-faint)' }} />
    </Box>
  );
}

const SectionTitle = ({ children }) => (
  <Box sx={{ px: 2, pt: 1.5, pb: 0.75, fontSize: 13, fontWeight: 600, color: 'var(--tm-ink)' }}>{children}</Box>
);

/** One choice in a submenu: a tick for single choice, a checkbox for many. */
function Choice({ multi, checked, disabled, onClick, children, hint }) {
  return (
    <Box
      component="label"
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1,
        px: 1.75,
        py: '7px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 14,
        color: 'var(--tm-ink-soft)',
        opacity: disabled ? 0.6 : 1,
        '&:hover': { bgcolor: disabled ? 'transparent' : 'var(--tm-sunken)' },
      }}
    >
      {multi ? (
        <Checkbox checked={checked} disabled={disabled} onChange={onClick} sx={{ p: 0, mt: '1px' }} />
      ) : (
        <Box
          component="input"
          type="radio"
          checked={checked}
          disabled={disabled}
          onChange={onClick}
          sx={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
        />
      )}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>{children}</Box>
        {hint && <Box sx={{ fontSize: 12, color: 'var(--tm-muted)', mt: '2px' }}>{hint}</Box>}
      </Box>
      {!multi && checked && <CheckIcon size={16} sx={{ color: 'var(--tm-primary)', mt: '2px' }} />}
    </Box>
  );
}

const folderTree = (folders) => {
  const out = [];
  const walk = (parentId, depth) => {
    for (const f of folders.filter((x) => (x.parentId ?? null) === parentId)) {
      out.push({ ...f, depth });
      walk(f.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
};

/**
 * The generator's settings: output settings (template, types, priorities,
 * language) and general settings (platform, additional context, datasets).
 * Each row opens its choices in a panel beside it.
 */
export default function SettingsPopover({ anchorEl, open, onClose, input, change, options, folders, counts, templateLocked }) {
  const [panel, setPanel] = useState('priority');
  const agent = options.agent;

  const toggleIn = (key, value, minimum = 1) => {
    const list = input[key];
    const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
    if (next.length >= minimum) change(key, next);
  };

  const platform = options.platforms.find((p) => p.key === input.platform);
  const tree = folderTree(folders);

  const panels = {
    template: Object.entries(TEMPLATE_LABELS).map(([key, t]) => (
      <Choice key={key} checked={input.template === key} disabled={templateLocked} onClick={() => change('template', key)} hint={t.hint}>
        {t.label}
      </Choice>
    )),
    type: agent.categories.map((c) => (
      <Choice key={c} multi checked={input.categories.includes(c)} onClick={() => toggleIn('categories', c)}>
        {c}
      </Choice>
    )),
    priority: agent.priorities.map((p) => (
      <Choice key={p} multi checked={input.priorities.includes(p)} onClick={() => toggleIn('priorities', p)}>
        <PriorityIcon priority={p} />
        {PRIORITY_STYLE[p].label}
      </Choice>
    )),
    language: (agent.languages ?? ['English']).map((l) => (
      <Choice key={l} checked={input.language === l} onClick={() => change('language', l)}>
        {l}
      </Choice>
    )),
    platform: options.platforms.map((p) => (
      <Choice key={p.key} checked={input.platform === p.key} onClick={() => change('platform', p.key)}>
        {p.label}
      </Choice>
    )),
    context: tree.length ? (
      tree.map((f) => (
        <Choice key={f.id} multi checked={input.contextFolderIds.includes(f.id)} onClick={() => toggleIn('contextFolderIds', f.id, 0)}>
          <Box component="span" sx={{ pl: f.depth * 1.5, display: 'inline-flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
            <FolderIcon size={16} sx={{ color: 'var(--tm-muted)' }} />
            <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</Box>
            <Box component="span" sx={{ color: 'var(--tm-faint)', fontSize: 12.5 }}>{counts[f.id] ?? 0}</Box>
          </Box>
        </Choice>
      ))
    ) : (
      <Box sx={{ px: 2, py: 1.5, fontSize: 13, color: 'var(--tm-muted)' }}>No saved folders yet.</Box>
    ),
  };

  const panelTitle = {
    template: 'Template',
    type: 'Type',
    priority: 'Priority',
    language: 'Language',
    platform: 'Platform',
    context: 'Existing test cases to consider',
  }[panel];

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      transformOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      slotProps={{ paper: { sx: { mt: -1, overflow: 'visible' } } }}
      disableScrollLock
    >
      <Box sx={{ display: 'flex', alignItems: 'stretch' }}>
        <Box sx={{ width: 312, py: 0.5 }} role="menu" aria-label="Settings">
          <SectionTitle>Output settings (Test Cases)</SectionTitle>
          <Row
            label="Template"
            info="The shape every generated case takes. Locked once cases exist."
            value={TEMPLATE_LABELS[input.template].label}
            active={panel === 'template'}
            onOpen={() => setPanel('template')}
          />
          <Row
            label="Type"
            value={`${input.categories.length} selected`}
            active={panel === 'type'}
            onOpen={() => setPanel('type')}
          />
          <Row
            label="Priority"
            value={`${input.priorities.length} selected`}
            active={panel === 'priority'}
            onOpen={() => setPanel('priority')}
          />
          <Row
            label="Language"
            info="The language the test cases are written in. The requirement itself can be in any language."
            value={input.language}
            active={panel === 'language'}
            onOpen={() => setPanel('language')}
          />

          <Box sx={{ borderTop: '1px solid var(--tm-rule)', mt: 0.5 }} />
          <SectionTitle>General settings</SectionTitle>
          <Row label="Platform" value={platform?.label ?? input.platform} active={panel === 'platform'} onOpen={() => setPanel('platform')} />
          <Row
            label="Additional context"
            info="Folders of saved test cases the agent should know about, so it does not write them again."
            value={`${input.contextFolderIds.length} selected`}
            active={panel === 'context'}
            onOpen={() => setPanel('context')}
          />
          <Box
            component="label"
            sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 2, py: '6px', fontSize: 14, color: 'var(--tm-ink-soft)', cursor: 'pointer' }}
            onMouseEnter={() => setPanel(null)}
          >
            Scan repository
            <Info text="Look through every saved test case for ones related to this requirement, so the agent covers what is missing instead of repeating what exists." />
            <Switch checked={input.scanRepository} onChange={(e) => change('scanRepository', e.target.checked)} size="small" sx={{ ml: 'auto' }} />
          </Box>
          <Box
            component="label"
            sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 2, py: '6px', fontSize: 14, color: 'var(--tm-ink-soft)', cursor: 'pointer' }}
            onMouseEnter={() => setPanel(null)}
          >
            Include datasets
            <Info text="Cases that should run with several sets of input get a data table, one run per row." />
            <Box
              component="span"
              sx={{ fontSize: 11.5, fontWeight: 600, color: 'var(--tm-primary)', bgcolor: 'var(--tm-primary-soft)', px: '7px', py: '1px', borderRadius: '10px' }}
            >
              Beta
            </Box>
            <Switch checked={input.datasets} onChange={(e) => change('datasets', e.target.checked)} size="small" sx={{ ml: 'auto' }} />
          </Box>
        </Box>

        {panel && (
          <Box
            role="group"
            aria-label={panelTitle}
            sx={{ width: 248, borderLeft: '1px solid var(--tm-rule)', py: 0.75, maxHeight: 380, overflowY: 'auto' }}
          >
            <Box sx={{ px: 1.75, pt: 0.75, pb: 0.5, fontSize: 12, fontWeight: 600, color: 'var(--tm-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
              {panelTitle}
            </Box>
            {panels[panel]}
            {panel === 'template' && templateLocked && (
              <Box sx={{ px: 1.75, py: 1, fontSize: 12, color: 'var(--tm-muted)' }}>Start over to change the template.</Box>
            )}
          </Box>
        )}
      </Box>
    </Popover>
  );
}
