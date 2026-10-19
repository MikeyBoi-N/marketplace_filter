import { defineContentScript } from 'wxt/utils/define-content-script';

/**
 * Runs in the page's own JS world so it can observe Facebook's GraphQL traffic.
 * Response bodies are forwarded to the isolated content script via postMessage;
 * nothing is modified.
 */
export default defineContentScript({
  matches: ['https://www.facebook.com/*', 'https://web.facebook.com/*'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    const isGraphql = (url: string) => url.includes('/api/graphql');
    const forward = (text: string) => {
      if (location.pathname.startsWith('/marketplace') && text.includes('marketplace')) {
        window.postMessage({ __mpf: 'graphql', text }, location.origin);
      }
    };

    const urls = new WeakMap<XMLHttpRequest, string>();
    const origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, ...args: unknown[]) {
      urls.set(this, String(args[1]));
      return (origOpen as (...a: unknown[]) => void).apply(this, args);
    };
    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
      if (isGraphql(urls.get(this) ?? '')) {
        this.addEventListener('load', () => {
          if (this.responseType === '' || this.responseType === 'text') forward(this.responseText);
        });
      }
      return origSend.call(this, body);
    };

    const origFetch = window.fetch;
    window.fetch = async function (this: unknown, ...args: Parameters<typeof fetch>) {
      const res = await origFetch.apply(this, args);
      const input = args[0];
      const url = input instanceof Request ? input.url : String(input);
      if (isGraphql(url)) res.clone().text().then(forward, () => undefined);
      return res;
    };
  },
});
