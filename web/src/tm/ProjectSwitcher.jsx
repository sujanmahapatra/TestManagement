import { useState } from 'react';
import { Box, Button, Dialog, Divider, ListItemIcon, ListItemText, Menu, MenuItem, OutlinedInput } from '@mui/material';
import { CheckIcon } from './icons';

const badge = (name) => (
  <Box sx={{ width: 20, height: 20, borderRadius: '5px', border: '1.5px solid var(--tm-ink-soft)', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700, flex: 'none' }}>
    {(name || 'P').charAt(0).toUpperCase()}
  </Box>
);

/** A small dialog with one text field, for naming a new or existing project. */
function NameDialog({ open, title, initial, action, onClose, onSubmit }) {
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: '12px' } }} TransitionProps={{ onEnter: () => setName(initial) }}>
      <Box
        component="form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const ok = await onSubmit(name.trim());
          setBusy(false);
          if (ok) onClose();
        }}
        sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}
      >
        <Box sx={{ fontSize: 15, fontWeight: 600 }}>{title}</Box>
        <OutlinedInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name" autoFocus fullWidth size="small" inputProps={{ maxLength: 80, 'aria-label': 'Project name' }} />
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
          <Button variant="outlined" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={!name.trim() || busy}>{action}</Button>
        </Box>
      </Box>
    </Dialog>
  );
}

/**
 * The project box in the left menu: shows the open project and switches
 * between projects, creates, renames and deletes them. Each project has its
 * own folders and test cases.
 */
export default function ProjectSwitcher({ repo }) {
  const [anchor, setAnchor] = useState(null);
  const [dialog, setDialog] = useState(null); // 'new' | 'rename' | 'delete'
  // A dialog opens once the menu has finished closing, so the menu's focus
  // trap is gone and the dialog's field can take focus.
  const [pending, setPending] = useState(null);
  const current = repo.projects.find((p) => p.id === repo.projectId);
  const close = () => setDialog(null);

  return (
    <>
      <Box
        component="button"
        type="button"
        aria-haspopup="menu"
        aria-label={`Project: ${repo.projectName}. Switch or manage projects`}
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{
          display: 'flex', alignItems: 'center', gap: 1, mx: 0.25, mb: 1.5, px: 1, py: 0.75,
          border: '1px solid var(--tm-rule-strong)', borderRadius: '6px', bgcolor: 'var(--tm-surface)',
          fontFamily: 'inherit', fontSize: 13.5, color: 'var(--tm-ink)', textAlign: 'left', cursor: 'pointer',
          '&:hover': { borderColor: 'var(--tm-ink-soft)' },
        }}
      >
        {badge(repo.projectName)}
        <Box component="span" sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{repo.projectName || 'Default project'}</Box>
        <Box component="span" aria-hidden sx={{ fontSize: 10, color: 'var(--tm-muted)' }}>▾</Box>
      </Box>

      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        disableScrollLock
        disableRestoreFocus
        TransitionProps={{
          onExited: () => {
            if (pending) setDialog(pending);
            setPending(null);
          },
        }}
        PaperProps={{ sx: { width: 260, maxHeight: 420 } }}
        sx={{ zIndex: 1450 }}
      >
        <Box sx={{ px: 2, py: 0.75, fontSize: 12, fontWeight: 600, color: 'var(--tm-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Projects</Box>
        {repo.projects.map((p) => (
          <MenuItem
            key={p.id}
            selected={p.id === repo.projectId}
            onClick={() => {
              setAnchor(null);
              if (p.id !== repo.projectId) repo.switchProject(p.id);
            }}
          >
            <ListItemIcon sx={{ minWidth: 30 }}>{badge(p.name)}</ListItemIcon>
            <ListItemText primary={p.name} secondary={`${p.cases} test ${p.cases === 1 ? 'case' : 'cases'}`} primaryTypographyProps={{ noWrap: true, fontSize: 13.5 }} secondaryTypographyProps={{ fontSize: 12 }} />
            {p.id === repo.projectId && <CheckIcon size={16} sx={{ color: 'var(--tm-primary)', ml: 1 }} />}
          </MenuItem>
        ))}
        <Divider />
        <MenuItem onClick={() => { setAnchor(null); setPending('new'); }} sx={{ fontSize: 13.5, color: 'var(--tm-primary)', fontWeight: 500 }}>
          + New project
        </MenuItem>
        <MenuItem onClick={() => { setAnchor(null); setPending('rename'); }} sx={{ fontSize: 13.5 }}>
          Rename “{current?.name ?? repo.projectName}”
        </MenuItem>
        <MenuItem disabled={repo.projects.length < 2} onClick={() => { setAnchor(null); setPending('delete'); }} sx={{ fontSize: 13.5, color: 'var(--tm-bad)' }}>
          Delete project…
        </MenuItem>
      </Menu>

      <NameDialog
        open={dialog === 'new'}
        title="New project"
        initial=""
        action="Create"
        onClose={close}
        onSubmit={async (name) => Boolean(await repo.createProject(name))}
      />
      <NameDialog
        open={dialog === 'rename'}
        title="Rename project"
        initial={repo.projectName}
        action="Save"
        onClose={close}
        onSubmit={async (name) => name === repo.projectName || Boolean(await repo.renameProject(name))}
      />
      <Dialog open={dialog === 'delete'} onClose={close} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: '12px' } }}>
        <Box sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Box sx={{ fontSize: 15, fontWeight: 600 }}>Delete “{repo.projectName}”?</Box>
          <Box sx={{ fontSize: 13.5, color: 'var(--tm-muted)' }}>
            This permanently deletes the project with its folders and {current?.cases ?? 0} test {current?.cases === 1 ? 'case' : 'cases'}. It cannot be undone.
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
            <Button variant="outlined" onClick={close}>Cancel</Button>
            <Button
              variant="contained"
              color="error"
              onClick={async () => {
                close();
                await repo.deleteProject(repo.projectId);
              }}
            >
              Delete project
            </Button>
          </Box>
        </Box>
      </Dialog>
    </>
  );
}
