import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, Checkbox, IconButton, Menu, MenuItem, OutlinedInput, TextField, Tooltip } from '@mui/material';
import { CheckIcon, ChevronDown, ChevronRight, CloseIcon, FolderIcon, InfoIcon, PlusIcon, PriorityIcon, SendIcon, SettingsIcon, SparkleIcon } from './icons';
import { LiveReasoning, StageMark, contextLabel, stageState } from './GenerateProgress';
import { SourceMark } from './GenerateInput';
import SettingsPopover from './SettingsPopover';
import AddRequirements from './AddRequirements';
import { AGENT_STAGES, groupByScenario } from '../domain/agent';

/* ---------------- the user's turn ---------------- */

function UserTurn({ message }) {
  const files = message.files ?? [];
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.75 }}>
      {files.length > 0 && (
        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, px: 1.25, py: '4px', borderRadius: '6px', bgcolor: 'var(--tm-sunken)', fontSize: 13, color: 'var(--tm-ink-soft)', maxWidth: '80%' }}>
          <SourceMark file={files[0]} />
          <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{files[0].name}</Box>
          {files.length > 1 && <Box component="span" sx={{ color: 'var(--tm-muted)', flex: 'none' }}>+{files.length - 1}</Box>}
        </Box>
      )}
      <Box
        sx={{
          maxWidth: '85%',
          px: 1.5,
          py: 1,
          borderRadius: '10px',
          bgcolor: 'var(--tm-sunken)',
          fontSize: 14,
          color: message.text ? 'var(--tm-ink)' : 'var(--tm-muted)',
          fontStyle: message.text ? 'normal' : 'italic',
          whiteSpace: 'pre-wrap',
          display: '-webkit-box',
          WebkitLineClamp: 6,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {message.text || 'No prompt added.'}
      </Box>
      {message.scope > 0 && <Box sx={{ fontSize: 12, color: 'var(--tm-muted)' }}>Applied to {message.scope} selected test cases</Box>}
    </Box>
  );
}

/* ---------------- thinking ---------------- */

