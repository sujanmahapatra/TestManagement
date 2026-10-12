import { useEffect, useState } from 'react';
import { Box, Button, IconButton, InputBase } from '@mui/material';
import { Chip, Eyebrow, Panel, PanelHead, Tabs } from './ui';
import { api } from '../api/client';
import { MONO } from '../theme';

/**
 * The generated cases, editable before anything is filed. What the reviewer
 * sees here is exactly what is sent -- the server takes the edited array
 * verbatim (after re-validating every string) rather than regenerating.
 *
 * The payload tab shows the request the chosen destination would send for
 * the case on screen, built server-side by that exporter's own code.
 */

const VIEWS = [
  { value: 'case', label: 'test case' },
  { value: 'payload', label: 'payload' },
];

/** A borderless line editor that reveals its frame on hover and focus. */
export const lineSx = {
  flex: 1,
  fontSize: 14,
  color: 'var(--ink-soft)',
  px: '6px',
  py: '2px',
  borderRadius: '4px',
  border: '1px solid transparent',
  '&:hover': { borderColor: 'var(--rule)' },
  '&.Mui-focused': { borderColor: 'var(--accent)', boxShadow: '0 0 0 3px var(--accent-soft)', bgcolor: 'var(--surface)' },
};

const ctrlSx = { width: 22, height: 22, fontSize: 13, color: 'var(--muted)', '&:hover': { color: 'var(--ink)' } };

export function EditableList({ title, items, ordered, disabled, onChange }) {
  const setItem = (index, value) => onChange(items.map((v, i) => (i === index ? value : v)));
  const remove = (index) => onChange(items.filter((_, i) => i !== index));
  const add = () => onChange([...items, '']);

  const move = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <Eyebrow component="h3">{title}</Eyebrow>

      <Box component={ordered ? 'ol' : 'ul'} sx={{ m: 0, p: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {items.map((item, index) => (
          <Box
            component="li"
            key={index}
            sx={{ display: 'flex', alignItems: 'flex-start', gap: '4px', '& .ctrl': { opacity: 0 }, '&:hover .ctrl, &:focus-within .ctrl': { opacity: 1 } }}
          >
            <Box
              aria-hidden
              sx={{
                width: 22,
                flex: 'none',
                pt: '5px',
                textAlign: 'right',
                fontFamily: MONO,
                fontSize: 12,
                color: ordered ? 'var(--accent)' : 'var(--muted)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {ordered ? `${index + 1}.` : '•'}
            </Box>
            <InputBase
              value={item}
              onChange={(e) => setItem(index, e.target.value)}
              multiline
              disabled={disabled}
              sx={lineSx}
              inputProps={{ 'aria-label': `${title} ${index + 1}` }}
            />
            <Box className="ctrl" sx={{ display: 'flex', flex: 'none', pt: '3px', transition: 'opacity .12s' }}>
              {ordered && (
                <>
                  <IconButton size="small" sx={ctrlSx} onClick={() => move(index, -1)} disabled={disabled || index === 0} title="Move up">
                    ↑
                  </IconButton>
                  <IconButton
                    size="small"
                    sx={ctrlSx}
                    onClick={() => move(index, 1)}
                    disabled={disabled || index === items.length - 1}
                    title="Move down"
                  >
                    ↓
                  </IconButton>
                </>
              )}
              <IconButton size="small" sx={ctrlSx} onClick={() => remove(index)} disabled={disabled} title="Remove">
                ×
              </IconButton>
            </Box>
          </Box>
        ))}
      </Box>

      <Button size="small" variant="text" onClick={add} disabled={disabled} sx={{ alignSelf: 'flex-start', ml: '22px', fontSize: 12.5 }}>
        + Add {ordered ? 'step' : 'line'}
      </Button>
    </Box>
  );
}

function CaseView({ testCase, disabled, onChange }) {
  const set = (patch) => onChange({ ...testCase, ...patch });

  return (
    <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box>
        <InputBase
          value={testCase.title}
          onChange={(e) => set({ title: e.target.value })}
          multiline
          fullWidth
          disabled={disabled}
          inputProps={{ 'aria-label': 'Title' }}
          sx={{ ...lineSx, ml: '-6px', fontSize: 16, fontWeight: 600, letterSpacing: '-.01em', color: 'var(--ink)' }}
        />
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '6px', mt: '9px' }}>
          <Chip tone="accent">{testCase.platformLabel}</Chip>
          {testCase.testTypeLabel && <Chip>{testCase.testTypeLabel}</Chip>}
          <Chip>{testCase.steps.length} steps</Chip>
          <Chip>{testCase.expectedResults.length} assertions</Chip>
          <Chip>platform-{testCase.platform}</Chip>
          {testCase.variant && testCase.variant !== 'happy-path' && <Chip tone="warn">{testCase.variant}</Chip>}
          {testCase.parameters &&
            Object.entries(testCase.parameters).map(([k, v]) => <Chip key={k}>{`${k}=${v}`}</Chip>)}
          {testCase.generatedBy === 'llm' && <Chip tone="accent">llm</Chip>}
        </Box>
      </Box>

      <Box component="hr" sx={{ border: 'none', borderTop: '1px solid var(--rule)', m: 0 }} />

      <EditableList title="Preconditions" items={testCase.preconditions} disabled={disabled} onChange={(preconditions) => set({ preconditions })} />
      <EditableList title="Steps" items={testCase.steps} ordered disabled={disabled} onChange={(steps) => set({ steps })} />
      <EditableList
        title="Expected results"
        items={testCase.expectedResults}
        disabled={disabled}
        onChange={(expectedResults) => set({ expectedResults })}
      />
      <EditableList
        title="Target environments"
        items={testCase.environments}
        disabled={disabled}
        onChange={(environments) => set({ environments })}
      />
    </Box>
  );
}

/* ---------------- payload view ---------------- */

/** Minimal JSON highlighting: keys accent, strings green, literals amber. */
function JsonView({ value }) {
  const json = JSON.stringify(value, null, 2);
  const parts = [];
  const pattern = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null|-?\d+(?:\.\d+)?)\b/g;
  let last = 0;
  let match;
  while ((match = pattern.exec(json)) !== null) {
    if (match.index > last) parts.push(json.slice(last, match.index));
    if (match[1] !== undefined) {
      parts.push(
        <Box component="span" key={match.index} sx={{ color: match[2] ? 'var(--accent)' : 'var(--ok)' }}>
          {match[1]}
        </Box>,
      );
      if (match[2]) parts.push(match[2]);
    } else {
      parts.push(
        <Box component="span" key={match.index} sx={{ color: 'var(--warn)' }}>
          {match[3]}
        </Box>,
      );
    }
    last = pattern.lastIndex;
  }
  parts.push(json.slice(last));

  return (
    <Box
      component="pre"
      sx={{
        m: 0,
        px: 2,
        py: '14px',
        bgcolor: 'var(--surface-sunken)',
        borderTop: '1px solid var(--rule)',
        overflow: 'auto',
        maxHeight: 560,
        fontFamily: MONO,
        fontSize: 12,
        lineHeight: 1.55,
        color: 'var(--ink-soft)',
      }}
    >
      {parts}
    </Box>
  );
}

