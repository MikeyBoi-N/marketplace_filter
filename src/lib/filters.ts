import { browser } from 'wxt/browser';
import type { Condition, LatLng } from './types';

export type SortOrder =
  | 'best_match'
  | 'creation_time_descend'
  | 'price_ascend'
  | 'price_descend'
  | 'distance_ascend';

export const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: 'creation_time_descend', label: 'Newest first' },
  { value: 'best_match', label: 'Suggested' },
  { value: 'price_ascend', label: 'Price: low to high' },
  { value: 'price_descend', label: 'Price: high to low' },
  { value: 'distance_ascend', label: 'Distance: nearest first' },
];

export const CONDITIONS: { value: Condition; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'used_like_new', label: 'Like new' },
  { value: 'used_good', label: 'Good' },
  { value: 'used_fair', label: 'Fair' },
];

export interface LocationFilter {
  mode: 'off' | 'radius' | 'area';
  center: LatLng | null;
  radiusMiles: number;
  polygon: LatLng[];
  /** Place name the user searched for on the map, for display only. */
  label?: string;
}

export interface Filters {
  enabled: boolean;
  sort: SortOrder;
  /** Every term must match. A term may hold alternatives separated by `|`. */
  include: string[];
  /** Any matching term hides the listing. */
  exclude: string[];
  minPrice: number | null;
  maxPrice: number | null;
  hidePlaceholderPrices: boolean;
  conditions: Condition[];
  postedWithinDays: number | null;
  listedAtLeastDays: number | null;
  location: LocationFilter;
  /** Hide sellers who joined Facebook after this year. */
  sellerJoinedByYear: number | null;
  hideSoldPending: boolean;
  /** Hide listings whose required data could not be determined, instead of showing them. */
  strict: boolean;
  /** Show filtered-out listings dimmed (with reasons on hover) instead of removing them. */
  revealHidden: boolean;
}

export const DEFAULT_FILTERS: Filters = {
  enabled: true,
  sort: 'creation_time_descend',
  include: [],
  exclude: [],
  minPrice: null,
  maxPrice: null,
  hidePlaceholderPrices: true,
  conditions: [],
  postedWithinDays: null,
  listedAtLeastDays: null,
  location: { mode: 'off', center: null, radiusMiles: 25, polygon: [] },
  sellerJoinedByYear: null,
  hideSoldPending: true,
  strict: false,
  revealHidden: false,
};

const KEY = 'filters';

function normalize(raw: unknown): Filters {
  const r = (raw ?? {}) as Partial<Filters>;
  return { ...DEFAULT_FILTERS, ...r, location: { ...DEFAULT_FILTERS.location, ...(r.location ?? {}) } };
}

export async function loadFilters(): Promise<Filters> {
  const stored = await browser.storage.local.get(KEY);
  return normalize(stored[KEY]);
}

export function saveFilters(filters: Filters): Promise<void> {
  return browser.storage.local.set({ [KEY]: filters });
}

export function watchFilters(onChange: (filters: Filters) => void): () => void {
  const listener = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area === 'local' && KEY in changes) onChange(normalize(changes[KEY].newValue));
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}
