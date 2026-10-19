import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { createRoot } from 'react-dom/client';
import { makeTheme } from '@/lib/theme';
import { MapEditor } from './MapEditor';

createRoot(document.getElementById('root')!).render(
  <ThemeProvider theme={makeTheme()}>
    <CssBaseline />
    <MapEditor />
  </ThemeProvider>,
);
