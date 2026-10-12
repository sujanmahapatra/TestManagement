import { useCallback, useEffect, useState } from 'react';
import { Box, Button, OutlinedInput } from '@mui/material';
import { api } from '../api/client';
import { CheckIcon } from './icons';
import { HERO_GRADIENT } from './theme';

/** The password page, shown when the server has APP_PASSWORD set. */
function SignInPage({ onSignedIn }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(password);
      onSignedIn();
    } catch (err) {
      setError(err.message);
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', background: HERO_GRADIENT, display: 'grid', placeItems: 'start center', px: 2, pt: { xs: 8, md: 14 } }}>
      <Box
        component="form"
        onSubmit={submit}
        sx={{
          width: '100%',
          maxWidth: 380,
          bgcolor: 'var(--tm-surface)',
          border: '1px solid var(--tm-rule)',
          borderRadius: '14px',
          boxShadow: 'var(--tm-shadow-lg)',
          p: 4,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <Box sx={{ width: 32, height: 32, borderRadius: '8px', bgcolor: '#2563eb', color: '#fff', display: 'grid', placeItems: 'center' }}>
            <CheckIcon size={20} sx={{ strokeWidth: 2.4 }} />
          </Box>
          <Box sx={{ fontSize: 18, fontWeight: 600, color: 'var(--tm-ink)' }}>Test Management</Box>
        </Box>
        <Box>
          <Box component="h1" sx={{ m: 0, fontSize: 20, fontWeight: 600, color: 'var(--tm-ink)' }}>Sign in</Box>
          <Box sx={{ fontSize: 14, color: 'var(--tm-muted)', mt: 0.5 }}>Enter the password you were given to continue.</Box>
        </Box>
        <OutlinedInput
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoFocus
          autoComplete="current-password"
          fullWidth
          error={Boolean(error)}
          inputProps={{ 'aria-label': 'Password', maxLength: 200 }}
        />
        {error && (
          <Box role="alert" sx={{ fontSize: 13.5, color: 'var(--tm-bad)', mt: -1 }}>
            {error}
          </Box>
        )}
        <Button type="submit" variant="contained" disabled={busy || !password} sx={{ py: 1 }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </Box>
    </Box>
  );
}

/**
 * Shows the app once signed in, or the sign-in page when the server asks for
 * a password. Any request refused for a missing login brings the page back.
 */
export default function SignInGate({ children }) {
  const [state, setState] = useState('checking'); // checking | open | signed-in | signed-out
  const [required, setRequired] = useState(false);

  const check = useCallback(async () => {
    try {
      const s = await api.session();
      setRequired(s.required);
      setState(!s.required ? 'open' : s.loggedIn ? 'signed-in' : 'signed-out');
    } catch (err) {
      // Only a server that asks for a password gets the sign-in page. One
      // that cannot be asked (an older server, or one that is down) opens the
      // app, whose own requests then say what is wrong.
      setState(err?.code === 'login_required' ? 'signed-out' : 'open');
    }
  }, []);

  useEffect(() => {
    check();
    const onRequired = () => setState('signed-out');
    window.addEventListener('tm:login-required', onRequired);
    return () => window.removeEventListener('tm:login-required', onRequired);
  }, [check]);

  const signOut = useCallback(async () => {
    await api.signOut().catch(() => {});
    setState('signed-out');
  }, []);

  if (state === 'checking') return null;
  if (state === 'signed-out') return <SignInPage onSignedIn={() => setState('signed-in')} />;
  return children({ signOut: required ? signOut : null });
}