/** One step of the agent's thinking: a tick, a title, and its findings. */
function Step({ state = 'done', title, note, items = [], limit = 3 }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, limit);
  return (
    <Box sx={{ display: 'flex', gap: 1.25 }}>
      <Box sx={{ pt: '1px' }}>
        {state === 'done' ? (
          <Box sx={{ width: 18, height: 18, borderRadius: '50%', bgcolor: 'var(--tm-ok)', color: '#fff', display: 'grid', placeItems: 'center' }}>
            <CheckIcon size={12} sx={{ strokeWidth: 2.6 }} />
          </Box>
        ) : (
          <StageMark state={state} size={18} />
        )}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0, fontSize: 13.5 }}>
        <Box sx={{ color: state === 'pending' ? 'var(--tm-faint)' : 'var(--tm-ink)', fontWeight: 500 }}>
          {title}
          {note && <Box component="span" sx={{ color: 'var(--tm-muted)', fontWeight: 400 }}> ({note})</Box>}
        </Box>
        {shown.length > 0 && (
          <Box sx={{ mt: 0.75, p: 1.25, borderRadius: '8px', border: '1px solid var(--tm-rule)', bgcolor: 'var(--tm-surface)' }}>
            <Box component="ul" sx={{ m: 0, pl: 2, display: 'flex', flexDirection: 'column', gap: 0.5, color: 'var(--tm-ink-soft)' }}>
              {shown.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </Box>
            {items.length > limit && (
              <Box component="button" type="button" onClick={() => setAll((v) => !v)} sx={{ all: 'unset', cursor: 'pointer', mt: 0.75, fontSize: 12.5, color: 'var(--tm-primary)', fontWeight: 500 }}>
                {all ? 'Show less' : `+ ${items.length - limit} more`}
              </Box>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
}

const artifactItems = (analysis) =>
  (analysis?.artifacts ?? []).map((a) => (
    <>
      <b>{a.name}</b>
      {a.findings?.length ? ` — ${a.findings.join(' · ')}` : ''}
    </>
  ));

/** "Hide thinking / Show thinking": the steps, live while running, summarised once done. */
function Thinking({ message, running }) {
  const [open, setOpen] = useState(true);
  const steps = running
    ? AGENT_STAGES.map((s, i) => ({ state: stageState(running, i), title: s.label, note: s.key === 'write' && running.drafted ? `${running.drafted} drafted` : s.key === 'scan' && running.context ? contextLabel(running.context) : null }))
    : null;
  const analysis = message?.analysis;
  return (
    <Box>
      <Box
        component="button"
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        sx={{ all: 'unset', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: 13, color: 'var(--tm-muted)', fontWeight: 500 }}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {open ? 'Hide thinking' : 'Show thinking'}
      </Box>
      {open && (
        <Box sx={{ mt: 1, pl: 1.5, borderLeft: '2px solid var(--tm-rule)', display: 'flex', flexDirection: 'column', gap: 1.25 }}>
          {running ? (
            <>
              {steps.map((s) => <Step key={s.title} state={s.state} title={s.title} note={s.note} />)}
              <LiveReasoning text={running.reasoning} maxHeight={160} />
            </>
          ) : (
            <>
              <Step
                title="I have analysed functional and non-functional requirements from your artifacts"
                note={`Summarised ${analysis?.artifacts?.length ?? 0} artifact${analysis?.artifacts?.length === 1 ? '' : 's'}`}
                items={artifactItems(analysis)}
                limit={2}
              />
              {message?.context && <Step title="I have scanned the repository for related test cases" note={contextLabel(message.context)} />}
              <Step title="I have consolidated core feature requirements" note="Summarised all findings" items={analysis?.coreRequirements ?? []} limit={4} />
              {message?.reasoning && <ReasoningToggle text={message.reasoning} />}
            </>
          )}
        </Box>
      )}
    </Box>
  );
}

function ReasoningToggle({ text }) {
  const [open, setOpen] = useState(false);
  return (
    <Box>
      <Box component="button" type="button" onClick={() => setOpen((v) => !v)} sx={{ all: 'unset', cursor: 'pointer', fontSize: 12.5, color: 'var(--tm-ai)', fontWeight: 500 }}>
        {open ? 'Hide model reasoning' : 'Show model reasoning'}
      </Box>
      {open && <LiveReasoning text={text} maxHeight={220} />}
    </Box>
  );
}

/* ---------------- the agent's turn ---------------- */

function Findings({ message }) {
  const [showAssumptions, setShowAssumptions] = useState(false);
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, fontSize: 14, color: 'var(--tm-ink-soft)' }}>
      {message.changeSummary ? <Box>{message.changeSummary}</Box> : message.summary && <Box>{message.summary}</Box>}
      {message.removed?.length > 0 && <Box sx={{ fontSize: 13, color: 'var(--tm-muted)' }}>Removed: {message.removed.join('; ')}</Box>}
      {message.gaps?.length > 0 && (
        <Box sx={{ bgcolor: 'var(--tm-warn-soft)', borderRadius: '8px', px: 1.25, py: 1 }}>
          <Box sx={{ fontSize: 12.5, fontWeight: 600, color: 'var(--tm-warn)', mb: 0.5 }}>Missing from the requirement</Box>
          <Box component="ul" sx={{ m: 0, pl: 2.25, fontSize: 13 }}>
            {message.gaps.map((g) => <li key={g}>{g}</li>)}
          </Box>
        </Box>
      )}
      {message.notices?.map((n) => <Box key={n} sx={{ fontSize: 12.5, color: 'var(--tm-warn)' }}>{n}</Box>)}
      {message.assumptions?.length > 0 && (
        <Box>
          <Box component="button" type="button" onClick={() => setShowAssumptions((v) => !v)} sx={{ all: 'unset', cursor: 'pointer', fontSize: 13, color: 'var(--tm-primary)', fontWeight: 500 }}>
            {showAssumptions ? 'Hide' : 'Show'} {message.assumptions.length} assumptions
          </Box>
          {showAssumptions && (
            <Box component="ul" sx={{ m: '6px 0 0', pl: 2.25, fontSize: 13 }}>
              {message.assumptions.map((a) => <li key={a}>{a}</li>)}
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}

/** "We have generated N test cases across M scenarios", collapsible. */
function ResultsHeader({ count, scenarios, open, onToggle }) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      sx={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 1, fontSize: 14, color: 'var(--tm-ink-soft)', px: 1.5, py: 1.25 }}
    >
      <SparkleIcon size={15} sx={{ color: 'var(--tm-ai)' }} />
      <span>
        We have generated <b>{count} test cases</b> across <b>{scenarios} scenarios</b>
      </span>
      {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
    </Box>
  );
}

/** An earlier round's result, kept as a summary once a refinement replaced it. */
function PastResults({ message }) {
  const [open, setOpen] = useState(false);
  return (
    <Box sx={{ border: '1px solid var(--tm-rule)', borderRadius: '10px', bgcolor: 'var(--tm-surface)' }}>
      <ResultsHeader count={message.count} scenarios={message.scenarios} open={open} onToggle={() => setOpen((v) => !v)} />
      {open && (
        <Box sx={{ borderTop: '1px solid var(--tm-rule)' }}>
          {(message.snapshot ?? []).map((s) => (
            <Box key={s.name} sx={{ display: 'flex', px: 2, py: 1, fontSize: 13.5, color: 'var(--tm-muted)', borderTop: '1px solid var(--tm-rule)', '&:first-of-type': { borderTop: 0 } }}>
              <ChevronRight size={14} sx={{ mr: 1 }} />
              {s.name}
              <Box component="span" sx={{ ml: 'auto' }}>{s.count} {s.count === 1 ? 'test case' : 'test cases'}</Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

function CaseRow({ testCase, checked, added, doneVerb = 'Added', active, disabled, onToggle, onView }) {
  return (
    <Box
      onClick={onView}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
        pl: 2,
        pr: 1.5,
        py: 1,
        cursor: 'pointer',
        borderTop: '1px solid var(--tm-rule)',
        bgcolor: active ? 'var(--tm-primary-soft)' : 'transparent',
        '&:hover': { bgcolor: active ? 'var(--tm-primary-soft)' : 'var(--tm-hover)' },
      }}
    >
      <Checkbox
        checked={checked}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onToggle(e.target.checked)}
        disabled={disabled || added}
        sx={{ p: 0 }}
        inputProps={{ 'aria-label': `Select ${testCase.title}` }}
      />
      <PriorityIcon priority={testCase.priority} />
      <Box sx={{ flex: 1, minWidth: 0, fontSize: 13.5, color: added ? 'var(--tm-muted)' : 'var(--tm-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {testCase.title}
      </Box>
      {testCase.change === 'new' && <Pill bg="var(--tm-ok-soft)" color="var(--tm-ok)">New</Pill>}
      {testCase.change === 'edited' && <Pill bg="var(--tm-primary-soft)" color="var(--tm-primary-ink)">Edited</Pill>}
      {added && <Pill bg="var(--tm-ok-soft)" color="var(--tm-ok)">{doneVerb} · {added}</Pill>}
    </Box>
  );
}

const Pill = ({ bg, color, children }) => (
  <Box component="span" sx={{ flex: 'none', fontSize: 11.5, fontWeight: 500, px: '7px', py: '1px', borderRadius: '10px', bgcolor: bg, color }}>
    {children}
  </Box>
);

function Scenario({ name, items, selected, addedKeys, doneVerb, viewingId, disabled, onToggle, onView }) {
  const [open, setOpen] = useState(true);
  const selectable = items.filter((tc) => !addedKeys[tc.id]);
  const count = selectable.filter((tc) => selected.has(tc.id)).length;
  return (
    <Box sx={{ borderTop: '1px solid var(--tm-rule)', '&:first-of-type': { borderTop: 0 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1, bgcolor: '#fafbfc' }}>
        <Checkbox
          checked={selectable.length > 0 && count === selectable.length}
          indeterminate={count > 0 && count < selectable.length}
          onChange={(e) => onToggle(selectable.map((tc) => tc.id), e.target.checked)}
          disabled={disabled || selectable.length === 0}
          sx={{ p: 0 }}
          inputProps={{ 'aria-label': `Select all in ${name}` }}
        />
        <IconButton size="small" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={open ? `Collapse ${name}` : `Expand ${name}`} sx={{ p: '2px', color: 'var(--tm-muted)' }}>
          {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </IconButton>
        <Box sx={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--tm-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</Box>
        <Box sx={{ fontSize: 12.5, color: 'var(--tm-muted)', flex: 'none' }}>{items.length} {items.length === 1 ? 'test case' : 'test cases'}</Box>
      </Box>
      {open &&
        items.map((tc) => (
          <CaseRow
            key={tc.id}
            testCase={tc}
            checked={selected.has(tc.id)}
            added={addedKeys[tc.id]}
            doneVerb={doneVerb}
            active={viewingId === tc.id}
            disabled={disabled}
            onToggle={(on) => onToggle([tc.id], on)}
            onView={() => onView(tc.id)}
          />
        ))}
    </Box>
  );
}

/** The current suite: the result of the latest round, selectable, case by case. */
function CurrentResults({ agent, doneVerb, viewingId, disabled, onView }) {
  const [open, setOpen] = useState(true);
  const groups = useMemo(() => groupByScenario(agent.cases), [agent.cases]);
  return (
    <Box sx={{ border: '1px solid var(--tm-rule)', borderRadius: '10px', bgcolor: 'var(--tm-surface)', overflow: 'hidden', opacity: agent.running ? 0.6 : 1 }}>
      <ResultsHeader count={agent.cases.length} scenarios={groups.length} open={open} onToggle={() => setOpen((v) => !v)} />
      {open && (
        <Box sx={{ borderTop: '1px solid var(--tm-rule)' }}>
          {groups.map((g) => (
            <Scenario
              key={g.name}
              name={g.name}
              items={g.items}
              selected={agent.selected}
              addedKeys={agent.addedKeys}
              doneVerb={doneVerb}
              viewingId={viewingId}
              disabled={disabled}
              onToggle={agent.toggle}
              onView={onView}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}

/* ---------------- the bottom: batch actions and refine ---------------- */

function FolderMenu({ repo, folderId, onFolder, subfolders, onSubfolders }) {
  const [anchor, setAnchor] = useState(null);
  const tree = useMemo(() => {
    const out = [];
    const walk = (parentId, depth) => {
      for (const f of repo.folders.filter((x) => (x.parentId ?? null) === parentId)) {
        out.push({ ...f, depth });
        walk(f.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  }, [repo.folders]);
  const current = repo.folders.find((f) => f.id === folderId);

  const create = async () => {
    setAnchor(null);
    const name = window.prompt('New folder name');
    if (name?.trim()) {
      const folder = await repo.createFolder(name.trim(), null);
      if (folder) onFolder(folder.id);
    }
  };

  return (
    <>
      <Button
        variant="outlined"
        size="small"
        onClick={(e) => setAnchor(e.currentTarget)}
        startIcon={<FolderIcon size={15} />}
        endIcon={<ChevronDown size={13} />}
        sx={{ maxWidth: 220, '& .MuiButton-startIcon': { mr: 0.5 } }}
        aria-haspopup="menu"
      >
        <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{current?.name ?? 'Choose folder'}</Box>
      </Button>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)} disableScrollLock sx={{ zIndex: 1450 }} anchorOrigin={{ vertical: 'top', horizontal: 'right' }} transformOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        {tree.map((f) => (
          <MenuItem
            key={f.id}
            selected={f.id === folderId}
            onClick={() => {
              onFolder(f.id);
              setAnchor(null);
            }}
            sx={{ pl: 1.5 + f.depth * 2, gap: 1 }}
          >
            <FolderIcon size={15} sx={{ color: 'var(--tm-muted)' }} /> {f.name}
          </MenuItem>
        ))}
        <MenuItem onClick={create} sx={{ gap: 1, color: 'var(--tm-primary)', borderTop: '1px solid var(--tm-rule)' }}>
          <PlusIcon size={14} /> New Folder
        </MenuItem>
        <MenuItem onClick={() => onSubfolders(!subfolders)} sx={{ gap: 1 }}>
          <Checkbox checked={subfolders} sx={{ p: 0 }} tabIndex={-1} />
          Save scenarios as sub-folders
        </MenuItem>
      </Menu>
    </>
  );
}

/** Where exported cases go, in generator mode: Excel, Jira, Azure DevOps... */
function DestinationSelect({ targets, value, onChange }) {
  return (
    <TextField
      select
      size="small"
      label="Export to"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      SelectProps={{ native: true }}
      sx={{ minWidth: 150, '& .MuiInputBase-root': { fontSize: 13.5 } }}
    >
      {targets.map((t) => (
        <option key={t.key} value={t.key}>
          {t.label}
        </option>
      ))}
    </TextField>
  );
}

function BatchBar({ agent, repo, folderId, onFolder, subfolders, onSubfolders, adding, onAdd, exportTargets, destination, onDestination }) {
  const exporting = Boolean(exportTargets);
  const selectable = agent.cases.filter((tc) => !agent.addedKeys[tc.id]);
  const chosen = selectable.filter((tc) => agent.selected.has(tc.id));
  const busy = Boolean(agent.running) || adding;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', px: 1.5, py: 1, border: '1px solid var(--tm-rule)', borderRadius: '10px', bgcolor: 'var(--tm-surface)' }}>
      <Checkbox
        checked={selectable.length > 0 && chosen.length === selectable.length}
        indeterminate={chosen.length > 0 && chosen.length < selectable.length}
        onChange={(e) => agent.toggle(selectable.map((tc) => tc.id), e.target.checked)}
        disabled={busy || selectable.length === 0}
        sx={{ p: 0 }}
        inputProps={{ 'aria-label': 'Select all test cases' }}
      />
      <Box sx={{ fontSize: 13.5, color: 'var(--tm-ink)', fontWeight: 500, mr: 0.5 }}>{chosen.length} test cases selected</Box>
      <Button variant="contained" size="small" onClick={() => onAdd(chosen)} disabled={busy || chosen.length === 0 || (exporting ? !destination : !folderId)}>
        {exporting ? (adding ? 'Exporting…' : 'Export') : adding ? 'Adding…' : 'Add'}
      </Button>
      <Button variant="outlined" size="small" onClick={agent.rejectSelected} disabled={busy || chosen.length === 0}>
        Reject
      </Button>
      <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 0.5 }}>
        {exporting ? (
          <DestinationSelect targets={exportTargets} value={destination} onChange={onDestination} />
        ) : (
          <FolderMenu repo={repo} folderId={folderId} onFolder={onFolder} subfolders={subfolders} onSubfolders={onSubfolders} />
        )}
        <Tooltip
          arrow
          placement="top"
          title={
            <Box sx={{ p: 0.5 }}>
              <Box sx={{ fontWeight: 600, mb: 0.25 }}>Batch Actions</Box>
              {exporting
                ? 'Select test cases to export them together, or reject unwanted ones so they won\'t reappear.'
                : 'Streamline your workflow. Select multiple test cases to add to a folder at once, or reject unwanted ones so they won\'t reappear.'}
            </Box>
          }
        >
          <IconButton size="small" aria-label="About batch actions" sx={{ color: 'var(--tm-muted)' }}>
            <InfoIcon size={17} />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
}

function RefineBox({ agent, options, repo }) {
  const [text, setText] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsButton = useRef(null);
  const selectable = agent.cases.filter((tc) => !agent.addedKeys[tc.id]);
  const chosen = selectable.filter((tc) => agent.selected.has(tc.id));
  const scoped = chosen.length > 0 && chosen.length < selectable.length;
  const busy = Boolean(agent.running);

  const send = async () => {
    if (text.trim().length < 3 || busy) return;
    if (await agent.refine({}, text)) setText('');
  };

  return (
    <Box sx={{ border: '1px solid var(--tm-rule-strong)', borderRadius: '10px', bgcolor: 'var(--tm-surface)', '&:focus-within': { borderColor: 'var(--tm-primary)', boxShadow: '0 0 0 3px var(--tm-primary-soft)' } }}>
      {chosen.length > 0 && (
        <Box sx={{ px: 1.25, pt: 1 }}>
          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, pl: 1, pr: 0.25, py: '2px', borderRadius: '6px', bgcolor: 'var(--tm-sunken)', fontSize: 12.5, color: 'var(--tm-ink-soft)' }}>
            {chosen.length} test cases
            <IconButton size="small" aria-label="Refine all test cases instead" title="Refine all test cases instead" onClick={() => agent.toggle(chosen.map((tc) => tc.id), false)} sx={{ p: '2px' }}>
              <CloseIcon size={12} />
            </IconButton>
          </Box>
        </Box>
      )}
      <OutlinedInput
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
        placeholder="Refine and Add Test Cases"
        multiline
        minRows={2}
        maxRows={8}
        fullWidth
        disabled={busy}
        inputProps={{ maxLength: 2000, 'aria-label': 'Refine and add test cases' }}
        sx={{ border: 0, boxShadow: 'none !important', '& .MuiOutlinedInput-notchedOutline': { border: '0 !important' } }}
      />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1, pb: 1 }}>
        <AddRequirements agent={agent} options={options} anchorOrigin={{ vertical: 'top', horizontal: 'left' }} transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
          {(open) => (
            <IconButton size="small" onClick={open} aria-label="Add requirements" title="Add requirements" sx={{ border: '1px solid var(--tm-rule)', borderRadius: '6px', color: 'var(--tm-ink-soft)' }}>
              <PlusIcon size={15} />
            </IconButton>
          )}
        </AddRequirements>
        <IconButton ref={settingsButton} size="small" onClick={() => setSettingsOpen(true)} aria-label="Settings" title="Settings" sx={{ border: '1px solid var(--tm-rule)', borderRadius: '6px', color: 'var(--tm-ink-soft)' }}>
          <SettingsIcon size={15} />
        </IconButton>
        <Box sx={{ ml: 1, fontSize: 12, color: 'var(--tm-muted)' }}>
          {scoped ? `Applies to the ${chosen.length} selected` : 'Applies to all test cases'} · rejected ones will not come back
        </Box>
        <IconButton
          onClick={send}
          disabled={busy || text.trim().length < 3}
          aria-label="Send"
          sx={{ ml: 'auto', width: 32, height: 32, bgcolor: 'var(--tm-primary)', color: '#fff', '&:hover': { bgcolor: 'var(--tm-primary-hover)' }, '&.Mui-disabled': { bgcolor: 'var(--tm-rule)', color: '#fff' } }}
        >
          <SendIcon size={15} />
        </IconButton>
      </Box>
      <SettingsPopover
        anchorEl={settingsButton.current}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        input={agent.input}
        change={agent.change}
        options={options}
        folders={repo?.folders ?? []}
        counts={repo?.counts ?? {}}
        noRepository={!repo}
        templateLocked
      />
    </Box>
  );
}

/* ---------------- the conversation ---------------- */

/**
 * The generator after "Generate": one thread of rounds -- what was asked,
 * how the agent thought about it, and what it produced -- with the current
 * suite selectable, and batch actions and refinement pinned at the bottom.
 */
export default function GenerateConversation({
  agent,
  options,
  repo,
  folderId,
  onFolder,
  subfolders,
  onSubfolders,
  adding,
  onAdd,
  viewingId,
  onView,
  exportTargets,
  destination,
  onDestination,
}) {
  const doneVerb = exportTargets ? 'Exported' : 'Added';
  const end = useRef(null);
  const turns = agent.conversation;
  const lastAi = turns.map((m) => m.role).lastIndexOf('ai');

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [turns.length, agent.running?.stage]);

  // The first run has no conversation yet: show the request and live thinking.
  const firstRun = agent.running && turns.length === 0;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
      <Box sx={{ flex: 1, overflowY: 'auto', px: 2, py: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {firstRun && (
          <>
            <UserTurn message={{ text: agent.input.prompt, files: agent.input.files }} />
            <Thinking running={agent.running} />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: 13.5, color: 'var(--tm-muted)' }}>
              <SparkleIcon size={14} sx={{ color: 'var(--tm-ai)' }} /> Generating scenarios and test cases…
            </Box>
          </>
        )}
        {turns.map((m, i) =>
          m.role === 'user' ? (
            <UserTurn key={i} message={m} />
          ) : (
            <Box key={i} sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Thinking message={m} />
              <Findings message={m} />
              {i === lastAi && !(agent.running && agent.running.refining) ? (
                <CurrentResults agent={agent} doneVerb={doneVerb} viewingId={viewingId} disabled={Boolean(agent.running)} onView={onView} />
              ) : (
                <PastResults message={m} />
              )}
            </Box>
          ),
        )}
        {agent.running?.refining && (
          <>
            <Thinking running={agent.running} />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: 13.5, color: 'var(--tm-muted)' }}>
              <SparkleIcon size={14} sx={{ color: 'var(--tm-ai)' }} /> Generating scenarios and test cases…
            </Box>
          </>
        )}
        {agent.error && (
          <Box role="alert" sx={{ fontSize: 13.5, color: 'var(--tm-bad)', bgcolor: 'var(--tm-bad-soft)', borderRadius: '8px', p: 1.25 }}>
            <b>{agent.error.title}.</b> {agent.error.message}
          </Box>
        )}
        {agent.running && (
          <Button variant="text" size="small" onClick={agent.cancel} sx={{ alignSelf: 'flex-start', color: 'var(--tm-muted)' }}>
            Stop generating
          </Button>
        )}
        <div ref={end} />
      </Box>

      {agent.cases.length > 0 && (
        <Box sx={{ px: 2, pb: 2, pt: 1, display: 'flex', flexDirection: 'column', gap: 1, borderTop: '1px solid var(--tm-rule)', bgcolor: 'var(--tm-ground)' }}>
          <BatchBar
            agent={agent}
            repo={repo}
            folderId={folderId}
            onFolder={onFolder}
            subfolders={subfolders}
            onSubfolders={onSubfolders}
            adding={adding}
            onAdd={onAdd}
            exportTargets={exportTargets}
            destination={destination}
            onDestination={onDestination}
          />
          <RefineBox agent={agent} options={options} repo={repo} />
        </Box>
      )}
    </Box>
  );
}
