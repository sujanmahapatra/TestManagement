import { useEffect, useMemo, useState } from 'react';
import { Box, Button, Checkbox, Dialog, IconButton, Radio } from '@mui/material';
import { api } from '../api/client';
import { ChevronDown, ChevronRight, CloseIcon, PriorityIcon, SparkleIcon } from './icons';

/** A case's steps and expected results, to compare side by side before removing. */
function CaseDetail({ testCase }) {
  return (
    <Box sx={{ fontSize: 12.5, color: 'var(--tm-ink-soft)', pl: 6.5, pr: 2, pb: 1.25, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      {testCase.description && <Box sx={{ color: 'var(--tm-muted)' }}>{testCase.description}</Box>}
      {(testCase.steps ?? []).map((s, i) => (
        <Box key={i}>
          {i + 1}. {s}
          {testCase.stepResults?.[i] && <Box component="span" sx={{ color: 'var(--tm-muted)' }}> → {testCase.stepResults[i]}</Box>}
        </Box>
      ))}
    </Box>
  );
}

function GroupCard({ index, group, cases, pathOf, keepId, removing, onKeep, onToggle }) {
  const [open, setOpen] = useState(null); // id whose steps are shown
  return (
    <Box sx={{ flex: 'none', border: '1px solid var(--tm-rule)', borderRadius: '10px', overflow: 'hidden', bgcolor: 'var(--tm-surface)' }}>
      <Box sx={{ px: 2, py: 1.25, bgcolor: 'var(--tm-sunken)', borderBottom: '1px solid var(--tm-rule)' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: 13.5, fontWeight: 600 }}>
          Group {index + 1}
          <Box component="span" sx={{ fontWeight: 400, color: 'var(--tm-muted)' }}>
            · {cases.length} test cases · {Math.round(group.similarity * 100)}% word overlap
          </Box>
        </Box>
        {group.reason && (
          <Box sx={{ display: 'flex', gap: 0.75, mt: 0.5, fontSize: 12.5, color: 'var(--tm-ink-soft)' }}>
            <SparkleIcon size={13} sx={{ color: 'var(--tm-ai)', mt: '2px' }} />
            {group.reason}
          </Box>
        )}
      </Box>
      {cases.map((c) => {
        const keep = c.id === keepId;
        return (
          <Box key={c.id} sx={{ borderTop: '1px solid var(--tm-rule)', '&:first-of-type': { borderTop: 0 }, bgcolor: keep ? 'var(--tm-ok-soft)' : 'transparent' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.75 }}>
              <IconButton size="small" aria-label={open === c.id ? 'Hide steps' : 'Show steps'} onClick={() => setOpen(open === c.id ? null : c.id)} sx={{ color: 'var(--tm-muted)' }}>
                {open === c.id ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
              </IconButton>
              <Radio size="small" checked={keep} onChange={() => onKeep(c.id)} inputProps={{ 'aria-label': `Keep ${c.key}` }} sx={{ p: 0.25 }} />
              <Box sx={{ fontSize: 12.5, color: 'var(--tm-muted)', width: 52, flex: 'none' }}>{c.key}</Box>
              <PriorityIcon priority={c.priority} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ fontSize: 13.5, color: 'var(--tm-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.title}>{c.title}</Box>
                <Box sx={{ fontSize: 12, color: 'var(--tm-faint)' }}>{pathOf(c.folderId)} · {c.steps?.length ?? 0} {c.steps?.length === 1 ? 'step' : 'steps'}</Box>
              </Box>
              {keep ? (
                <Box sx={{ fontSize: 12, fontWeight: 600, color: 'var(--tm-ok)', px: 1 }}>Keep</Box>
              ) : (
                <Box component="label" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: 12.5, color: 'var(--tm-bad)', cursor: 'pointer', pr: 0.5 }}>
                  <Checkbox size="small" checked={removing.has(c.id)} onChange={(e) => onToggle(c.id, e.target.checked)} sx={{ p: 0.25 }} />
                  Remove
                </Box>
              )}
            </Box>
            {open === c.id && <CaseDetail testCase={c} />}
          </Box>
        );
      })}
    </Box>
  );
}

/**
 * "Review duplicates": the AI checks the folder's (or project's) cases for
 * ones that test the same thing, groups them with its reason, and the
 * reviewer chooses which to keep before anything is removed.
 */
export default function DuplicatesDialog({ open, onClose, repo, folder, notify }) {
  const [scope, setScope] = useState('folder'); // folder | project
  const [state, setState] = useState({ status: 'idle' }); // idle | loading | done | error
  const [keep, setKeep] = useState({}); // group id -> case id
  const [removing, setRemoving] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const byId = useMemo(() => new Map(repo.cases.map((c) => [c.id, c])), [repo.cases]);

  const run = async (which = scope) => {
    setState({ status: 'loading' });
    try {
      const result = await api.repository.findDuplicates({ projectId: repo.projectId, ...(which === 'folder' && folder && { folderId: folder.id }) });
      setKeep(Object.fromEntries(result.groups.map((g) => [g.id, g.keepId])));
      setRemoving(new Set(result.groups.flatMap((g) => g.caseIds.filter((id) => id !== g.keepId))));
      setState({ status: 'done', result });
    } catch (err) {
      setState({ status: 'error', message: err.message });
    }
  };

  useEffect(() => {
    if (open) run(scope);
    // Re-run only when opened; the scope buttons run it themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const groups = state.result?.groups ?? [];
  const chooseKeep = (group, id) => {
    setKeep((prev) => ({ ...prev, [group.id]: id }));
    setRemoving((prev) => {
      const next = new Set(prev);
      next.delete(id);
      for (const other of group.caseIds) if (other !== id) next.add(other);
      return next;
    });
  };
  const toggle = (id, on) =>
    setRemoving((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const remove = async () => {
    const ids = [...removing].filter((id) => !Object.values(keep).includes(id));
    if (!ids.length) return;
    setBusy(true);
    const result = await repo.deleteCases(ids);
    setBusy(false);
    if (result) {
      notify({ kind: 'success', message: `Removed ${result.removed} duplicate ${result.removed === 1 ? 'test case' : 'test cases'}.` });
      onClose();
    }
  };

  const removeCount = [...removing].filter((id) => !Object.values(keep).includes(id)).length;
  const scopeButton = (key, label) => (
    <Button
      size="small"
      variant={scope === key ? 'contained' : 'outlined'}
      disableElevation
      disabled={state.status === 'loading'}
      onClick={() => {
        setScope(key);
        run(key);
      }}
    >
      {label}
    </Button>
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: '12px', height: 'min(760px, 92vh)' } }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2.5, py: 1.5, borderBottom: '1px solid var(--tm-rule)' }}>
          <SparkleIcon size={17} sx={{ color: 'var(--tm-ai)' }} />
          <Box component="h2" sx={{ m: 0, fontSize: 16, fontWeight: 600 }}>Review duplicates</Box>
          <Box sx={{ ml: 'auto', display: 'flex', gap: 0.75 }}>
            {folder && scopeButton('folder', `This folder: ${folder.name}`)}
            {scopeButton('project', 'Whole project')}
          </Box>
          <IconButton onClick={onClose} aria-label="Close" sx={{ color: 'var(--tm-muted)' }}>
            <CloseIcon size={18} />
          </IconButton>
        </Box>

        <Box sx={{ flex: 1, overflowY: 'auto', px: 2.5, py: 2, bgcolor: 'var(--tm-ground)', display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {state.status === 'loading' && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: 14, color: 'var(--tm-muted)' }}>
              <SparkleIcon size={15} sx={{ color: 'var(--tm-ai)' }} /> Comparing test cases and verifying likely duplicates…
            </Box>
          )}
          {state.status === 'error' && (
            <Box role="alert" sx={{ fontSize: 13.5, color: 'var(--tm-bad)', bgcolor: 'var(--tm-bad-soft)', borderRadius: '8px', p: 1.25 }}>
              {state.message}
            </Box>
          )}
          {state.status === 'done' && (
            <>
              <Box sx={{ fontSize: 13, color: 'var(--tm-muted)' }}>
                Scanned {state.result.scanned} test cases
                {state.result.verified
                  ? ` · the AI verified ${state.result.checked} likely ${state.result.checked === 1 ? 'pair' : 'pairs'}`
                  : ' · compared by wording only (no AI is configured, so near-identical cases only)'}
                {' · '}
                <b>{groups.length ? `${groups.length} duplicate ${groups.length === 1 ? 'group' : 'groups'} found` : 'no duplicates found'}</b>
              </Box>
              {groups.length > 0 && (
                <Box sx={{ fontSize: 12.5, color: 'var(--tm-muted)' }}>
                  The most complete case in each group is kept. Choose another with the radio button, expand a row to compare steps, and untick any you want to keep too.
                </Box>
              )}
              {groups.map((g, i) => (
                <GroupCard
                  key={g.id}
                  index={i}
                  group={g}
                  cases={g.caseIds.map((id) => byId.get(id)).filter(Boolean)}
                  pathOf={repo.pathOf}
                  keepId={keep[g.id]}
                  removing={removing}
                  onKeep={(id) => chooseKeep(g, id)}
                  onToggle={toggle}
                />
              ))}
            </>
          )}
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, px: 2.5, py: 1.5, borderTop: '1px solid var(--tm-rule)' }}>
          <Button variant="outlined" onClick={onClose}>Close</Button>
          <Button variant="contained" color="error" disabled={busy || removeCount === 0} onClick={remove}>
            {busy ? 'Removing…' : `Remove ${removeCount} ${removeCount === 1 ? 'duplicate' : 'duplicates'}`}
          </Button>
        </Box>
      </Box>
    </Dialog>
  );
}
