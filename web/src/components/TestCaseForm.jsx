import { useState } from 'react';
import { Box, Button, Checkbox, MenuItem, OutlinedInput, Select } from '@mui/material';
import ParametersEditor from './ParametersEditor';
import RequirementsImport from './RequirementsImport';
import { Chip, Eyebrow, Field, Panel, PanelHead, Tabs } from './ui';
import { LIMITS, counter } from '../domain/testCase';

const MODES = [
  { value: 'note', label: 'write a note' },
  { value: 'import', label: 'import requirements' },
];

/**
 * The input panel. Presentation only: it renders the controls, reports
 * changes upward, and shows whatever errors it is handed -- it does no
 * validation and knows nothing about which trackers, platforms or test types
 * exist. Those arrive as data from /api/options, so adding any of them needs
 * no change here.
 */
export default function TestCaseForm({
  form,
  errors,
  busy,
  options,
  caseCount,
  blockedReason,
  onChange,
  onSubmit,
  onPreview,
  onExtract,
}) {
  const [showParams, setShowParams] = useState(false);

  const destination = options.destinations.find((d) => d.key === form.destination);
  const testType = options.testTypes.find((t) => t.key === form.testType);
  const variantsForced = Boolean(testType?.impliesNegativeVariants);
  const paramRows = form.parameters?.rows?.length ?? 0;

  const select = (key, items, hint) => (
    <Field label={labelFor[key]} htmlFor={key} hint={hint} error={errors[key]}>
      <Select
        id={key}
        value={items.some((i) => i.key === form[key]) ? form[key] : ''}
        onChange={(e) => onChange(key, e.target.value)}
        input={<OutlinedInput size="small" />}
        disabled={busy}
        fullWidth
        MenuProps={{ disableScrollLock: true }}
      >
        {items.map((i) => (
          <MenuItem key={i.key} value={i.key}>
            {i.label}
          </MenuItem>
        ))}
      </Select>
    </Field>
  );

  const text = (key, { hint, rows } = {}) => (
    <Field
      label={labelFor[key]}
      htmlFor={key}
      required
      hint={hint}
      error={errors[key]}
      count={counter(key, form[key])}
    >
      <OutlinedInput
        id={key}
        value={form[key]}
        onChange={(e) => onChange(key, e.target.value)}
        error={Boolean(errors[key])}
        disabled={busy}
        fullWidth
        multiline={Boolean(rows)}
        minRows={rows}
        inputProps={{ maxLength: LIMITS[key].max + 200 }}
      />
    </Field>
  );

  return (
    <Panel aria-label="Test case input">
      <PanelHead>
        <Eyebrow>Input</Eyebrow>
        <Tabs
          label="Input mode"
          value={form.mode}
          options={MODES}
          disabled={busy}
          onChange={(mode) => onChange('mode', mode)}
          sx={{ ml: 'auto' }}
        />
      </PanelHead>

      <Box component="form" onSubmit={onSubmit} noValidate sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: '15px' }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
          {select('destination', options.destinations, destination?.target)}
          {select('platform', options.platforms, 'Sets the preconditions and environment checks.')}
        </Box>

        {select('testType', options.testTypes, testType?.description)}

        <Box
          component="label"
          sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, fontSize: 13, color: 'var(--ink-soft)', cursor: 'pointer' }}
        >
          <Checkbox
            checked={form.negativeVariants || variantsForced}
            disabled={busy || variantsForced}
            onChange={(e) => onChange('negativeVariants', e.target.checked)}
            sx={{ p: 0, mt: '1px' }}
          />
          <span>
            Also derive failure cases
            {options.negativeVariants.length > 0 && (
              <Box component="span" sx={{ color: 'var(--muted)' }}>
                {' '}— {options.negativeVariants.map((v) => v.label).join(', ')}
              </Box>
            )}
            {variantsForced && (
              <Box component="span" sx={{ color: 'var(--muted)' }}> (always on for this test type)</Box>
            )}
          </span>
        </Box>

        {form.mode === 'import' ? (
          <RequirementsImport
            form={form}
            errors={errors}
            busy={busy}
            sources={options.requirementSources ?? []}
            onChange={onChange}
            onExtract={onExtract}
          />
        ) : (
          <>
            {text('name')}
            {text('description', {
              rows: 5,
              hint: 'One action per line or sentence — each becomes a numbered step.',
            })}
            {text('expectedResult', { rows: 3 })}
          </>
        )}

        <Box sx={{ border: '1px solid var(--rule)', borderRadius: '4px' }}>
          <Box
            component="button"
            type="button"
            onClick={() => setShowParams((v) => !v)}
            aria-expanded={showParams}
            sx={{
              all: 'unset',
              boxSizing: 'border-box',
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 1.5,
              py: 1,
              cursor: 'pointer',
              fontSize: 13,
              color: 'var(--ink-soft)',
              '&:focus-visible': { outline: '2px solid var(--accent)', outlineOffset: 2 },
            }}
          >
            <Box component="span" sx={{ color: 'var(--muted)', width: 10 }}>{showParams ? '▾' : '▸'}</Box>
            Parameters
            {paramRows > 0 && <Chip tone="accent">{paramRows} rows</Chip>}
          </Box>
          {showParams && (
            <Box sx={{ px: 1.5, pb: 1.5 }}>
              <ParametersEditor
                parameters={form.parameters}
                error={errors.parameters}
                disabled={busy}
                onChange={(parameters) => onChange('parameters', parameters)}
              />
            </Box>
          )}
        </Box>

        <Box sx={{ display: 'flex', gap: '9px', flexWrap: 'wrap' }}>
          <Button
            type="submit"
            variant="contained"
            disabled={busy || Boolean(blockedReason)}
            sx={{ flex: 1, minWidth: 160 }}
          >
            {busy
              ? 'Working…'
              : `Create ${caseCount > 1 ? `${caseCount} cases` : 'test case'} in ${destination?.label ?? 'destination'}`}
          </Button>
          <Button type="button" variant="outlined" onClick={onPreview} disabled={busy}>
            Preview &amp; edit
          </Button>
        </Box>

        {blockedReason && <Box sx={{ fontSize: 12.5, color: 'var(--muted)', mt: '-6px' }}>{blockedReason}</Box>}
      </Box>

      <Box
        component="p"
        sx={{ m: 0, px: 2, pt: 1.25, pb: 1.75, fontSize: 12.5, color: 'var(--muted)', borderTop: '1px solid var(--rule)' }}
      >
        Previewing never needs credentials. Creating needs OAuth consent for Jira and Confluence, a personal
        access token for Azure DevOps and TFS, and nothing at all for Excel.
      </Box>
    </Panel>
  );
}

const labelFor = {
  destination: 'Destination',
  platform: 'Platform',
  testType: 'Test type',
  name: 'Test case name',
  description: 'Description',
  expectedResult: 'Expected result',
};
