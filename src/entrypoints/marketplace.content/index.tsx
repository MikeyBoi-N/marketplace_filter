import createCache from '@emotion/cache';
import { CacheProvider } from '@emotion/react';
import { ThemeProvider } from '@mui/material/styles';
import { createRoot } from 'react-dom/client';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
import { Controller } from '@/content/controller';
import { App } from '@/content/Panel';
import { makeTheme } from '@/lib/theme';

export default defineContentScript({
  matches: ['https://www.facebook.com/*', 'https://web.facebook.com/*'],
  // Early, so the GraphQL listener is in place before Facebook's first requests.
  runAt: 'document_start',
  cssInjectionMode: 'ui',
  async main(ctx) {
    const controller = new Controller(ctx);
    await controller.start();
    if (document.readyState === 'loading') {
      await new Promise((resolve) => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
    }
    const htmlFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;

    const ui = await createShadowRootUi(ctx, {
      name: 'marketplace-filter',
      position: 'inline',
      anchor: 'body',
      append: 'last',
      isolateEvents: true,
      // WXT's default reset is `:host { all: initial !important }`, and an !important rule inside a
      // shadow root beats the host's inline styles, which would discard the controller's fixed
      // positioning. Use the same reset without !important instead.
      inheritStyles: true,
      css: ':host { all: initial; }',
      onMount(container, shadow, host) {
        container.style.height = '100%';
        controller.attach(host);
        const cache = createCache({ key: 'mpf', container: shadow.querySelector('head') ?? shadow, prepend: true });
        const root = createRoot(container);
        root.render(
          <CacheProvider value={cache}>
            <ThemeProvider theme={makeTheme({ container, htmlFontSize })}>
              <App controller={controller} />
            </ThemeProvider>
          </CacheProvider>,
        );
        return root;
      },
      onRemove(root) {
        root?.unmount();
      },
    });
    ui.mount();
  },
});
