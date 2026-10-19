import { browser } from 'wxt/browser';
import type { Place } from './types';

export type Message = { type: 'openMap' } | { type: 'geocode'; query: string };

export function openMapWindow(): Promise<void> {
  return browser.runtime.sendMessage({ type: 'openMap' } satisfies Message);
}

/** Resolves a free-text place via the background's rate-limited, cached Nominatim lookup. */
export function geocode(query: string): Promise<Place | null> {
  return browser.runtime.sendMessage({ type: 'geocode', query } satisfies Message);
}