/** Excel is a file, not a request, so its payload view is the sheet grid. */
function SheetView({ testCase }) {
  const cell = { border: '1px solid var(--rule)', px: '9px', py: '6px', textAlign: 'left', verticalAlign: 'top', color: 'var(--ink-soft)', whiteSpace: 'pre-line' };
  const metaKey = { ...cell, bgcolor: 'var(--surface-sunken)', fontWeight: 600, color: 'var(--muted)', whiteSpace: 'nowrap' };
  const head = { ...cell, bgcolor: 'var(--accent)', color: 'var(--on-accent)', fontWeight: 600 };
  const meta = [
    ['Title', testCase.title],
    ['Platform', testCase.platformLabel],
    ['Environments', testCase.environments.join('\n')],
    ['Preconditions', testCase.preconditions.map((p, i) => `${i + 1}. ${p}`).join('\n')],
  ];

  return (
    <Box sx={{ overflowX: 'auto', borderTop: '1px solid var(--rule)' }}>
      <Box component="table" sx={{ borderCollapse: 'collapse', width: '100%', fontSize: 12.5 }}>
        <tbody>
          {meta.map(([k, v]) => (
            <tr key={k}>
              <Box component="td" sx={metaKey}>{k}</Box>
              <Box component="td" sx={cell} colSpan={2}>{v}</Box>
            </tr>
          ))}
          <tr>
            <td colSpan={3} style={{ height: 10 }} />
          </tr>
          <tr>
            {['Step', 'Action', 'Expected result'].map((h) => (
              <Box component="th" key={h} sx={head}>{h}</Box>
            ))}
          </tr>
          {testCase.steps.map((action, index) => {
            const isLast = index === testCase.steps.length - 1;
            return (
              <tr key={index}>
                <Box component="td" sx={{ ...cell, fontFamily: MONO, textAlign: 'center', width: 48, color: 'var(--muted)' }}>
                  {index + 1}
                </Box>
                <Box component="td" sx={cell}>{action}</Box>
                <Box component="td" sx={cell}>
                  {isLast ? testCase.expectedResults.map((r, i) => `${i + 1}. ${r}`).join('\n') : ''}
                </Box>
              </tr>
            );
          })}
        </tbody>
      </Box>
    </Box>
  );
}

