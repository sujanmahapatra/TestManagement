import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CssBaseline, GlobalStyles, ThemeProvider } from '@mui/material';
import TestManagement from './tm/TestManagement';
import { cssVariables } from './theme';
import { tmTheme, tmVariables, TM } from './tm/theme';

/**
 * Light only, like the test management tools this follows. The classic
 * generator's tokens stay defined because its screens and shared editors
 * still read them.
 */
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider theme={tmTheme}>
      <CssBaseline />
      <GlobalStyles
        styles={{
          ':root': { ...cssVariables('light'), ...tmVariables, colorScheme: 'light' },
          body: { backgroundColor: TM.ground, WebkitFontSmoothing: 'antialiased' },
        }}
      />
      <TestManagement />
    </ThemeProvider>
  </StrictMode>,
);
