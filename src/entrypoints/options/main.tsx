import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { createRoot } from 'react-dom/client';
import { makeTheme } from '@/lib/theme';
import { Settings } from '@/ui/Settings';

createRoot(document.getElementById('root')!).render(
  <ThemeProvider theme={makeTheme()}>
    <CssBaseline />
    <Settings variant="page" />
  </ThemeProvider>,
);