export function PayloadView({ testCase, destination }) {
  const [state, setState] = useState({ loading: true });

  // Debounced so typing in the case view does not fire a request per key.
  useEffect(() => {
    if (!destination) return undefined;
    let live = true;
    const timer = setTimeout(() => {
      api
        .payloadPreview({ destination, testCase })
        .then((request) => live && setState({ request }))
        .catch((err) => live && setState({ error: err.message }));
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [testCase, destination]);

  if (state.error) {
    return <Box sx={{ p: 2, fontSize: 13, color: 'var(--bad)' }}>{state.error}</Box>;
  }
  if (!state.request) {
    return <Box sx={{ p: 2, fontSize: 13, color: 'var(--muted)' }}>Building the request…</Box>;
  }

  const { method, path, contentType, body, sheet } = state.request;
  return (
    <>
      <Box sx={{ px: 2, py: 1.5, display: 'flex', flexWrap: 'wrap', gap: '8px 12px', alignItems: 'center' }}>
        <Box
          component="span"
          sx={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 500, px: '7px', py: '2px', borderRadius: '4px', bgcolor: 'var(--accent-soft)', color: 'var(--accent-ink)' }}
        >
          {method}
        </Box>
        <Box component="span" sx={{ fontFamily: MONO, fontSize: 12.5, color: 'var(--ink-soft)', overflowWrap: 'anywhere' }}>
          {path}
        </Box>
        <Chip>{contentType}</Chip>
      </Box>
      {sheet ? <SheetView testCase={sheet} /> : <JsonView value={body} />}
    </>
  );
}

/* ---------------- the panel ---------------- */

const caseLabel = (tc, i) => {
  const ref = tc.title.match(/^\[[^\]]+\]\s+([A-Z][A-Z0-9]*[-_]\d+(?:\.\d+)*)\b/)?.[1];
  const variant = tc.variant && tc.variant !== 'happy-path' ? tc.variant : null;
  return [ref ?? `#${i + 1}`, variant].filter(Boolean).join(' · ');
};

export default function GeneratedPanel({ testCases, edited, disabled, destination, onChange, onReset }) {
  const [view, setView] = useState('case');
  const [active, setActive] = useState(0);

  // A fresh preview or a filed batch starts on its first case again.
  useEffect(() => setActive(0), [testCases?.length]);

  const has = testCases?.length > 0;
  const index = has ? Math.min(active, testCases.length - 1) : 0;
  const current = has ? testCases[index] : null;
  const replace = (next) => onChange(testCases.map((c, i) => (i === index ? next : c)));

  return (
    <Panel aria-label="Generated test cases">
      <PanelHead>
        <Eyebrow>Generated</Eyebrow>
        {has && <Chip>{testCases.length === 1 ? '1 case' : `${testCases.length} cases`}</Chip>}
        {edited && <Chip tone="warn">edited</Chip>}
        {edited && (
          <Button size="small" variant="text" onClick={onReset} disabled={disabled} sx={{ fontSize: 12.5 }}>
            Discard edits
          </Button>
        )}
        <Tabs label="View" value={view} options={VIEWS} onChange={setView} disabled={!has} sx={{ ml: 'auto' }} />
      </PanelHead>

      {has && testCases.length > 1 && (
        <Box role="group" aria-label="Generated cases" sx={{ display: 'flex', gap: '4px', px: 2, py: 1.25, borderBottom: '1px solid var(--rule)', overflowX: 'auto' }}>
          {testCases.map((tc, i) => {
            const pressed = i === index;
            return (
              <Box
                key={i}
                component="button"
                type="button"
                aria-pressed={pressed}
                title={tc.title}
                onClick={() => setActive(i)}
                sx={{
                  fontFamily: MONO,
                  fontSize: 11,
                  whiteSpace: 'nowrap',
                  px: '9px',
                  py: '4px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  border: '1px solid',
                  borderColor: pressed ? 'color-mix(in srgb, var(--accent) 30%, transparent)' : 'var(--rule-strong)',
                  bgcolor: pressed ? 'var(--accent-soft)' : 'transparent',
                  color: pressed ? 'var(--accent-ink)' : 'var(--muted)',
                  '&:focus-visible': { outline: '2px solid var(--accent)', outlineOffset: 2 },
                }}
              >
                {caseLabel(tc, i)}
              </Box>
            );
          })}
        </Box>
      )}

      {!has && (
        <Box sx={{ px: 2, py: 5, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
          <Box sx={{ fontFamily: MONO, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.09em', mb: 1 }}>
            Nothing generated yet
          </Box>
          Write a note or import requirements, then choose <b>Preview &amp; edit</b>.
          <br />
          The cases appear here, editable line by line, before anything is filed.
        </Box>
      )}

      {current && view === 'case' && <CaseView testCase={current} disabled={disabled} onChange={replace} />}
      {current && view === 'payload' && <PayloadView testCase={current} destination={destination} />}
    </Panel>
  );
}
