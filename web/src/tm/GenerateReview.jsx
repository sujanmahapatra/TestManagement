import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, Checkbox, IconButton, Menu, MenuItem, OutlinedInput, Select, Switch } from '@mui/material';
import { AiBadge, CheckIcon, ChevronDown, ChevronRight, CloseIcon, FolderIcon, PaperclipIcon, PlusIcon, PriorityIcon, SendIcon } from './icons';
import { PRIORITY_STYLE } from './theme';
import { LiveReasoning, StageMark, contextLabel } from './GenerateProgress';
import CaseDrawer from './CaseDrawer';
import { AGENT_STAGES, REFINE_SUGGESTIONS, groupByScenario } from '../domain/agent';

const pill = (bg, color) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  fontSize: 12,
  fontWeight: 500,
  px: '8px',
  py: '1px',
  borderRadius: '10px',
  bgcolor: bg,
  color,
  whiteSpace: 'nowrap',
});

/* ---------------- the conversation ---------------- */

function UserBubble({ message }) {
  return (
    <Box sx={{ alignSelf: 'flex-end', maxWidth: '88%', bgcolor: 'var(--tm-primary-soft)', color: 'var(--tm-ink)', borderRadius: '12px 12px 4px 12px', px: 1.5, py: 1, fontSize: 14 }}>
      {message.text && (
        <Box sx={{ whiteSpace: 'pre-wrap', display: '-webkit-box', WebkitLineClamp: 8, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{message.text}</Box>
      )}
      {message.scope > 0 && <Box sx={{ fontSize: 12, color: 'var(--tm-muted)', mt: 0.5 }}>Applied to {message.scope} selected test cases</Box>}
      {message.files?.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: message.text ? 1 : 0 }}>
          {message.files.map((f) => (
            <Box key={f.name} sx={{ ...pill('var(--tm-surface)', 'var(--tm-ink-soft)'), border: '1px solid var(--tm-rule)', maxWidth: 220 }}>
              <PaperclipIcon size={12} />
              <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

function AiMessage({ message }) {
  const [showAssumptions, setShowAssumptions] = useState(false);
  const [showReasoning, setShowReasoning] = useState(false);
  return (
    <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
      <AiBadge size={26} />
      <Box sx={{ flex: 1, minWidth: 0, fontSize: 14, color: 'var(--tm-ink-soft)', display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Box sx={{ fontSize: 13, fontWeight: 600, color: 'var(--tm-ink)' }}>Test Case Generator</Box>
        {message.changeSummary ? (
          <>
            <Box>{message.changeSummary}</Box>
            <Box sx={{ fontSize: 13, color: 'var(--tm-muted)' }}>
              {message.changed} {message.changed === 1 ? 'test case' : 'test cases'} new or edited
              {message.removed?.length ? ` · ${message.removed.length} removed` : ''}
            </Box>
            {message.removed?.length > 0 && <Box sx={{ fontSize: 13, color: 'var(--tm-muted)' }}>Removed: {message.removed.join('; ')}</Box>}
          </>
        ) : (
          <>
            <Box>{message.summary}</Box>
            <Box sx={{ fontSize: 13, color: 'var(--tm-ink)', fontWeight: 500 }}>
              Generated {message.count} test cases across {message.scenarios} {message.scenarios === 1 ? 'scenario' : 'scenarios'}.
            </Box>
            {message.truncated && <Box sx={{ fontSize: 13, color: 'var(--tm-warn)' }}>Only the first 100 were kept.</Box>}
          </>
        )}
        {message.context && <Box sx={{ fontSize: 12.5, color: 'var(--tm-muted)' }}>{contextLabel(message.context)}</Box>}
        {message.gaps?.length > 0 && (
          <Box sx={{ bgcolor: 'var(--tm-warn-soft)', borderRadius: '8px', px: 1.25, py: 1 }}>
            <Box sx={{ fontSize: 12.5, fontWeight: 600, color: 'var(--tm-warn)', mb: 0.5 }}>Missing from the requirement</Box>
            <Box component="ul" sx={{ m: 0, pl: 2.25, fontSize: 13, color: 'var(--tm-ink-soft)' }}>
              {message.gaps.map((g) => <li key={g}>{g}</li>)}
            </Box>
          </Box>
        )}
        {message.notices?.map((n) => <Box key={n} sx={{ fontSize: 12.5, color: 'var(--tm-warn)' }}>{n}</Box>)}
        {message.assumptions?.length > 0 && (
          <Box>
            <Box
              component="button"
              type="button"
              onClick={() => setShowAssumptions((v) => !v)}
              aria-expanded={showAssumptions}
              sx={{ all: 'unset', cursor: 'pointer', fontSize: 13, color: 'var(--tm-primary)', fontWeight: 500 }}
            >
              {showAssumptions ? 'Hide' : 'Show'} {message.assumptions.length} assumptions
            </Box>
            {showAssumptions && (
              <Box component="ul" sx={{ m: '6px 0 0', pl: 2.25, fontSize: 13, color: 'var(--tm-ink-soft)' }}>
                {message.assumptions.map((a) => <li key={a}>{a}</li>)}
              </Box>
            )}
          </Box>
        )}
        {message.reasoning && (
          <Box>
            <Box
              component="button"
              type="button"
              onClick={() => setShowReasoning((v) => !v)}
              aria-expanded={showReasoning}
              sx={{ all: 'unset', cursor: 'pointer', fontSize: 13, color: 'var(--tm-ai)', fontWeight: 500 }}
            >
              {showReasoning ? 'Hide reasoning' : 'Show reasoning'}
            </Box>
            {showReasoning && <LiveReasoning text={message.reasoning} maxHeight={260} />}
          </Box>
        )}
      </Box>
    </Box>
  );
}

function Thinking({ running }) {
  const label = AGENT_STAGES.find((s) => s.key === running.stage)?.label ?? 'Working';
  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'center' }} aria-live="polite">
        <AiBadge size={26} />
        <StageMark state="active" size={16} />
        <Box sx={{ fontSize: 14, color: 'var(--tm-muted)' }}>
          {label}…{running.stage === 'write' && running.drafted ? ` ${running.drafted} drafted` : ''}
        </Box>
      </Box>
      <LiveReasoning text={running.reasoning} maxHeight={150} />
    </Box>
  );
}

function RefineBox({ total, scoped, accepted, disabled, onSend }) {
  const [text, setText] = useState('');
  const send = async () => {
    if (text.trim().length < 3) return;
    if (await onSend(text)) setText('');
  };
  return (
    <Box sx={{ borderTop: '1px solid var(--tm-rule)', p: 1.5, display: 'flex', flexDirection: 'column', gap: 1, bgcolor: 'var(--tm-surface)' }}>
      <Box sx={{ display: 'flex', gap: 0.75, overflowX: 'auto', pb: 0.25 }}>
        {REFINE_SUGGESTIONS.slice(0, 4).map((s) => (
          <Box
            key={s}
            component="button"
            type="button"
            disabled={disabled}
            onClick={() => setText(s)}
            title={s}
            sx={{
              flex: 'none',
              maxWidth: 240,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontSize: 12.5,
              px: 1.25,
              py: '5px',
              borderRadius: '14px',
              border: '1px solid #ddd6fe',
              bgcolor: 'var(--tm-ai-soft)',
              color: '#5b21b6',
              cursor: 'pointer',
              fontFamily: 'inherit',
              '&:hover': { bgcolor: '#ede9fe' },
            }}
          >
            {s}
          </Box>
        ))}
      </Box>
      <Box sx={{ position: 'relative' }}>
        <OutlinedInput
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Refine and add test cases…"
          multiline
          minRows={2}
          maxRows={6}
          disabled={disabled}
          fullWidth
          inputProps={{ maxLength: 2000, 'aria-label': 'Refine and add test cases' }}
          sx={{ pr: 5 }}
        />
        <IconButton
          onClick={send}
          disabled={disabled || text.trim().length < 3}
          aria-label="Send"
          sx={{ position: 'absolute', right: 6, bottom: 6, width: 32, height: 32, borderRadius: '8px', bgcolor: 'var(--tm-primary)', color: '#fff', '&:hover': { bgcolor: 'var(--tm-primary-hover)' }, '&.Mui-disabled': { bgcolor: 'var(--tm-rule)', color: '#fff' } }}
        >
          <SendIcon size={16} />
        </IconButton>
      </Box>
      <Box sx={{ fontSize: 12, color: 'var(--tm-muted)' }}>
        {scoped ? `Applies to the ${scoped} selected test cases; the rest stay as they are.` : `Applies to all ${total} test cases. Select some to refine only those.`}
        {accepted ? ' Accepted cases are kept as they are.' : ''} Rejected cases are removed and not written again.
      </Box>
    </Box>
  );
}

/* ---------------- the case list ---------------- */

/** Accept / reject: a small toggle, filled with its colour when set. */
function Verdict({ active, tone, label, onClick, disabled, children }) {
  return (
    <IconButton
      size="small"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      sx={{
        width: 28,
        height: 28,
        borderRadius: '6px',
        border: '1px solid',
        borderColor: active ? tone : 'var(--tm-rule-strong)',
        bgcolor: active ? tone : 'var(--tm-surface)',
        color: active ? '#fff' : 'var(--tm-muted)',
        '&:hover': { bgcolor: active ? tone : 'var(--tm-sunken)', color: active ? '#fff' : tone },
      }}
    >
      {children}
    </IconButton>
  );
}

function CaseRow({ testCase, checked, verdict, disabled, onToggle, onView, onReview }) {
  const p = PRIORITY_STYLE[testCase.priority] ?? PRIORITY_STYLE.medium;
  const rejected = verdict === 'rejected';
  return (
    <Box
      sx={{
        opacity: rejected ? 0.55 : 1,
        bgcolor: verdict === 'accepted' ? 'var(--tm-ok-soft)' : 'transparent',
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
        pl: 5,
        pr: 2,
        py: 1.1,
        borderTop: '1px solid var(--tm-rule)',
        '&:hover': { bgcolor: 'var(--tm-hover)' },
        '&:hover .tm-view': { opacity: 1 },
      }}
    >
      <Checkbox checked={checked} onChange={(e) => onToggle(e.target.checked)} disabled={disabled || rejected} sx={{ p: 0 }} inputProps={{ 'aria-label': `Select ${testCase.title}` }} />
      <Box title={p.label} sx={{ display: 'inline-flex' }}>
        <PriorityIcon priority={testCase.priority} />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ fontSize: 14, color: 'var(--tm-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: rejected ? 'line-through' : 'none' }}>{testCase.title}</Box>
        {testCase.description && (
          <Box sx={{ fontSize: 12.5, color: 'var(--tm-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{testCase.description}</Box>
        )}
      </Box>
      {testCase.change === 'new' && <Box sx={pill('var(--tm-ok-soft)', 'var(--tm-ok)')}>New</Box>}
      {testCase.change === 'edited' && <Box sx={pill('var(--tm-primary-soft)', 'var(--tm-primary-ink)')}>Edited</Box>}
      {testCase.kind && testCase.kind !== 'positive' && <Box sx={pill('var(--tm-warn-soft)', 'var(--tm-warn)')}>{testCase.kind === 'edge' ? 'Edge' : 'Negative'}</Box>}
      {testCase.dataset && <Box sx={pill('var(--tm-ai-soft)', 'var(--tm-ai)')}>{testCase.dataset.rows.length} runs</Box>}
      <Box sx={{ ...pill('var(--tm-sunken)', 'var(--tm-ink-soft)'), display: { xs: 'none', sm: 'inline-flex' } }}>{testCase.category}</Box>
      <Button className="tm-view" size="small" variant="text" onClick={onView} sx={{ minWidth: 0, opacity: { md: 0.75 } }}>
        View
      </Button>
      <Box sx={{ display: 'flex', gap: 0.5, flex: 'none' }}>
        <Verdict label={verdict === 'accepted' ? 'Undo accept' : 'Accept'} active={verdict === 'accepted'} tone="#16a34a" disabled={disabled} onClick={() => onReview('accepted')}>
          <CheckIcon size={15} />
        </Verdict>
        <Verdict label={rejected ? 'Undo reject' : 'Reject'} active={rejected} tone="#dc2626" disabled={disabled} onClick={() => onReview('rejected')}>
          <CloseIcon size={14} />
        </Verdict>
      </Box>
    </Box>
  );
}

function ScenarioGroup({ name, items, selected, reviews, disabled, onToggle, onView, onReview }) {
  const [open, setOpen] = useState(true);
  const selectable = items.filter((tc) => reviews[tc.id] !== 'rejected');
  const count = selectable.filter((tc) => selected.has(tc.id)).length;
  return (
    <Box sx={{ border: '1px solid var(--tm-rule)', borderRadius: '10px', overflow: 'hidden', bgcolor: 'var(--tm-surface)' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1.1, bgcolor: '#fafbfc' }}>
        <IconButton size="small" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={open ? `Collapse ${name}` : `Expand ${name}`} sx={{ p: '2px', color: 'var(--tm-muted)' }}>
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </IconButton>
        <Checkbox
          checked={selectable.length > 0 && count === selectable.length}
          indeterminate={count > 0 && count < selectable.length}
          onChange={(e) => onToggle(selectable.map((tc) => tc.id), e.target.checked)}
          disabled={disabled}
          sx={{ p: 0 }}
          inputProps={{ 'aria-label': `Select all in ${name}` }}
        />
        <Box sx={{ fontSize: 14, fontWeight: 600, color: 'var(--tm-ink)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {name}
        </Box>
        <Box sx={{ fontSize: 12.5, color: 'var(--tm-muted)' }}>
          {items.length} {items.length === 1 ? 'test case' : 'test cases'}
        </Box>
      </Box>
      {open && items.map((tc) => (
        <CaseRow
          key={tc.id}
          testCase={tc}
          checked={selected.has(tc.id)}
          verdict={reviews[tc.id]}
          disabled={disabled}
          onToggle={(on) => onToggle([tc.id], on)}
          onView={() => onView(tc)}
          onReview={(v) => onReview(tc.id, v)}
        />
      ))}
    </Box>
  );
}

/** Folder picker for "Add to": the tree, plus a new folder at the top level. */
function FolderPicker({ repo, value, onChange }) {
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

  const create = async () => {
    setAnchor(null);
    const name = window.prompt('New folder name');
    if (name?.trim()) {
      const folder = await repo.createFolder(name.trim(), null);
      if (folder) onChange(folder.id);
    }
  };

  return (
    <>
      <Button
        variant="outlined"
        onClick={(e) => setAnchor(e.currentTarget)}
        startIcon={<FolderIcon size={17} sx={{ color: 'var(--tm-primary)' }} />}
        endIcon={<ChevronDown size={15} />}
        sx={{ maxWidth: 300, justifyContent: 'flex-start', '& .MuiButton-startIcon': { mr: 0.75 } }}
      >
        <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {value ? repo.pathOf(value) : 'Choose folder'}
        </Box>
      </Button>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)} disableScrollLock sx={{ zIndex: 1500 }}>
        {tree.map((f) => (
          <MenuItem
            key={f.id}
            selected={f.id === value}
            onClick={() => {
              onChange(f.id);
              setAnchor(null);
            }}
            sx={{ pl: 1.5 + f.depth * 2, gap: 1 }}
          >
            <FolderIcon size={16} sx={{ color: 'var(--tm-muted)' }} />
            {f.name}
          </MenuItem>
        ))}
        <MenuItem onClick={create} sx={{ gap: 1, color: 'var(--tm-primary)', borderTop: '1px solid var(--tm-rule)' }}>
          <PlusIcon size={15} /> Create folder
        </MenuItem>
      </Menu>
    </>
  );
}

/* ---------------- the screen ---------------- */

/**
 * Step three: review what the agent wrote, refine it in conversation, and
 * add the selected cases to a folder.
 */
export default function GenerateReview({ agent, options, repo, initialFolderId, onAdd, onStartOver }) {
  const [viewing, setViewing] = useState(null);
  const [priority, setPriority] = useState('all');
  const [category, setCategory] = useState('all');
  const [changesOnly, setChangesOnly] = useState(false);
  const [folderId, setFolderId] = useState(initialFolderId);
  const [subfolders, setSubfolders] = useState(true);
  const [adding, setAdding] = useState(false);
  const chatEnd = useRef(null);

  const { cases, selected, running } = agent;
  const busy = Boolean(running) || adding;

  useEffect(() => {
    if (!folderId && repo.folders.length) setFolderId(repo.folders[0].id);
  }, [folderId, repo.folders]);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: 'end' });
  }, [agent.conversation.length, running]);

  const visible = useMemo(
    () =>
      cases.filter(
        (tc) =>
          (priority === 'all' || tc.priority === priority) &&
          (category === 'all' || tc.category === category) &&
          (!changesOnly || tc.change === 'new' || tc.change === 'edited'),
      ),
    [cases, priority, category, changesOnly],
  );
  const groups = useMemo(() => groupByScenario(visible), [visible]);
  const hasChanges = cases.some((tc) => tc.change === 'new' || tc.change === 'edited');
  const reviews = agent.reviews;
  const chosen = cases.filter((tc) => selected.has(tc.id) && reviews[tc.id] !== 'rejected');
  const allIds = cases.filter((tc) => reviews[tc.id] !== 'rejected').map((tc) => tc.id);
  const accepted = cases.filter((tc) => reviews[tc.id] === 'accepted').length;
  const rejected = cases.filter((tc) => reviews[tc.id] === 'rejected').length;

  const add = async () => {
    setAdding(true);
    await onAdd({ folderId, subfolders, testCases: chosen });
    setAdding(false);
  };

  const filter = (value, onChange, items, label, render = (i) => i) => (
    <Select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      input={<OutlinedInput size="small" />}
      MenuProps={{ disableScrollLock: true, sx: { zIndex: 1500 } }}
      inputProps={{ 'aria-label': label }}
      sx={{ fontSize: 13.5, minWidth: 132, '& .MuiSelect-select': { py: '6px' } }}
    >
      <MenuItem value="all">{label}: All</MenuItem>
      {items.map((i) => (
        <MenuItem key={i} value={i}>{render(i)}</MenuItem>
      ))}
    </Select>
  );

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '380px 1fr' }, height: '100%', minHeight: 0 }}>
      {/* conversation */}
      <Box sx={{ display: { xs: 'none', md: 'flex' }, flexDirection: 'column', minHeight: 0, borderRight: '1px solid var(--tm-rule)', bgcolor: '#fbfaff' }}>
        <Box sx={{ flex: 1, overflowY: 'auto', p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {agent.conversation.map((m, i) => (m.role === 'user' ? <UserBubble key={i} message={m} /> : <AiMessage key={i} message={m} />))}
          {running && <Thinking running={running} />}
          {agent.error && (
            <Box role="alert" sx={{ fontSize: 13.5, color: 'var(--tm-bad)', bgcolor: 'var(--tm-bad-soft)', borderRadius: '8px', p: 1.25 }}>
              <b>{agent.error.title}.</b> {agent.error.message}
            </Box>
          )}
          <div ref={chatEnd} />
        </Box>
        <RefineBox
          total={cases.length}
          scoped={chosen.length > 0 && chosen.length < allIds.length ? chosen.length : 0}
          accepted={accepted}
          disabled={busy}
          onSend={(text) => agent.refine({}, text)}
        />
      </Box>

      {/* cases */}
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, bgcolor: 'var(--tm-ground)' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap', px: 2.5, py: 1.5, borderBottom: '1px solid var(--tm-rule)', bgcolor: 'var(--tm-surface)' }}>
          <Checkbox
            checked={chosen.length === allIds.length && allIds.length > 0}
            indeterminate={chosen.length > 0 && chosen.length < allIds.length}
            onChange={(e) => agent.toggle(allIds, e.target.checked)}
            disabled={busy}
            sx={{ p: 0 }}
            inputProps={{ 'aria-label': 'Select all test cases' }}
          />
          <Box sx={{ fontSize: 14, color: 'var(--tm-ink)', fontWeight: 500 }}>
            {chosen.length} of {cases.length} selected
          </Box>
          {(accepted > 0 || rejected > 0) && (
            <Box sx={{ fontSize: 13, color: 'var(--tm-muted)' }}>
              {accepted > 0 && <Box component="span" sx={{ color: 'var(--tm-ok)' }}>{accepted} accepted</Box>}
              {accepted > 0 && rejected > 0 && ' · '}
              {rejected > 0 && <Box component="span" sx={{ color: 'var(--tm-bad)' }}>{rejected} rejected</Box>}
            </Box>
          )}
          <Box sx={{ ml: { sm: 'auto' }, display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            {filter(priority, setPriority, options.agent.priorities, 'Priority', (p) => (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <PriorityIcon priority={p} /> {PRIORITY_STYLE[p].label}
              </Box>
            ))}
            {filter(category, setCategory, options.agent.categories, 'Type')}
            {hasChanges && (
              <Box component="label" sx={{ display: 'flex', alignItems: 'center', fontSize: 13.5, color: 'var(--tm-ink-soft)', cursor: 'pointer' }}>
                <Switch size="small" checked={changesOnly} onChange={(e) => setChangesOnly(e.target.checked)} />
                Show changes only
              </Box>
            )}
            <Button variant="text" onClick={onStartOver} disabled={busy} sx={{ color: 'var(--tm-muted)' }}>
              Start over
            </Button>
          </Box>
        </Box>

        <Box sx={{ flex: 1, overflowY: 'auto', p: 2.5, display: 'flex', flexDirection: 'column', gap: 1.5, opacity: running ? 0.6 : 1, transition: 'opacity .15s' }}>
          {groups.map((g) => (
            <ScenarioGroup
              key={g.name}
              name={g.name}
              items={g.items}
              selected={selected}
              reviews={reviews}
              disabled={busy}
              onToggle={agent.toggle}
              onView={setViewing}
              onReview={agent.review}
            />
          ))}
          {groups.length === 0 && <Box sx={{ textAlign: 'center', color: 'var(--tm-muted)', py: 6, fontSize: 14 }}>No test cases match these filters.</Box>}
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', px: 2.5, py: 1.5, borderTop: '1px solid var(--tm-rule)', bgcolor: 'var(--tm-surface)' }}>
          <Box sx={{ fontSize: 14, color: 'var(--tm-ink-soft)' }}>Add to</Box>
          <FolderPicker repo={repo} value={folderId} onChange={setFolderId} />
          <Box component="label" sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: 14, color: 'var(--tm-ink-soft)', cursor: 'pointer' }}>
            <Checkbox checked={subfolders} onChange={(e) => setSubfolders(e.target.checked)} sx={{ p: 0 }} />
            Save scenarios as sub-folders
          </Box>
          <Button variant="contained" onClick={add} disabled={busy || chosen.length === 0 || !folderId} sx={{ ml: 'auto', px: 2.5 }}>
            {adding ? 'Adding…' : `Add ${chosen.length} ${chosen.length === 1 ? 'Test Case' : 'Test Cases'}`}
          </Button>
        </Box>
      </Box>

      <CaseDrawer
        open={Boolean(viewing)}
        testCase={viewing}
        options={options}
        subtitle={viewing?.scenario ?? 'Generated test case'}
        onClose={() => setViewing(null)}
        onSave={(next) => {
          agent.updateCase(next);
          setViewing(null);
        }}
      />
    </Box>
  );
}
