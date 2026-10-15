import { useRef, useState } from 'react';
import { Box, Button, Dialog, Menu, MenuItem, OutlinedInput } from '@mui/material';
import FigmaPicker from './FigmaPicker';
import { AGENT_ACCEPT, AGENT_MAX_FILES, LINK_SOURCES } from '../domain/agent';

/**
 * "Add Requirements": upload files, or pull a Jira issue, Confluence page,
 * Azure DevOps work item or Figma design in as context. `children` renders the trigger, given an
 * `open(event)` callback, so the same menu serves the start screen and the
 * refine box.
 */
export default function AddRequirements({ agent, options, children, anchorOrigin, transformOrigin }) {
  const fileInput = useRef(null);
  const [anchor, setAnchor] = useState(null);
  const [linking, setLinking] = useState(null); // 'jira' | 'confluence' | 'ado'
  const [ref, setRef] = useState('');
  const [figmaOpen, setFigmaOpen] = useState(false);
  const sources = options.agent.sources ?? {};
  const uploads = agent.input.files.filter((f) => f.origin === 'upload').length;
  const link = LINK_SOURCES.find((s) => s.key === linking);

  const pick = (key) => {
    setAnchor(null);
    if (key === 'upload') fileInput.current?.click();
    else if (key === 'figma') setFigmaOpen(true);
    else {
      setLinking(key);
      setRef('');
    }
  };

  return (
    <>
      {children((e) => setAnchor(e.currentTarget))}
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
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        disableScrollLock
        anchorOrigin={anchorOrigin}
        transformOrigin={transformOrigin}
        sx={{ zIndex: 1450 }}
      >
        <MenuItem disabled={uploads >= AGENT_MAX_FILES} onClick={() => pick('upload')}>
          Upload files
          <Box component="span" sx={{ ml: 2, fontSize: 12, color: 'var(--tm-faint)' }}>PDF, DOCX, PPTX, XLSX, images</Box>
        </MenuItem>
        {LINK_SOURCES.map((s) => (
          <MenuItem key={s.key} disabled={!sources[s.key]} onClick={() => pick(s.key)}>
            {s.label}
            {!sources[s.key] && (
              <Box component="span" sx={{ ml: 2, fontSize: 12, color: 'var(--tm-faint)' }}>
                {s.key === 'figma' ? 'needs FIGMA_TOKEN' : s.key === 'ado' ? 'needs ADO_ORG_URL and ADO_PAT' : `enable ${s.key} on the server`}
              </Box>
            )}
          </MenuItem>
        ))}
      </Menu>

      <Dialog open={Boolean(link)} onClose={() => setLinking(null)} maxWidth="xs" fullWidth sx={{ zIndex: 1450 }} PaperProps={{ sx: { borderRadius: '12px' } }}>
        {link && (
          <Box
            component="form"
            onSubmit={async (e) => {
              e.preventDefault();
              if ((await agent.addSource(link.key, ref)).length) setLinking(null);
            }}
            sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 1.25 }}
          >
            <Box sx={{ fontSize: 15, fontWeight: 600 }}>{link.label}</Box>
            <OutlinedInput value={ref} onChange={(e) => setRef(e.target.value)} placeholder={link.placeholder} autoFocus fullWidth size="small" disabled={Boolean(agent.fetching)} />
            <Box sx={{ fontSize: 13, color: 'var(--tm-muted)' }}>{link.hint}</Box>
            {agent.error && <Box role="alert" sx={{ fontSize: 13, color: 'var(--tm-bad)' }}>{agent.error.message}</Box>}
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
              <Button variant="outlined" onClick={() => setLinking(null)} disabled={Boolean(agent.fetching)}>Cancel</Button>
              <Button type="submit" variant="contained" disabled={!ref.trim() || Boolean(agent.fetching)}>
                {agent.fetching ? 'Fetching…' : 'Add'}
              </Button>
            </Box>
          </Box>
        )}
      </Dialog>

      <FigmaPicker
        open={figmaOpen}
        onClose={() => setFigmaOpen(false)}
        onImport={async (figmaRef, frameIds) => (await agent.addSource('figma', figmaRef, { frameIds })).length > 0}
      />
    </>
  );
}
