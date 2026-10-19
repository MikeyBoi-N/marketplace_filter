import type { Filters } from './filters';

const NON_LOCATION_SEGMENTS = new Set([
  'search', 'category', 'item', 'you', 'inbox', 'create', 'notifications', 'saved', 'profile', 'buying', 'selling',
]);

/** Facebook encodes the search location as the first path segment, e.g. /marketplace/denver/search/. */
export function locationSegment(pathname: string): string | null {
  const seg = pathname.match(/^\/marketplace\/([^/?#]+)/)?.[1];
  return seg && !NON_LOCATION_SEGMENTS.has(seg) ? seg : null;
}

/** Pages that show a grid of listings (where our panel replaces Facebook's sidebar). */
export function isListingGridPath(pathname: string): boolean {
  return /^\/marketplace(\/|$)/.test(pathname) && !/^\/marketplace\/(item|you|inbox|create|notifications|profile)(\/|$)/.test(pathname);
}

/** Facebook only accepts 1, 7 or 30 for daysSinceListed; pick the tightest that still covers the request. */
export function fbDaysSinceListed(days: number | null): number | null {
  if (days == null) return null;
  return [1, 7, 30].find((d) => days <= d) ?? null;
}

/** Builds a Marketplace search URL that pushes every server-supported filter to Facebook. */
export function buildSearchUrl(query: string, filters: Filters, currentPath: string): string {
  const loc = locationSegment(currentPath);
  const params = new URLSearchParams();
  if (query.trim()) params.set('query', query.trim());
  if (filters.minPrice != null) params.set('minPrice', String(Math.floor(filters.minPrice)));
  if (filters.maxPrice != null) params.set('maxPrice', String(Math.ceil(filters.maxPrice)));
  const days = fbDaysSinceListed(filters.postedWithinDays);
  if (days) params.set('daysSinceListed', String(days));
  if (filters.conditions.length) params.set('itemCondition', filters.conditions.join(','));
  if (filters.sort !== 'best_match') params.set('sortBy', filters.sort);
  params.set('exact', 'false');
  const base = `/marketplace/${loc ? `${loc}/` : ''}`;
  return `${query.trim() ? `${base}search/` : base}?${params}`;
}
