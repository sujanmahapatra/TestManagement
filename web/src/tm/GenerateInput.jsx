import { useRef, useState } from 'react';
import { Box, Button, IconButton, Menu, MenuItem, OutlinedInput } from '@mui/material';
import { AiBadge, CheckIcon, CloseIcon, PaperclipIcon, PlusIcon, SettingsIcon, SourceTile, SOURCE_TILES } from './icons';
import { HERO_GRADIENT } from './theme';
import SettingsPopover, { TEMPLATE_LABELS } from './SettingsPopover';
import { AGENT_ACCEPT, AGENT_MAX_FILES, AGENT_PROMPT_MAX, LINK_SOURCES, fileBadge, formatBytes } from '../domain/agent';

/**
 * Step one of the generator: share the requirement -- attachments, links
 * from Jira, Confluence or Figma, and a prompt -- set the output, generate.
 */
export default function GenerateInput({ agent, options, repo, onConnect }) {
  const fileInput = useRef(null);
  const settingsButton = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [linking, setLinking] = useState(null);
  const [ref, setRef] = useState('');

  const { input, change } = agent;
  const sources = options.agent.sources ?? {};
  const link = LINK_SOURCES.find((s) => s.key === linking);
  const uploads = input.files.filter((f) => f.origin === 'upload').length;
  const platform = options.platforms.find((p) => p.key === input.platform);

  const onDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files?.length) agent.addFiles(event.dataTransfer.files);
  };

  const openAdd = (event) => setMenuAnchor(event.currentTarget);

  return (
    <Box sx={{ minHeight: '100%', background: HERO_GRADIENT, px: 2, pt: { xs: 4, md: 7 }, pb: 6 }}>
      <Box sx={{ maxWidth: 880, mx: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <AiBadge size={44} />
        <Box component="h1" sx={{ m: '16px 0 6px', fontSize: { xs: 22, md: 26 }, fontWeight: 600, letterSpacing: '-.015em', color: 'var(--tm-ink)' }}>
          Generate test cases with AI
        </Box>
        <Box component="p" sx={{ m: 0, fontSize: 15, color: 'var(--tm-muted)' }}>
          Share your testing requirements to generate comprehensive test cases.
        </Box>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '6px 18px', mt: 1.25, fontSize: 14, color: 'var(--tm-ink-soft)' }}>
          {['Generate, review & add', 'Refine until it works'].map((t) => (
            <Box key={t} component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
              <CheckIcon size={16} sx={{ color: 'var(--tm-ok)' }} />
              {t}
            </Box>
          ))}
        </Box>
      </Box>

      <Box
        sx={{
          maxWidth: 880,
          mx: 'auto',
          mt: 4,
          bgcolor: 'var(--tm-surface)',
          border: '1px solid var(--tm-rule)',
          borderRadius: '12px',
          boxShadow: 'var(--tm-shadow-lg)',
          p: { xs: 2, md: 3 },
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        {!options.agent.enabled && (
          <Box sx={{ p: 1.5, borderRadius: '8px', bgcolor: 'var(--tm-warn-soft)', color: 'var(--tm-warn)', fontSize: 14 }}>
            AI generation is off on this server. Add <b>ANTHROPIC_API_KEY</b> to <code>server/.env</code> and restart the API.
          </Box>
        )}
        <Box component="h2" sx={{ m: 0, fontSize: 16, fontWeight: 500, color: 'var(--tm-ink)' }}>
          Share your testing requirements
        </Box>

        <input
          ref={fileInput}
          type="file"
          accept={AGENT_ACCEPT}
          multiple
          hidden
          onChange={(e) => {
            agent.addFiles(e.target.files);
            e.target.value = '';
          }}
        />

        <Box
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          sx={{
            border: '1.5px dashed',
            borderColor: dragging ? 'var(--tm-primary)' : 'var(--tm-rule-strong)',
            bgcolor: dragging ? 'var(--tm-primary-soft)' : 'var(--tm-surface)',
            borderRadius: '10px',
            minHeight: 148,
            p: 2,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1.5,
            transition: 'background-color .12s, border-color .12s',
          }}
        >
          {input.files.length === 0 ? (
            <>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 1 }}>
                {SOURCE_TILES.map((t) => (
                  <SourceTile key={t.key} {...t} size={36} />
                ))}
              </Box>
              <Box sx={{ fontSize: 14, color: 'var(--tm-muted)' }}>
                Drop PRDs, stories, mockups or spreadsheets here, or{' '}
                <Box
                  component="button"
                  type="button"
                  onClick={openAdd}
                  sx={{ all: 'unset', color: 'var(--tm-primary)', fontWeight: 500, cursor: 'pointer', '&:focus-visible': { outline: '2px solid var(--tm-primary)' } }}
                >
                  add requirements
                </Box>
              </Box>
            </>
          ) : (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 1, maxWidth: '100%' }}>
              {input.files.map((file, index) => (
                <Box
                  key={`${file.name}-${index}`}
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.75,
                    maxWidth: 280,
                    pl: 1.25,
                    pr: 0.5,
                    py: '5px',
                    borderRadius: '8px',
                    bgcolor: 'var(--tm-sunken)',
                    border: '1px solid var(--tm-rule)',
                    fontSize: 13.5,
                    color: 'var(--tm-ink-soft)',
                  }}
                  title={`${file.name} · ${formatBytes(file.size)}`}
                >
                  <PaperclipIcon size={15} sx={{ color: 'var(--tm-muted)' }} />
                  <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                    {file.name}
                  </Box>
                  <Box component="span" sx={{ fontSize: 11, fontWeight: 600, color: 'var(--tm-muted)', flex: 'none' }}>{fileBadge(file)}</Box>
                  <IconButton size="small" onClick={() => agent.removeFile(index)} aria-label={`Remove ${file.name}`} sx={{ p: '3px', color: 'var(--tm-muted)' }}>
                    <CloseIcon size={14} />
                  </IconButton>
                </Box>
              ))}
              <IconButton
                onClick={openAdd}
                aria-label="Add requirements"
                disabled={Boolean(agent.fetching)}
                sx={{ width: 34, height: 34, border: '1px solid var(--tm-rule-strong)', borderRadius: '8px', color: 'var(--tm-ink-soft)', bgcolor: 'var(--tm-surface)' }}
              >
                <PlusIcon size={16} />
              </IconButton>
            </Box>
          )}
          {agent.fetching && <Box sx={{ fontSize: 13, color: 'var(--tm-muted)' }}>Fetching from {LINK_SOURCES.find((s) => s.key === agent.fetching)?.label}…</Box>}
        </Box>

        <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)} disableScrollLock>
          <MenuItem
            disabled={uploads >= AGENT_MAX_FILES}
            onClick={() => {
              setMenuAnchor(null);
              fileInput.current?.click();
            }}
          >
            Upload files
            <Box component="span" sx={{ ml: 2, fontSize: 12, color: 'var(--tm-faint)' }}>PDF, DOCX, PPTX, XLSX, images</Box>
          </MenuItem>
          {LINK_SOURCES.map((s) => (
            <MenuItem
              key={s.key}
              disabled={!sources[s.key]}
              onClick={() => {
                setMenuAnchor(null);
                setLinking(s.key);
                setRef('');
              }}
            >
              {s.label}
              {!sources[s.key] && (
                <Box component="span" sx={{ ml: 2, fontSize: 12, color: 'var(--tm-faint)' }}>
                  {s.key === 'figma' ? 'needs FIGMA_TOKEN' : `enable ${s.key} on the server`}
                </Box>
              )}
            </MenuItem>
          ))}
        </Menu>

        {link && (
          <Box
            component="form"
            onSubmit={async (e) => {
              e.preventDefault();
              if ((await agent.addSource(link.key, ref)).length) setLinking(null);
            }}
            sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, p: 1.5, borderRadius: '8px', bgcolor: 'var(--tm-sunken)' }}
          >
            <Box component="label" htmlFor="tmSourceRef" sx={{ fontSize: 13.5, fontWeight: 500, color: 'var(--tm-ink-soft)' }}>
              Add from {link.label}
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <OutlinedInput id="tmSourceRef" size="small" value={ref} onChange={(e) => setRef(e.target.value)} placeholder={link.placeholder} autoFocus fullWidth disabled={Boolean(agent.fetching)} />
              <Button type="submit" variant="contained" disabled={!ref.trim() || Boolean(agent.fetching)} sx={{ flex: 'none' }}>
                {agent.fetching ? 'Fetching…' : 'Add'}
              </Button>
              <Button type="button" variant="outlined" onClick={() => setLinking(null)} sx={{ flex: 'none' }}>
                Cancel
              </Button>
            </Box>
            <Box sx={{ fontSize: 12.5, color: 'var(--tm-muted)' }}>{link.hint}</Box>
          </Box>
        )}

        {agent.fileErrors.map((message) => (
          <Box key={message} sx={{ fontSize: 13, color: 'var(--tm-bad)' }}>{message}</Box>
        ))}

        <OutlinedInput
          value={input.prompt}
          onChange={(e) => change('prompt', e.target.value)}
          placeholder="Paste requirements, issue links or prompt your use case"
          multiline
          minRows={3}
          maxRows={12}
          fullWidth
          inputProps={{ maxLength: AGENT_PROMPT_MAX, 'aria-label': 'Requirements or prompt' }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) agent.generate();
          }}
        />

        {agent.error && (
          <Box role="alert" sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, p: 1.5, borderRadius: '8px', bgcolor: 'var(--tm-bad-soft)', color: 'var(--tm-bad)', fontSize: 14 }}>
            <Box sx={{ flex: 1 }}>
              <Box sx={{ fontWeight: 600 }}>{agent.error.title}</Box>
              {agent.error.message}
            </Box>
            {agent.error.needsAuth && (
              <Button size="small" variant="contained" onClick={onConnect}>Connect Atlassian</Button>
            )}
            <IconButton size="small" onClick={agent.clearError} aria-label="Dismiss" sx={{ color: 'inherit' }}>
              <CloseIcon size={15} />
            </IconButton>
          </Box>
        )}

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Box sx={{ fontSize: 13, color: 'var(--tm-muted)', mr: 'auto' }}>
            {TEMPLATE_LABELS[input.template].label} · {platform?.label ?? input.platform} · {input.language}
            {input.datasets ? ' · with datasets' : ''}
          </Box>
          <Button
            ref={settingsButton}
            variant="outlined"
            startIcon={<SettingsIcon size={17} />}
            onClick={() => setSettingsOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={settingsOpen}
          >
            Settings
          </Button>
          <Button variant="contained" onClick={() => agent.generate()} disabled={Boolean(agent.fetching)} sx={{ px: 2.5 }}>
            Generate Test Cases
          </Button>
        </Box>
      </Box>

      <SettingsPopover
        anchorEl={settingsButton.current}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        input={input}
        change={change}
        options={options}
        folders={repo.folders}
        counts={repo.counts}
        templateLocked={false}
      />
    </Box>
  );
}
