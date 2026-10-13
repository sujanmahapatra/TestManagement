import { useMemo, useState } from 'react';
import { Box, Button, Checkbox, Dialog, DialogActions, DialogContent, IconButton, InputAdornment, Menu, MenuItem, OutlinedInput, Popover, Select, Tooltip } from '@mui/material';
import {
  AiBadge,
  ChevronDown,
  ChevronRight,
  ColumnsIcon,
  DownloadIcon,
  ExportIcon,
  FilterIcon,
  FolderIcon,
  FolderPlusIcon,
  InfoIcon,
  MoreIcon,
  PlusIcon,
  PriorityIcon,
  SearchIcon,
  SortIcon,
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

/** A solid folder, as test management lists show them. */
const SolidFolder = ({ active }) => (
  <Box component="svg" viewBox="0 0 20 20" width={17} height={17} aria-hidden sx={{ flex: 'none' }}>
    <path d="M2.5 5a1.2 1.2 0 0 1 1.2-1.2h3.9l1.7 1.9h7a1.2 1.2 0 0 1 1.2 1.2v8.3a1.2 1.2 0 0 1-1.2 1.2H3.7a1.2 1.2 0 0 1-1.2-1.2z" fill={active ? '#3b82f6' : '#60a5fa'} />
    <path d="M2.5 7.6h15v-.7a1.2 1.2 0 0 0-1.2-1.2h-7l-1.7-1.9H3.7A1.2 1.2 0 0 0 2.5 5z" fill={active ? '#2563eb' : '#3b82f6'} />
  </Box>
);

function FolderTree({ repo, sort, selectedId, onSelect, onMenu }) {
  const [collapsed, setCollapsed] = useState(() => new Set());
  const children = (parentId) => {
    const list = repo.folders.filter((f) => (f.parentId ?? null) === parentId);
    return sort === 'name' ? [...list].sort((a, b) => a.name.localeCompare(b.name)) : list;
  };

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
              color: selected ? 'var(--tm-primary)' : 'var(--tm-ink-soft)',
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
            <SolidFolder active={selected} />
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
  const [modeAnchor, setModeAnchor] = useState(null);
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
        onClick={(e) => setModeAnchor(e.currentTarget)}
        aria-haspopup="menu"
        title={aiEnabled ? 'How the steps are written' : 'AI is off on this server'}
        sx={{
          all: 'unset',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.5,
          fontSize: 13,
          fontWeight: 500,
          px: 1,
          py: '5px',
          borderRadius: '6px',
          color: 'var(--tm-ink-soft)',
          whiteSpace: 'nowrap',
          flex: 'none',
          '&:hover': { bgcolor: 'var(--tm-sunken)' },
          '&:focus-visible': { outline: '2px solid var(--tm-primary)' },
        }}
      >
        {ai && aiEnabled ? 'AI steps' : 'Manual steps'} <ChevronDown size={13} />
      </Box>
      <Menu anchorEl={modeAnchor} open={Boolean(modeAnchor)} onClose={() => setModeAnchor(null)} disableScrollLock anchorOrigin={{ vertical: 'top', horizontal: 'left' }} transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
        <MenuItem
          disabled={!aiEnabled}
          selected={ai && aiEnabled}
          onClick={() => {
            setAi(true);
            setModeAnchor(null);
          }}
        >
          <Box>
            <Box>AI steps</Box>
            <Box sx={{ fontSize: 12, color: 'var(--tm-muted)' }}>AI writes the steps, preconditions and results</Box>
          </Box>
        </MenuItem>
        <MenuItem
          selected={!ai || !aiEnabled}
          onClick={() => {
            setAi(false);
            setModeAnchor(null);
          }}
        >
          <Box>
            <Box>Manual steps</Box>
            <Box sx={{ fontSize: 12, color: 'var(--tm-muted)' }}>Opens the case for you to write</Box>
          </Box>
        </MenuItem>
      </Menu>
      <OutlinedInput
        size="small"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={ai && aiEnabled ? 'Enter test case title and press ↵ to generate test case details using AI' : 'Enter test case title and press ↵ to create it'}
        disabled={busy}
        fullWidth
        inputProps={{ maxLength: 600, 'aria-label': 'New test case title' }}
      />
      <Button type="submit" variant="text" disabled={busy || title.trim().length < 5} startIcon={busy ? null : ai && aiEnabled ? <SparkleIcon size={14} /> : <PlusIcon size={15} />} sx={{ flex: 'none' }}>
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
  const [origin, setOrigin] = useState('all'); // all | ai | manual
  const [filterAnchor, setFilterAnchor] = useState(null);
  const [sort, setSort] = useState('custom'); // custom | name
  const [sortAnchor, setSortAnchor] = useState(null);
  const [columns, setColumns] = useState(() => new Set()); // optional columns shown
  const [columnsAnchor, setColumnsAnchor] = useState(null);
  const activeFilters = (priority !== 'all' ? 1 : 0) + (category !== 'all' ? 1 : 0);

  const folder = repo.folders.find((f) => f.id === folderId) ?? repo.folders[0];
  const scope = folder ? repo.descendants[folder.id] : new Set();

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return repo.cases
      .filter((c) => scope?.has(c.folderId))
      .filter((c) => origin === 'all' || (origin === 'ai') === (c.generatedBy === 'agent'))
      .filter((c) => priority === 'all' || c.priority === priority)
      .filter((c) => category === 'all' || c.category === category)
      .filter((c) => !q || c.title.toLowerCase().includes(q) || c.key.toLowerCase().includes(q))
      .sort((a, b) => Number(a.key.slice(3)) - Number(b.key.slice(3)));
  }, [repo.cases, scope, origin, priority, category, search]);

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
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 2, py: 1.25, borderBottom: '1px solid var(--tm-rule)' }}>
          <Box
            component="button"
            type="button"
            onClick={(e) => setSortAnchor(e.currentTarget)}
            aria-haspopup="menu"
            sx={{ all: 'unset', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 0.75, fontSize: 13, color: 'var(--tm-ink-soft)', '&:focus-visible': { outline: '2px solid var(--tm-primary)' } }}
          >
            <SortIcon size={15} sx={{ color: 'var(--tm-muted)' }} />
            Sort by: {sort === 'name' ? 'Name' : 'Custom'}
          </Box>
          <Box sx={{ ml: 'auto', fontSize: 12.5, color: 'var(--tm-muted)', fontVariantNumeric: 'tabular-nums' }}>({repo.cases.length})</Box>
        </Box>
        <Box sx={{ flex: 1, overflowY: 'auto', px: 1, py: 1 }}>
          <FolderTree repo={repo} sort={sort} selectedId={folder?.id} onSelect={(id) => { onFolderChange(id); setChecked(new Set()); }} onMenu={(anchor, f) => setFolderMenu({ anchor, folder: f })} />
        </Box>
      </Box>

      {/* cases */}
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
        <Box sx={{ px: 3, pt: 2.5, borderBottom: '1px solid var(--tm-rule)', bgcolor: 'var(--tm-surface)' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            <Box component="h1" sx={{ m: 0, fontSize: 22, fontWeight: 600, color: 'var(--tm-ink)', letterSpacing: '-.01em' }}>Test Cases</Box>
            <Box sx={{ ml: 'auto', display: 'flex', gap: 1, alignItems: 'center' }}>
              <IconButton
                aria-label={chosen.length ? `Download ${chosen.length} selected test cases as Excel` : 'Download this folder as Excel'}
                title={chosen.length ? `Download ${chosen.length} selected as Excel` : 'Download this folder as Excel'}
                onClick={() => onExport('excel', chosen.length ? chosen : rows)}
                disabled={rows.length === 0 || !options.destinations.some((d) => d.key === 'excel')}
                sx={{ border: '1px solid var(--tm-rule-strong)', borderRadius: '6px', p: '7px', color: 'var(--tm-ink-soft)' }}
              >
                <DownloadIcon size={17} />
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
          <Select
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            input={<OutlinedInput size="small" />}
            MenuProps={{ disableScrollLock: true }}
            inputProps={{ 'aria-label': 'Which test cases' }}
            sx={{ fontSize: 14, minWidth: 170, '& .MuiSelect-select': { py: '6.5px' } }}
          >
            <MenuItem value="all">All Test Cases</MenuItem>
            <MenuItem value="ai">AI generated</MenuItem>
            <MenuItem value="manual">Created manually</MenuItem>
          </Select>
          <IconButton
            aria-label="New folder"
            title="New folder"
            onClick={() => setNameDialog({ title: 'New folder', action: 'Create', onSubmit: async (name) => { const f = await repo.createFolder(name, null); if (f) onFolderChange(f.id); } })}
            sx={{ border: '1px solid var(--tm-rule-strong)', borderRadius: '6px', p: '7px', color: 'var(--tm-ink-soft)' }}
          >
            <FolderPlusIcon size={17} />
          </IconButton>
          <Box sx={{ ml: { sm: 'auto' }, display: 'flex', gap: 1, alignItems: 'center', width: { xs: '100%', sm: 'auto' } }}>
            <OutlinedInput
              size="small"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by Test Case ID or Title"
              startAdornment={<InputAdornment position="start"><SearchIcon size={16} sx={{ color: 'var(--tm-faint)' }} /></InputAdornment>}
              sx={{ width: { xs: '100%', sm: 300 } }}
              inputProps={{ 'aria-label': 'Search test cases' }}
            />
            <IconButton
              aria-label="Filter test cases"
              title="Filter"
              onClick={(e) => setFilterAnchor(e.currentTarget)}
              sx={{
                position: 'relative',
                border: '1px solid',
                borderColor: activeFilters ? 'var(--tm-primary)' : 'var(--tm-rule-strong)',
                bgcolor: activeFilters ? 'var(--tm-primary-soft)' : 'transparent',
                borderRadius: '6px',
                p: '7px',
                color: activeFilters ? 'var(--tm-primary)' : 'var(--tm-ink-soft)',
              }}
            >
              <FilterIcon size={17} />
              {activeFilters > 0 && (
                <Box component="span" sx={{ position: 'absolute', top: -6, right: -6, minWidth: 16, height: 16, borderRadius: '8px', bgcolor: 'var(--tm-primary)', color: '#fff', fontSize: 10.5, fontWeight: 600, display: 'grid', placeItems: 'center', px: '3px' }}>
                  {activeFilters}
                </Box>
              )}
            </IconButton>
          </Box>
        </Box>

        <Popover
          open={Boolean(filterAnchor)}
          anchorEl={filterAnchor}
          onClose={() => setFilterAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          disableScrollLock
        >
          <Box sx={{ p: 2, width: 260, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Box sx={{ fontSize: 14, fontWeight: 600 }}>Filters</Box>
            {filterSelect(priority, setPriority, options.agent.priorities, 'Priority', (p) => (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><PriorityIcon priority={p} /> {PRIORITY_STYLE[p].label}</Box>
            ))}
            {filterSelect(category, setCategory, options.agent.categories, 'Type')}
            <Button
              size="small"
              variant="text"
              disabled={!activeFilters}
              onClick={() => {
                setPriority('all');
                setCategory('all');
              }}
              sx={{ alignSelf: 'flex-start' }}
            >
              Clear filters
            </Button>
          </Box>
        </Popover>

        <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', mx: 3, mb: 3, border: '1px solid var(--tm-rule)', borderRadius: '10px', bgcolor: 'var(--tm-surface)', overflow: 'hidden' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 2, minHeight: 46, borderBottom: '1px solid var(--tm-rule)', flexWrap: 'wrap' }}>
            <Box sx={{ fontSize: 14.5, fontWeight: 600, color: 'var(--tm-ink)' }}>{folder?.name ?? 'Test cases'}</Box>
            {folder && (
              <Tooltip arrow title={`${repo.pathOf(folder.id)} · ${rows.length} ${rows.length === 1 ? 'test case' : 'test cases'}`}>
                <Box component="span" tabIndex={0} sx={{ display: 'inline-flex', color: 'var(--tm-faint)' }} aria-label="Folder details">
                  <InfoIcon size={15} />
                </Box>
              </Tooltip>
            )}
            {chosen.length > 0 && (
              <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1, py: 0.75 }}>
                <Box sx={{ fontSize: 13.5, color: 'var(--tm-ink-soft)', mr: 0.5 }}>{chosen.length} selected</Box>
                <Button size="small" variant="outlined" startIcon={<ExportIcon size={15} />} endIcon={<ChevronDown size={13} />} onClick={(e) => setExportAnchor(e.currentTarget)}>
                  Export
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  endIcon={<ChevronDown size={13} />}
                  onClick={(e) => {
                    setMoveIds(chosen.map((c) => c.id));
                    setMoveAnchor(e.currentTarget);
                  }}
                >
                  Move
                </Button>
                <IconButton aria-label="Delete selected" onClick={removeChosen} sx={{ color: 'var(--tm-bad)', border: '1px solid var(--tm-rule-strong)', borderRadius: '6px', p: '5px' }}>
                  <TrashIcon size={15} />
                </IconButton>
              </Box>
            )}
          </Box>
          <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          {rows.length > 0 ? (
            <Box component="table" sx={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
              <thead>
                <tr>
                  <Box component="th" sx={{ ...th, width: 40 }}>
                    <Checkbox checked={allChecked} indeterminate={chosen.length > 0 && !allChecked} onChange={(e) => setAll(e.target.checked)} sx={{ p: 0 }} inputProps={{ 'aria-label': 'Select all' }} />
                  </Box>
                  <Box component="th" sx={{ ...th, width: 96 }}>ID</Box>
                  <Box component="th" sx={th}>Title</Box>
                  <Box component="th" sx={{ ...th, width: 130 }}>Priority</Box>
                  {columns.has('type') && <Box component="th" sx={{ ...th, width: 130 }}>Type</Box>}
                  {columns.has('folder') && <Box component="th" sx={{ ...th, width: 180 }}>Folder</Box>}
                  {columns.has('updated') && <Box component="th" sx={{ ...th, width: 120 }}>Updated</Box>}
                  <Box component="th" sx={{ ...th, width: 44, px: 0.5 }}>
                    <IconButton size="small" aria-label="Choose columns" title="Choose columns" onClick={(e) => setColumnsAnchor(e.currentTarget)} sx={{ color: 'var(--tm-muted)', border: '1px solid var(--tm-rule)', borderRadius: '6px', p: '3px' }}>
                      <ColumnsIcon size={15} />
                    </IconButton>
                  </Box>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <Box component="tr" key={c.id} onClick={() => setViewing(c)} sx={{ cursor: 'pointer', '&:hover td': { bgcolor: 'var(--tm-hover)' } }}>
                    <Box component="td" sx={td} onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={checked.has(c.id)} onChange={() => toggle(c.id)} sx={{ p: 0 }} inputProps={{ 'aria-label': `Select ${c.key}` }} />
                    </Box>
                    <Box component="td" sx={{ ...td, color: 'var(--tm-muted)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{c.key}</Box>
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
                    {columns.has('type') && <Box component="td" sx={td}>{c.category ?? '—'}</Box>}
                    {columns.has('folder') && (
                      <Box component="td" sx={{ ...td, color: 'var(--tm-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180 }}>
                        {repo.folders.find((f) => f.id === c.folderId)?.name}
                      </Box>
                    )}
                    {columns.has('updated') && <Box component="td" sx={{ ...td, color: 'var(--tm-muted)', whiteSpace: 'nowrap' }}>{formatDate(c.updatedAt)}</Box>}
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

      <Menu anchorEl={sortAnchor} open={Boolean(sortAnchor)} onClose={() => setSortAnchor(null)} disableScrollLock>
        {[
          ['custom', 'Custom (creation order)'],
          ['name', 'Name (A–Z)'],
        ].map(([key, label]) => (
          <MenuItem
            key={key}
            selected={sort === key}
            onClick={() => {
              setSort(key);
              setSortAnchor(null);
            }}
          >
            {label}
          </MenuItem>
        ))}
      </Menu>

      <Menu anchorEl={columnsAnchor} open={Boolean(columnsAnchor)} onClose={() => setColumnsAnchor(null)} disableScrollLock>
        <Box sx={{ px: 2, pt: 0.5, pb: 1, fontSize: 12, fontWeight: 600, color: 'var(--tm-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Columns</Box>
        {[
          ['type', 'Type'],
          ['folder', 'Folder'],
          ['updated', 'Updated'],
        ].map(([key, label]) => (
          <MenuItem
            key={key}
            onClick={() =>
              setColumns((prev) => {
                const next = new Set(prev);
                next.has(key) ? next.delete(key) : next.add(key);
                return next;
              })
            }
            sx={{ gap: 1 }}
          >
            <Checkbox checked={columns.has(key)} sx={{ p: 0 }} tabIndex={-1} />
            {label}
          </MenuItem>
        ))}
      </Menu>

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
