import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import type { Message } from '@/lib/messages';
import type { Place } from '@/lib/types';

// Nominatim's usage policy allows at most one request per second.
const NOMINATIM_GAP_MS = 1100;
let slot: Promise<unknown> = Promise.resolve();

function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = slot.then(fn);
  slot = run.catch(() => undefined).then(() => new Promise((r) => setTimeout(r, NOMINATIM_GAP_MS)));
  return run;
}

async function nominatim(query: string): Promise<Place | null | undefined> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return undefined;
    const [hit] = (await res.json()) as { lat: string; lon: string; boundingbox: string[]; display_name: string }[];
    if (!hit) return null;
    const [s = 0, n = 0, w = 0, e = 0] = hit.boundingbox.map(Number);
    return {
      center: { lat: Number(hit.lat), lng: Number(hit.lon) },
      bounds: [[s, w], [n, e]],
      label: hit.display_name,
    };
  } catch {
    return undefined;
  }
}

const inflight = new Map<string, Promise<Place | null>>();

/** Cached forever in storage; transient failures (undefined) are not cached. */
function geocode(query: string): Promise<Place | null> {
  const key = `geo:${query.trim().toLowerCase()}`;
  let p = inflight.get(key);
  if (!p) {
    p = (async () => {
      const cached = (await browser.storage.local.get(key))[key] as Place | null | undefined;
      if (cached !== undefined) return cached;
      const place = await throttled(() => nominatim(query));
      if (place !== undefined) await browser.storage.local.set({ [key]: place });
      return place ?? null;
    })();
    inflight.set(key, p);
  }
  return p;
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
    if (msg.type === 'openMap') {
      void browser.windows.create({ url: browser.runtime.getURL('/map.html'), type: 'popup', width: 1100, height: 800 });
      sendResponse();
      return;
    }
    if (msg.type === 'geocode') {
      geocode(msg.query).then(sendResponse);
      return true;
    }
  });
});
