import { useRef, useState } from 'react';
import { Box, Button, IconButton, OutlinedInput } from '@mui/material';
import { AiBadge, CheckIcon, CloseIcon, PaperclipIcon, PlusIcon, SettingsIcon, SparkleIcon } from './icons';
import SettingsPopover, { TEMPLATE_LABELS } from './SettingsPopover';
import AddRequirements from './AddRequirements';
import { AGENT_PROMPT_MAX, LINK_SOURCES, formatBytes } from '../domain/agent';

/** A small coloured mark per source, shown on each attachment chip. */
export function SourceMark({ file }) {
  const origin = file.origin ?? 'upload';
  const style = {
    jira: { bg: '#2684ff', mark: 'J' },
    confluence: { bg: '#1868db', mark: 'C' },
    ado: { bg: '#0078d4', mark: 'A' },
    figma: { bg: '#a259ff', mark: 'F' },
  }[origin];
  if (!style) return <PaperclipIcon size={14} sx={{ color: 'var(--tm-muted)' }} />;
  return (
    <Box sx={{ width: 15, height: 15, borderRadius: '4px', bgcolor: style.bg, color: '#fff', fontSize: 9.5, fontWeight: 700, display: 'grid', placeItems: 'center', flex: 'none' }}>
      {style.mark}
    </Box>
  );
}

/** The preview card at the top: a miniature of the generator, as an illustration. */
function Illustration() {
  return (
    <Box sx={{ position: 'relative', display: 'flex', justifyContent: 'center', mb: 2 }}>
      <Box
        aria-hidden
        sx={{
          width: 230,
          height: 150,
          borderRadius: '12px',
          background: 'linear-gradient(180deg, #ede9fe 0%, #e0e7ff 55%, #fbcfe8 100%)',
          border: '1px solid #e9e5ff',
          boxShadow: 'var(--tm-shadow)',
          p: 1.5,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
        }}
      >
        <Box sx={{ bgcolor: '#fff', borderRadius: '8px', p: 1, boxShadow: 'var(--tm-shadow)' }}>
          <Box sx={{ height: 6, width: '62%', bgcolor: 'var(--tm-rule)', borderRadius: 3, mb: 1 }} />
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.75 }}>
            <Box sx={{ height: 12, width: 38, border: '1px solid var(--tm-rule)', borderRadius: '3px' }} />
            <Box sx={{ height: 12, width: 64, bgcolor: 'var(--tm-primary)', borderRadius: '3px' }} />
          </Box>
        </Box>
      </Box>
      <Box sx={{ position: 'absolute', left: 'calc(50% + 130px)', top: 4, display: { xs: 'none', sm: 'flex' }, flexDirection: 'column', alignItems: 'flex-start', gap: 0.5 }}>
        <SparkleIcon size={16} sx={{ color: 'var(--tm-ai)' }} />
        <Box sx={{ fontFamily: '"Segoe Print", "Comic Sans MS", cursive', fontSize: 13.5, lineHeight: 1.25, color: 'var(--tm-ai)', transform: 'rotate(-4deg)', width: 120 }}>
          Now generate datasets with AI
        </Box>
      </Box>
    </Box>
  );
}

/**
 * Step one of the generator: share the requirement -- attachments, Jira,
 * Confluence or Figma, and an optional prompt -- set the output, generate.
 */
