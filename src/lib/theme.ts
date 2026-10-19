import { createTheme } from '@mui/material/styles';

export const FB_BLUE = '#1877F2';

/**
 * Dark Material theme in Facebook's dark-mode palette.
 * `container` keeps popovers/menus inside our shadow root; `htmlFontSize` compensates
 * for the host page's root font size, since rem units pierce the shadow root.
 */
export function makeTheme(opts: { container?: HTMLElement; htmlFontSize?: number } = {}) {
  const portal = opts.container ? { container: opts.container } : {};
  return createTheme({
    palette: {
      mode: 'dark',
      primary: { main: FB_BLUE },
      background: { default: '#18191A', paper: '#242526' },
      divider: '#3E4042',
      text: { primary: '#E4E6EB', secondary: '#B0B3B8' },
    },
    shape: { borderRadius: 8 },
    typography: {
      htmlFontSize: opts.htmlFontSize ?? 16,
      fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      button: { textTransform: 'none', fontWeight: 600 },
    },
    components: {
      MuiPopover: { defaultProps: portal },
      MuiPopper: { defaultProps: portal },
      MuiModal: { defaultProps: portal },
    },
  });
}
