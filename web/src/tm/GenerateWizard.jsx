import { useEffect, useState } from 'react';
import { Box, Button, Drawer, IconButton } from '@mui/material';
import { CloseIcon } from './icons';
import GenerateInput from './GenerateInput';
import GenerateConversation from './GenerateConversation';
import CaseDetailsPane from './CaseDetailsPane';

/**
 * "Generate Test Cases with AI": a panel over the right of the test case
 * list. It starts with the requirement form; after Generate it becomes one
 * conversation of rounds, with the chosen case's details opening beside it.
 * Closing keeps everything -- a run carries on and its results wait.
 */
export default function GenerateWizard({ open, onClose, agent, options, repo, folderId: initialFolder, onAdd, onConnect }) {
  const started = agent.cases.length > 0 || Boolean(agent.running) || agent.conversation.length > 0;
  const [viewingId, setViewingId] = useState(null);
  const [folderId, setFolderId] = useState(initialFolder);
  const [subfolders, setSubfolders] = useState(false);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!folderId && initialFolder) setFolderId(initialFolder);
  }, [initialFolder, folderId]);

  const viewing = agent.cases.find((tc) => tc.id === viewingId) ?? null;
  useEffect(() => {
    if (viewingId && !viewing) setViewingId(null);
  }, [viewingId, viewing]);

  const add = async (cases) => {
    if (!cases.length || !folderId) return;
    setAdding(true);
    const result = await onAdd({ folderId, subfolders, testCases: cases });
    setAdding(false);
    if (result) agent.markAdded(cases.map((tc) => tc.id), Object.fromEntries(cases.map((tc, i) => [tc.id, result.added[i]?.key])));
  };

  const startOver = () => {
    if (agent.running) agent.cancel();
    setViewingId(null);
    agent.reset({ keepInput: false });
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: { xs: '100%', md: viewing ? 'min(1180px, 96vw)' : 'min(720px, 96vw)' },
          transition: 'width .2s ease',
          bgcolor: 'var(--tm-surface)',
          display: 'flex',
          flexDirection: 'column',
        },
      }}
      ModalProps={{ keepMounted: true }}
    >
      <Box component="header" sx={{ height: 54, flex: 'none', display: 'flex', alignItems: 'center', gap: 1, px: 2.5, borderBottom: '1px solid var(--tm-rule)' }}>
        <Box component="h1" sx={{ m: 0, fontSize: 15.5, fontWeight: 600, color: 'var(--tm-ink)' }}>Generate Test Cases with AI</Box>
        {started && (
          <Button variant="outlined" size="small" onClick={startOver} sx={{ ml: 'auto' }}>
            ↻ Start Over
          </Button>
        )}
        <IconButton onClick={onClose} aria-label="Close" sx={{ ml: started ? 0.5 : 'auto', color: 'var(--tm-muted)' }}>
          <CloseIcon size={19} />
        </IconButton>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', md: viewing ? 'minmax(0, 1fr) 500px' : '1fr' } }}>
        <Box sx={{ minHeight: 0, minWidth: 0, display: { xs: viewing ? 'none' : 'block', md: 'block' }, overflowY: started ? 'hidden' : 'auto', bgcolor: started ? 'var(--tm-ground)' : 'var(--tm-surface)' }}>
          {started ? (
            <GenerateConversation
              agent={agent}
              options={options}
              repo={repo}
              folderId={folderId}
              onFolder={setFolderId}
              subfolders={subfolders}
              onSubfolders={setSubfolders}
              adding={adding}
              onAdd={add}
              viewingId={viewingId}
              onView={setViewingId}
            />
          ) : (
            <GenerateInput agent={agent} options={options} repo={repo} onConnect={onConnect} />
          )}
        </Box>
        {viewing && (
          <CaseDetailsPane
            testCase={viewing}
            options={options}
            files={agent.input.files}
            addedKey={agent.addedKeys[viewing.id]}
            adding={adding}
            onChange={agent.updateCase}
            onAdd={() => add([viewing])}
            onClose={() => setViewingId(null)}
          />
        )}
      </Box>
    </Drawer>
  );
}