export default function GenerateInput({ agent, options, repo, onConnect }) {
  const settingsButton = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { input, change } = agent;
  const platform = options.platforms.find((p) => p.key === input.platform);

  const onDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files?.length) agent.addFiles(event.dataTransfer.files);
  };

  return (
    <Box sx={{ minHeight: '100%', display: 'flex', flexDirection: 'column', px: { xs: 2, md: 3 }, pt: { xs: 3, md: 6 }, pb: 2.5, gap: 2 }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <Illustration />
        <Box component="h2" sx={{ m: 0, fontSize: 17, fontWeight: 600, color: 'var(--tm-ink)' }}>
          Generate test cases with AI
        </Box>
        <Box component="p" sx={{ m: '4px 0 0', fontSize: 14, color: 'var(--tm-muted)' }}>
          Share your testing requirements to generate comprehensive test cases.
        </Box>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '4px 16px', mt: 0.75, fontSize: 13.5, color: 'var(--tm-ink-soft)' }}>
          {['Generate, review & add', 'Refine until it works'].map((t) => (
            <Box key={t} component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
              <CheckIcon size={15} sx={{ color: 'var(--tm-ink-soft)' }} />
              {t}
            </Box>
          ))}
        </Box>
      </Box>

      <Box sx={{ mt: 'auto', display: 'flex', flexDirection: 'column', gap: 1.25 }}>
        {!options.agent.enabled && (
          <Box sx={{ p: 1.25, borderRadius: '8px', bgcolor: 'var(--tm-warn-soft)', color: 'var(--tm-warn)', fontSize: 13.5 }}>
            AI generation is off on this server. Add a Groq or Anthropic API key to the server settings and restart it.
          </Box>
        )}

        <Box component="h3" sx={{ m: 0, fontSize: 15, fontWeight: 500, color: 'var(--tm-ink)' }}>
          Share your testing requirements
        </Box>

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
            minHeight: 140,
            p: 2,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1.25,
          }}
        >
          {input.files.length > 0 && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 1, maxWidth: '100%' }}>
              {input.files.map((file, index) => (
                <Box
                  key={`${file.name}-${index}`}
                  title={`${file.name} · ${formatBytes(file.size)}`}
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.75,
                    maxWidth: 260,
                    pl: 1.25,
                    pr: 0.5,
                    py: '4px',
                    borderRadius: '6px',
                    bgcolor: 'var(--tm-sunken)',
                    fontSize: 13.5,
                    color: 'var(--tm-ink-soft)',
                  }}
                >
                  <SourceMark file={file} />
                  <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{file.name}</Box>
                  <IconButton size="small" onClick={() => agent.removeFile(index)} aria-label={`Remove ${file.name}`} sx={{ p: '3px', color: 'var(--tm-muted)' }}>
                    <CloseIcon size={13} />
                  </IconButton>
                </Box>
              ))}
            </Box>
          )}
          <AddRequirements agent={agent} options={options}>
            {(open) => (
              <Button variant="outlined" size="small" startIcon={<PlusIcon size={14} />} onClick={open} disabled={Boolean(agent.fetching)}>
                Add Requirements
              </Button>
            )}
          </AddRequirements>
          {agent.fetching ? (
            <Box sx={{ fontSize: 13, color: 'var(--tm-muted)' }}>Fetching from {LINK_SOURCES.find((s) => s.key === agent.fetching)?.label}…</Box>
          ) : (
            input.files.length === 0 && <Box sx={{ fontSize: 12.5, color: 'var(--tm-faint)' }}>or drop PRDs, stories, designs and spreadsheets here</Box>
          )}
        </Box>

        {agent.fileErrors.map((message) => (
          <Box key={message} sx={{ fontSize: 13, color: 'var(--tm-bad)' }}>{message}</Box>
        ))}

        <OutlinedInput
          value={input.prompt}
          onChange={(e) => change('prompt', e.target.value)}
          placeholder="Paste requirements, issue links or prompt your usecase (optional)"
          multiline
          minRows={2}
          maxRows={10}
          fullWidth
          inputProps={{ maxLength: AGENT_PROMPT_MAX, 'aria-label': 'Requirements or prompt' }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) agent.generate();
          }}
        />

        {agent.error && (
          <Box role="alert" sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, p: 1.25, borderRadius: '8px', bgcolor: 'var(--tm-bad-soft)', color: 'var(--tm-bad)', fontSize: 13.5 }}>
            <Box sx={{ flex: 1 }}>
              <Box sx={{ fontWeight: 600 }}>{agent.error.title}</Box>
              {agent.error.message}
            </Box>
            {agent.error.needsAuth && <Button size="small" variant="contained" onClick={onConnect}>Connect Atlassian</Button>}
            <IconButton size="small" onClick={agent.clearError} aria-label="Dismiss" sx={{ color: 'inherit' }}>
              <CloseIcon size={14} />
            </IconButton>
          </Box>
        )}

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Box sx={{ fontSize: 12.5, color: 'var(--tm-muted)', mr: 'auto' }}>
            {TEMPLATE_LABELS[input.template].label} · {platform?.label ?? input.platform} · {input.language}
            {input.datasets ? ' · datasets' : ''}
          </Box>
          <Button ref={settingsButton} variant="outlined" startIcon={<SettingsIcon size={16} />} onClick={() => setSettingsOpen(true)} aria-haspopup="dialog">
            Settings
          </Button>
          <Button variant="contained" onClick={() => agent.generate()} disabled={Boolean(agent.fetching)}>
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
