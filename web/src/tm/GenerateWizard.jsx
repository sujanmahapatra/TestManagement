import { Box, Dialog, IconButton } from '@mui/material';
import { AiBadge, CloseIcon } from './icons';
import GenerateInput from './GenerateInput';
import GenerateProgress from './GenerateProgress';
import GenerateReview from './GenerateReview';
import { TEMPLATE_LABELS } from './SettingsPopover';

/**
 * The full-screen generator over the test case list: share requirements,
 * watch it work, then review, refine and add. Closing keeps the agent's
 * state -- a run carries on and its results wait -- so reopening returns
 * to where the reviewer left off.
 */
export default function GenerateWizard({ open, onClose, agent, options, repo, folderId, onAdd, onConnect }) {
  const step = agent.cases.length ? 'review' : agent.running ? 'progress' : 'input';

  return (
    <Dialog
      fullScreen
      open={open}
      onClose={onClose}
      aria-labelledby="tm-wizard-title"
      PaperProps={{ sx: { bgcolor: 'var(--tm-surface)', display: 'flex', flexDirection: 'column' } }}
    >
      <Box
        component="header"
        sx={{ height: 56, flex: 'none', display: 'flex', alignItems: 'center', gap: 1.25, px: { xs: 2, md: 3 }, borderBottom: '1px solid var(--tm-rule)', bgcolor: 'var(--tm-surface)' }}
      >
        <AiBadge size={26} />
        <Box id="tm-wizard-title" component="h1" sx={{ m: 0, fontSize: 16, fontWeight: 600, color: 'var(--tm-ink)' }}>
          {step === 'review' ? 'Review generated test cases' : 'Generate test cases with AI'}
        </Box>
        {step === 'review' && (
          <Box sx={{ fontSize: 13, color: 'var(--tm-muted)', display: { xs: 'none', sm: 'block' } }}>
            · {TEMPLATE_LABELS[agent.input.template].label} · {agent.input.language}
          </Box>
        )}
        <IconButton onClick={onClose} aria-label="Close" sx={{ ml: 'auto', color: 'var(--tm-muted)' }}>
          <CloseIcon size={20} />
        </IconButton>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, overflowY: step === 'review' ? 'hidden' : 'auto' }}>
        {step === 'input' && <GenerateInput agent={agent} options={options} repo={repo} onConnect={onConnect} />}
        {step === 'progress' && <GenerateProgress running={agent.running} onStop={agent.cancel} fileCount={agent.input.files.length} />}
        {step === 'review' && (
          <GenerateReview
            agent={agent}
            options={options}
            repo={repo}
            initialFolderId={folderId}
            onAdd={onAdd}
            onStartOver={() => agent.reset({ keepInput: true })}
          />
        )}
      </Box>
    </Dialog>
  );
}
