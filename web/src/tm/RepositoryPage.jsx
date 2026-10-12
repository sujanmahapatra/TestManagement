import { useMemo, useState } from 'react';
import { Box, Button, Checkbox, Dialog, DialogActions, DialogContent, IconButton, InputAdornment, Menu, MenuItem, OutlinedInput, Select } from '@mui/material';
import {
  AiBadge,
  ChevronDown,
  ChevronRight,
  ExportIcon,
  FolderIcon,
  MoreIcon,
  PlusIcon,
  PriorityIcon,
  SearchIcon,
  SparkleIcon,
  TrashIcon,
} from './icons';
import { AI_GRADIENT, PRIORITY_STYLE } from './theme';
import CaseDrawer from './CaseDrawer';

const formatDate = (iso) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** A one-field dialog for naming a folder. */
function NameDialog({ state, onClose }) {
  const [name, setName] = useState(state?.initial ?? '');
  if (!state) return null;
  const submit = (e) => {
    e.preventDefault();
    if (name.trim()) state.onSubmit(name.trim());
    onClose();
  };
  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <Box component="form" onSubmit={submit}>
        <Box sx={{ px: 3, pt: 2.5, fontSize: 17, fontWeight: 600 }}>{state.title}</Box>
        <DialogContent>
          <OutlinedInput value={name} onChange={(e) => setName(e.target.value)} autoFocus fullWidth placeholder="Folder name" inputProps={{ maxLength: 120, 'aria-label': 'Folder name' }} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="outlined" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={!name.trim()}>{state.action}</Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

function FolderTree({ repo, selectedId, onSelect, onMenu }) {
  const [collapsed, setCollapsed] = useState(() => new Set());
  const children = (parentId) => repo.folders.filter((f) => (f.parentId ?? null) === parentId);

  const render = (parentId, depth) =>
    children(parentId).map((f) => {
      const kids = children(f.id);
      const open = !collapsed.has(f.id);
      const selected = f.id === selectedId;
      return (
        <Box key={f.id}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              pl: 1 + depth * 1.75,
              pr: 0.5,
              height: 34,
              borderRadius: '6px',
              cursor: 'pointer',
              bgcolor: selected ? 'var(--tm-primary-soft)' : 'transparent',
              color: selected ? 'var(--tm-primary-ink)' : 'var(--tm-ink-soft)',
              fontWeight: selected ? 500 : 400,
              '&:hover': { bgcolor: selected ? 'var(--tm-primary-soft)' : 'var(--tm-sunken)' },
              '& .tm-more': { opacity: 0 },
              '&:hover .tm-more, & .tm-more:focus-visible': { opacity: 1 },
            }}
            onClick={() => onSelect(f.id)}
          >
            <IconButton
              size="small"
              aria-label={open ? `Collapse ${f.name}` : `Expand ${f.name}`}
              onClick={(e) => {
                e.stopPropagation();
                setCollapsed((prev) => {
                  const next = new Set(prev);
                  next.has(f.id) ? next.delete(f.id) : next.add(f.id);
                  return next;
                });
              }}
              sx={{ p: '2px', visibility: kids.length ? 'visible' : 'hidden', color: 'var(--tm-faint)' }}
            >
              {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </IconButton>
            <FolderIcon open={selected} size={17} sx={{ color: selected ? 'var(--tm-primary)' : 'var(--tm-muted)' }} />
            <Box component="span" sx={{ flex: 1, minWidth: 0, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {f.name}
            </Box>
            <Box component="span" sx={{ fontSize: 12, color: 'var(--tm-faint)', fontVariantNumeric: 'tabular-nums' }}>{repo.cases.filter((c) => c.folderId === f.id).length}({repo.counts[f.id] ?? 0})</Box>
            <IconButton
              className="tm-more"
              size="small"
              aria-label={`Actions for ${f.name}`}
              onClick={(e) => {
                e.stopPropagation();
                onMenu(e.currentTarget, f);
              }}
              sx={{ p: '3px', color: 'var(--tm-muted)' }}
            >
              <MoreIcon size={16} />
            </IconButton>
          </Box>
          {open && render(f.id, depth + 1)}
        </Box>
      );
    });

  return <Box sx={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>{render(null, 0)}</Box>;
}

/** The AI entry point: the page's primary action, marked with the sparkle. */
export function GenerateButton({ onClick, badge }) {
  return (
    <Button variant="contained" onClick={onClick} startIcon={<SparkleIcon size={16} />} sx={{ fontWeight: 600, px: 1.75 }}>
      Generate with AI
      {badge && (
        <Box component="span" sx={{ ml: 1, fontSize: 11.5, fontWeight: 600, color: '#fff', background: AI_GRADIENT, px: '7px', py: '1px', borderRadius: '10px' }}>
          {badge}
        </Box>
      )}
    </Button>
  );
}

/** A new, empty case for "Create Test Case" and the quick-create bar. */
export function blankCase(options, title = '') {
  const web = options.platforms.find((p) => p.key === 'web') ?? options.platforms[0];
  return {
    title,
    description: '',
    priority: 'medium',
    category: 'Functional',
    scenario: null,
    tags: [],
    preconditions: [],
    steps: [''],
    stepResults: [''],
    expectedResults: [],
    environments: [],
    platform: web?.key ?? 'web',
    platformLabel: web?.label ?? 'Web',
    testType: 'regression',
    testTypeLabel: 'Regression',
    variant: 'happy-path',
    parameters: null,
    dataset: null,
    kind: 'positive',
  };
}

/**
 * The bar under the list: type a title and press Enter. With "AI steps" on,
 * the agent writes the steps, preconditions and expected results; off, the
 * case opens for writing by hand.
 */
function QuickCreate({ busy, aiEnabled, onCreate }) {
  const [title, setTitle] = useState('');
  const [ai, setAi] = useState(true);
  const submit = async (e) => {
    e.preventDefault();
    if (title.trim().length < 5) return;
    if (await onCreate(title.trim(), ai && aiEnabled)) setTitle('');
  };
  return (
    <Box component="form" onSubmit={submit} sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1, borderTop: '1px solid var(--tm-rule)', bgcolor: '#fafbfc' }}>
      <Box
        component="button"
        type="button"
        onClick={() => setAi((v) => !v)}
        aria-pressed={ai && aiEnabled}
        disabled={!aiEnabled}
        title={aiEnabled ? 'Let AI write the steps' : 'AI is off on this server'}
        sx={{
          all: 'unset',
          cursor: aiEnabled ? 'pointer' : 'not-allowed',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.5,
          fontSize: 12.5,
          fontWeight: 500,
          px: 1,
          py: '4px',
          borderRadius: '6px',
          border: '1px solid',
          borderColor: ai && aiEnabled ? '#ddd6fe' : 'var(--tm-rule-strong)',
          bgcolor: ai && aiEnabled ? 'var(--tm-ai-soft)' : 'var(--tm-surface)',
          color: ai && aiEnabled ? 'var(--tm-ai)' : 'var(--tm-muted)',
          '&:focus-visible': { outline: '2px solid var(--tm-primary)' },
        }}
      >
        <SparkleIcon size={13} /> AI steps
      </Box>
      <OutlinedInput
        size="small"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={ai && aiEnabled ? 'Enter test case title and press ↵ to generate test case details using AI' : 'Enter test case title and press ↵ to create it'}
        disabled={busy}
        fullWidth
        inputProps={{ maxLength: 600, 'aria-label': 'New test case title' }}
      />
      <Button type="submit" variant="text" disabled={busy || title.trim().length < 5} startIcon={busy ? null : <PlusIcon size={15} />} sx={{ flex: 'none' }}>
        {busy ? 'Creating…' : 'Create'}
      </Button>
    </Box>
  );
}

/**
 * The test case list: a folder tree, the cases in the chosen folder (and its
 * sub-folders), and actions on a selection -- export to a tracker, move,
 * delete. Opening a case shows it in the side panel for editing.
 */
export default function RepositoryPage({ repo, options, folderId, onFolderChange, onGenerate, generateBadge, onExport, onQuickGenerate, notify }) {
  const [search, setSearch] = useState('');
  const [priority, setPriority] = useState('all');
  const [category, setCategory] = useState('all');
  const [checked, setChecked] = useState(() => new Set());
  const [viewing, setViewing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [folderMenu, setFolderMenu] = useState(null); // { anchor, folder }
  const [nameDialog, setNameDialog] = useState(null);
  const [exportAnchor, setExportAnchor] = useState(null);
  const [moveAnchor, setMoveAnchor] = useState(null);
  const [moveIds, setMoveIds] = useState(null); // ids the Move menu acts on
  const [rowMenu, setRowMenu] = useState(null); // { anchor, testCase }
  const [creating, setCreating] = useState(null); // a blank case being written by hand
  const [quickBusy, setQuickBusy] = useState(false);

  const folder = repo.folders.find((f) => f.id === folderId) ?? repo.folders[0];
  const scope = folder ? repo.descendants[folder.id] : new Set();

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return repo.cases
      .filter((c) => scope?.has(c.folderId))
      .filter((c) => priority === 'all' || c.priority === priority)
      .filter((c) => category === 'all' || c.category === category)
      .filter((c) => !q || c.title.toLowerCase().includes(q) || c.key.toLowerCase().includes(q))
      .sort((a, b) => Number(a.key.slice(3)) - Number(b.key.slice(3)));
  }, [repo.cases, scope, priority, category, search]);

  const chosen = rows.filter((c) => checked.has(c.id));
  const allChecked = rows.length > 0 && chosen.length === rows.length;
  const setAll = (on) => setChecked(on ? new Set(rows.map((c) => c.id)) : new Set());
  const toggle = (id) =>
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const removeChosen = async () => {
    if (!window.confirm(`Delete ${chosen.length} ${chosen.length === 1 ? 'test case' : 'test cases'}? This cannot be undone.`)) return;
    const result = await repo.deleteCases(chosen.map((c) => c.id));
    if (result) {
      setChecked(new Set());
      notify({ kind: 'success', message: `Deleted ${result.removed} test cases.` });
    }
  };

  const folderAction = async (action) => {
    const f = folderMenu.folder;
    setFolderMenu(null);
    if (action === 'sub') setNameDialog({ title: 'New sub-folder', action: 'Create', onSubmit: async (name) => (await repo.createFolder(name, f.id)) && onFolderChange(f.id) });
    if (action === 'rename') setNameDialog({ title: 'Rename folder', action: 'Rename', initial: f.name, onSubmit: (name) => repo.renameFolder(f.id, name) });
    if (action === 'delete') {
      const count = repo.counts[f.id] ?? 0;
      if (!window.confirm(`Delete "${f.name}"${count ? ` and its ${count} test cases` : ''}? Sub-folders are deleted too.`)) return;
      const result = await repo.deleteFolder(f.id);
      if (result) {
        if (folderId === f.id) onFolderChange(null);
        notify({ kind: 'success', message: `Deleted "${f.name}".` });
      }
    }
  };

  const filterSelect = (value, onChange, items, label, render = (i) => i) => (
    <Select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      input={<OutlinedInput size="small" />}
      MenuProps={{ disableScrollLock: true }}
      inputProps={{ 'aria-label': label }}
      sx={{ fontSize: 13.5, minWidth: 128, '& .MuiSelect-select': { py: '6px' } }}
    >
      <MenuItem value="all">{label}: All</MenuItem>
      {items.map((i) => (
        <MenuItem key={i} value={i}>{render(i)}</MenuItem>
      ))}
    </Select>
  );

  const th = { textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--tm-muted)', textTransform: 'uppercase', letterSpacing: '.04em', px: 1.5, py: 1, borderBottom: '1px solid var(--tm-rule)', bgcolor: '#fafbfc', whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 1 };
  const td = { px: 1.5, py: 1.1, borderBottom: '1px solid var(--tm-rule)', fontSize: 14, color: 'var(--tm-ink-soft)', verticalAlign: 'middle' };

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '268px 1fr' }, height: '100%', minHeight: 0 }}>
      {/* folders */}
      <Box sx={{ display: { xs: 'none', md: 'flex' }, flexDirection: 'column', minHeight: 0, borderRight: '1px solid var(--tm-rule)', bgcolor: 'var(--tm-surface)' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', px: 2, pt: 2, pb: 1 }}>
          <Box sx={{ fontSize: 13, fontWeight: 600, color: 'var(--tm-ink)', flex: 1 }}>Folders</Box>
          <IconButton
            size="small"
            aria-label="New folder"
            title="New folder"
            onClick={() => setNameDialog({ title: 'New folder', action: 'Create', onSubmit: async (name) => { const f = await repo.createFolder(name, null); if (f) onFolderChange(f.id); } })}
            sx={{ color: 'var(--tm-muted)', border: '1px solid var(--tm-rule)', borderRadius: '6px', p: '4px' }}
          >
            <PlusIcon size={15} />
          </IconButton>
        </Box>
        <Box sx={{ flex: 1, overflowY: 'auto', px: 1, pb: 2 }}>
          <FolderTree repo={repo} selectedId={folder?.id} onSelect={(id) => { onFolderChange(id); setChecked(new Set()); }} onMenu={(anchor, f) => setFolderMenu({ anchor, folder: f })} />
        </Box>
      </Box>

      {/* cases */}
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
        <Box sx={{ px: 3, pt: 2.5, borderBottom: '1px solid var(--tm-rule)', bgcolor: 'var(--tm-surface)' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            <Box component="h1" sx={{ m: 0, fontSize: 22, fontWeight: 600, color: 'var(--tm-ink)', letterSpacing: '-.01em' }}>Test Cases</Box>
            <Box sx={{ ml: 'auto', display: 'flex', gap: 1, alignItems: 'center' }}>
              <IconButton
                aria-label="Export test cases"
                title={chosen.length ? `Export ${chosen.length} selected` : 'Export this folder'}
                onClick={(e) => setExportAnchor(e.currentTarget)}
                disabled={rows.length === 0}
                sx={{ border: '1px solid var(--tm-rule-strong)', borderRadius: '6px', p: '7px', color: 'var(--tm-ink-soft)' }}
              >
                <ExportIcon size={17} />
              </IconButton>
              <Button variant="outlined" onClick={() => setCreating(blankCase(options))} disabled={!folder}>
                Create Test Case
              </Button>
              <GenerateButton onClick={onGenerate} badge={generateBadge} />
            </Box>
          </Box>
          <Box role="tablist" aria-label="Test case views" sx={{ display: 'flex', gap: 2.5, mt: 1.5 }}>
            <Box
              role="tab"
              aria-selected="true"
              sx={{ pb: 1.25, fontSize: 14, fontWeight: 500, color: 'var(--tm-primary)', borderBottom: '2px solid var(--tm-primary)' }}
            >
              Repository
            </Box>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', px: 3, pt: 2, pb: 1.5 }}>
          <OutlinedInput
            size="small"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by Test Case ID or Title"
            startAdornment={<InputAdornment position="start"><SearchIcon size={16} sx={{ color: 'var(--tm-faint)' }} /></InputAdornment>}
            sx={{ width: { xs: '100%', sm: 260 } }}
            inputProps={{ 'aria-label': 'Search test cases' }}
          />
          {filterSelect(priority, setPriority, options.agent.priorities, 'Priority', (p) => (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><PriorityIcon priority={p} /> {PRIORITY_STYLE[p].label}</Box>
          ))}
          {filterSelect(category, setCategory, options.agent.categories, 'Type')}
          {chosen.length > 0 && (
            <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ fontSize: 13.5, color: 'var(--tm-ink-soft)', mr: 0.5 }}>{chosen.length} selected</Box>
              <Button variant="outlined" startIcon={<ExportIcon size={16} />} endIcon={<ChevronDown size={14} />} onClick={(e) => setExportAnchor(e.currentTarget)}>
                Export
              </Button>
              <Button
                variant="outlined"
                endIcon={<ChevronDown size={14} />}
                onClick={(e) => {
                  setMoveIds(chosen.map((c) => c.id));
                  setMoveAnchor(e.currentTarget);
                }}
              >
                Move
              </Button>
              <IconButton aria-label="Delete selected" onClick={removeChosen} sx={{ color: 'var(--tm-bad)', border: '1px solid var(--tm-rule-strong)', borderRadius: '6px', p: '7px' }}>
                <TrashIcon size={16} />
              </IconButton>
            </Box>
          )}
        </Box>

        <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', mx: 3, mb: 3, border: '1px solid var(--tm-rule)', borderRadius: '10px', bgcolor: 'var(--tm-surface)', overflow: 'hidden' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1.25, borderBottom: '1px solid var(--tm-rule)' }}>
            <FolderIcon open size={17} sx={{ color: 'var(--tm-primary)' }} />
            <Box sx={{ fontSize: 14.5, fontWeight: 600, color: 'var(--tm-ink)' }}>{folder?.name ?? 'Test cases'}</Box>
            {folder && <Box sx={{ fontSize: 12.5, color: 'var(--tm-muted)' }}>{repo.pathOf(folder.id)} · {rows.length} {rows.length === 1 ? 'test case' : 'test cases'}</Box>}
          </Box>
          <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          {rows.length > 0 ? (
            <Box component="table" sx={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
              <thead>
                <tr>
                  <Box component="th" sx={{ ...th, width: 40 }}>
                    <Checkbox checked={allChecked} indeterminate={chosen.length > 0 && !allChecked} onChange={(e) => setAll(e.target.checked)} sx={{ p: 0 }} inputProps={{ 'aria-label': 'Select all' }} />
                  </Box>
                  <Box component="th" sx={{ ...th, width: 84 }}>ID</Box>
                  <Box component="th" sx={th}>Title</Box>
                  <Box component="th" sx={{ ...th, width: 120 }}>Priority</Box>
                  <Box component="th" sx={{ ...th, width: 130, display: { xs: 'none', lg: 'table-cell' } }}>Type</Box>
                  <Box component="th" sx={{ ...th, width: 180, display: { xs: 'none', lg: 'table-cell' } }}>Folder</Box>
                  <Box component="th" sx={{ ...th, width: 120, display: { xs: 'none', md: 'table-cell' } }}>Updated</Box>
                  <Box component="th" sx={{ ...th, width: 44 }} aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <Box component="tr" key={c.id} onClick={() => setViewing(c)} sx={{ cursor: 'pointer', '&:hover td': { bgcolor: 'var(--tm-hover)' } }}>
                    <Box component="td" sx={td} onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={checked.has(c.id)} onChange={() => toggle(c.id)} sx={{ p: 0 }} inputProps={{ 'aria-label': `Select ${c.key}` }} />
                    </Box>
                    <Box component="td" sx={{ ...td, color: 'var(--tm-primary)', fontWeight: 500, whiteSpace: 'nowrap' }}>{c.key}</Box>
                    <Box component="td" sx={{ ...td, color: 'var(--tm-ink)', maxWidth: 0, width: '100%' }}>
                      <Box sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.generatedBy === 'agent' && <SparkleIcon size={13} sx={{ display: 'inline-block', color: 'var(--tm-ai)', mr: 0.75, verticalAlign: '-1px' }} />}
                        {c.title}
                      </Box>
                    </Box>
                    <Box component="td" sx={td}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <PriorityIcon priority={c.priority} /> {PRIORITY_STYLE[c.priority]?.label ?? '—'}
                      </Box>
                    </Box>
                    <Box component="td" sx={{ ...td, display: { xs: 'none', lg: 'table-cell' } }}>{c.category ?? '—'}</Box>
                    <Box component="td" sx={{ ...td, display: { xs: 'none', lg: 'table-cell' }, color: 'var(--tm-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180 }}>
                      {repo.folders.find((f) => f.id === c.folderId)?.name}
                    </Box>
                    <Box component="td" sx={{ ...td, display: { xs: 'none', md: 'table-cell' }, color: 'var(--tm-muted)', whiteSpace: 'nowrap' }}>{formatDate(c.updatedAt)}</Box>
                    <Box component="td" sx={{ ...td, px: 0.5 }} onClick={(e) => e.stopPropagation()}>
                      <IconButton size="small" aria-label={`Actions for ${c.key}`} onClick={(e) => setRowMenu({ anchor: e.currentTarget, testCase: c })} sx={{ color: 'var(--tm-muted)' }}>
                        <MoreIcon size={16} sx={{ transform: 'rotate(90deg)' }} />
                      </IconButton>
                    </Box>
                  </Box>
                ))}
              </tbody>
            </Box>
          ) : (
            <Box sx={{ py: 10, px: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 1.5 }}>
              {repo.loading ? (
                <Box sx={{ color: 'var(--tm-muted)' }}>Loading…</Box>
              ) : repo.cases.some((c) => scope?.has(c.folderId)) ? (
                <Box sx={{ color: 'var(--tm-muted)', fontSize: 14 }}>No test cases match the search or filters.</Box>
              ) : (
                <>
                  <AiBadge size={48} />
                  <Box sx={{ fontSize: 18, fontWeight: 600, color: 'var(--tm-ink)', mt: 1 }}>No test cases in this folder yet</Box>
                  <Box sx={{ fontSize: 14, color: 'var(--tm-muted)', maxWidth: '46ch' }}>
                    Generate them from a PRD, user story, Jira issue, Confluence page, Figma design or screenshot — then review, refine and add them here.
                  </Box>
                  <Box sx={{ mt: 1 }}><GenerateButton onClick={onGenerate} badge={generateBadge} /></Box>
                </>
              )}
              {repo.loadError && <Box sx={{ color: 'var(--tm-bad)', fontSize: 14 }}>Could not load the repository: {repo.loadError}</Box>}
            </Box>
          )}
          </Box>
          {folder && (
            <QuickCreate
              busy={quickBusy}
              aiEnabled={options.agent.enabled}
              onCreate={async (title, ai) => {
                if (!ai) {
                  setCreating(blankCase(options, title));
                  return true;
                }
                setQuickBusy(true);
                const ok = await onQuickGenerate(title, folder.id);
                setQuickBusy(false);
                return ok;
              }}
            />
          )}
        </Box>
      </Box>

      <Menu anchorEl={folderMenu?.anchor} open={Boolean(folderMenu)} onClose={() => setFolderMenu(null)} disableScrollLock>
        <MenuItem onClick={() => folderAction('sub')}>New sub-folder</MenuItem>
        <MenuItem onClick={() => folderAction('rename')}>Rename</MenuItem>
        <MenuItem onClick={() => folderAction('delete')} sx={{ color: 'var(--tm-bad)' }}>Delete</MenuItem>
      </Menu>

      <Menu anchorEl={exportAnchor} open={Boolean(exportAnchor)} onClose={() => setExportAnchor(null)} disableScrollLock>
        {options.destinations.map((d) => (
          <MenuItem
            key={d.key}
            onClick={async () => {
              setExportAnchor(null);
              if (await onExport(d.key, chosen.length ? chosen : rows)) setChecked(new Set());
            }}
          >
            <Box>
              <Box>{d.label}</Box>
              <Box sx={{ fontSize: 12, color: 'var(--tm-muted)' }}>{d.target}</Box>
            </Box>
          </MenuItem>
        ))}
        {options.destinations.length === 0 && <MenuItem disabled>No destinations are enabled</MenuItem>}
      </Menu>

      <Menu anchorEl={moveAnchor} open={Boolean(moveAnchor)} onClose={() => setMoveAnchor(null)} disableScrollLock>
        {repo.folders.map((f) => (
          <MenuItem
            key={f.id}
            onClick={async () => {
              setMoveAnchor(null);
              const result = await repo.moveCases(moveIds ?? chosen.map((c) => c.id), f.id);
              if (result) {
                setChecked(new Set());
                notify({ kind: 'success', message: `Moved ${result.moved} test cases to ${repo.pathOf(f.id)}.` });
              }
            }}
            sx={{ gap: 1 }}
          >
            <FolderIcon size={16} sx={{ color: 'var(--tm-muted)' }} /> {repo.pathOf(f.id)}
          </MenuItem>
        ))}
      </Menu>

      <Menu anchorEl={rowMenu?.anchor} open={Boolean(rowMenu)} onClose={() => setRowMenu(null)} disableScrollLock>
        <MenuItem
          onClick={() => {
            setViewing(rowMenu.testCase);
            setRowMenu(null);
          }}
        >
          Edit
        </MenuItem>
        <MenuItem
          onClick={() => {
            setMoveIds([rowMenu.testCase.id]);
            setMoveAnchor(rowMenu.anchor);
            setRowMenu(null);
          }}
        >
          Move to…
        </MenuItem>
        <MenuItem
          onClick={async () => {
            const tc = rowMenu.testCase;
            setRowMenu(null);
            if (!window.confirm(`Delete ${tc.key}? This cannot be undone.`)) return;
            if (await repo.deleteCases([tc.id])) notify({ kind: 'success', message: `Deleted ${tc.key}.` });
          }}
          sx={{ color: 'var(--tm-bad)' }}
        >
          Delete
        </MenuItem>
      </Menu>

      <CaseDrawer
        open={Boolean(creating)}
        testCase={creating}
        options={options}
        saving={saving}
        subtitle={folder ? `New test case · ${repo.pathOf(folder.id)}` : 'New test case'}
        onClose={() => setCreating(null)}
        onSave={async (draft) => {
          setSaving(true);
          const result = await repo.addCases({ folderId: folder.id, subfolders: false, testCases: [draft] });
          setSaving(false);
          if (result) {
            setCreating(null);
            notify({ kind: 'success', message: `Created ${result.added[0].key}.` });
          }
        }}
      />

      <NameDialog key={nameDialog?.title ?? 'none'} state={nameDialog} onClose={() => setNameDialog(null)} />

      <CaseDrawer
        open={Boolean(viewing)}
        testCase={viewing}
        options={options}
        saving={saving}
        subtitle={viewing ? `${viewing.key} · ${repo.pathOf(viewing.folderId)}` : ''}
        onClose={() => setViewing(null)}
        onSave={async (next) => {
          setSaving(true);
          const { id, key, folderId: f, createdAt, updatedAt, change, ...testCase } = next;
          const saved = await repo.updateCase(viewing.id, testCase);
          setSaving(false);
          if (saved) {
            setViewing(null);
            notify({ kind: 'success', message: `Saved ${saved.key}.` });
          }
        }}
      />
    </Box>
  );
}
