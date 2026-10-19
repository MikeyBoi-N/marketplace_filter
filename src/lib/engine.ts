import { CONDITIONS, type Filters } from './filters';
import { distanceMiles, pointInPolygon } from './geo';
import { termMatches, type CompiledKeywords } from './keywords';
import type { LatLng, Listing, Seller } from './types';

/** Data a listing still needs before it can be judged. */
export type Need = 'details' | 'seller' | 'geo';

export interface Verdict {
  status: 'show' | 'hide' | 'pending';
  reasons: string[];
  needs: Need[];
}

export interface EvalContext {
  filters: Filters;
  keywords: CompiledKeywords;
  seller: (id: string) => Seller | undefined;
  /** undefined = not looked up yet, null = lookup failed. */
  geocode: (city: string, state?: string) => LatLng | null | undefined;
  now: number;
}

type Check = { fail: string } | { need: Need; label: string } | { unverified: string } | null;

const DAY_MS = 86_400_000;

export function isPlaceholderPrice(price: number): boolean {
  return price === 1 || /^(1234|12345|123456|1234567|111111+|999999+)$/.test(String(Math.round(price)));
}

function formatDays(days: number): string {
  if (days < 1) return `${Math.max(1, Math.round(days * 24))}h`;
  return `${Math.round(days)}d`;
}

function checkStatus(l: Listing, { filters }: EvalContext): Check {
  if (!filters.hideSoldPending) return null;
  if (l.isSold) return { fail: 'Sold' };
  if (l.isPending) return { fail: 'Pending' };
  return null;
}

function checkKeywords(l: Listing, { keywords }: EvalContext): Check {
  if (!keywords.include.length && !keywords.exclude.length) return null;
  if (!l.title) return l.detailsFetched ? { unverified: 'Title unknown' } : { need: 'details', label: 'Loading title' };
  const text = l.description ? `${l.title}\n${l.description}` : l.title;
  const excluded = keywords.exclude.find((t) => termMatches(t, text));
  if (excluded) return { fail: `Contains "${excluded.source}"` };
  const missing = keywords.include.find((t) => !termMatches(t, text));
  if (missing) return { fail: `Missing "${missing.source}"` };
  return null;
}

function checkPrice(l: Listing, { filters }: EvalContext): Check {
  const { minPrice, maxPrice, hidePlaceholderPrices } = filters;
  if (minPrice == null && maxPrice == null && !hidePlaceholderPrices) return null;
  if (l.price === undefined) {
    return l.detailsFetched ? { unverified: 'Price unknown' } : { need: 'details', label: 'Loading price' };
  }
  if (hidePlaceholderPrices && isPlaceholderPrice(l.price)) return { fail: `Placeholder price (${l.price})` };
  if (minPrice != null && l.price < minPrice) return { fail: `Under $${minPrice}` };
  if (maxPrice != null && l.price > maxPrice) return { fail: `Over $${maxPrice}` };
  return null;
}

function checkCondition(l: Listing, { filters }: EvalContext): Check {
  // Unknown condition is left to Facebook's own itemCondition parameter; it isn't worth a page fetch.
  if (!filters.conditions.length || !l.condition || filters.conditions.includes(l.condition)) return null;
  const label = CONDITIONS.find((c) => c.value === l.condition)?.label ?? l.condition;
  return { fail: `Condition: ${label}` };
}

function checkAge(l: Listing, { filters, now }: EvalContext): Check {
  const { postedWithinDays, listedAtLeastDays } = filters;
  if (postedWithinDays == null && listedAtLeastDays == null) return null;
  if (l.createdAt === undefined) {
    return l.detailsFetched ? { unverified: 'Listing date unknown' } : { need: 'details', label: 'Checking listing date' };
  }
  const days = (now - l.createdAt) / DAY_MS;
  if (postedWithinDays != null && days > postedWithinDays) return { fail: `Listed ${formatDays(days)} ago` };
  if (listedAtLeastDays != null && days < listedAtLeastDays) return { fail: `Only listed ${formatDays(days)} ago` };
  return null;
}

function checkLocation(l: Listing, ctx: EvalContext): Check {
  const loc = ctx.filters.location;
  const active =
    (loc.mode === 'radius' && loc.center) || (loc.mode === 'area' && loc.polygon.length >= 3);
  if (!active) return null;

  let point = l.coords;
  if (!point && l.city) {
    const g = ctx.geocode(l.city, l.state);
    if (g === undefined) return { need: 'geo', label: `Locating ${l.city}` };
    if (g) point = g;
  }
  if (!point) {
    return l.detailsFetched ? { unverified: 'Location unknown' } : { need: 'details', label: 'Loading location' };
  }

  const where = l.city ?? 'listing';
  if (loc.mode === 'radius') {
    const d = distanceMiles(loc.center!, point);
    return d > loc.radiusMiles ? { fail: `${where} is ${Math.round(d)} mi away` } : null;
  }
  return pointInPolygon(point, loc.polygon) ? null : { fail: `${where} is outside your area` };
}

function checkSeller(l: Listing, ctx: EvalContext): Check {
  const year = ctx.filters.sellerJoinedByYear;
  if (year == null) return null;
  if (!l.sellerId) {
    return l.detailsFetched ? { unverified: 'Seller unknown' } : { need: 'details', label: 'Finding seller' };
  }
  const seller = ctx.seller(l.sellerId);
  if (!seller?.checked) return { need: 'seller', label: 'Checking seller account age' };
  if (seller.joinYear === undefined) return { unverified: 'Seller join date unknown' };
  if (seller.joinYear > year) return { fail: `Seller joined Facebook in ${seller.joinYear}` };
  return null;
}

const CHECKS = [checkStatus, checkKeywords, checkPrice, checkCondition, checkAge, checkLocation, checkSeller];

export function evaluate(listing: Listing, ctx: EvalContext): Verdict {
  if (!ctx.filters.enabled) return { status: 'show', reasons: [], needs: [] };
  const results = CHECKS.map((check) => check(listing, ctx)).filter((r): r is NonNullable<Check> => r !== null);

  const fails = results.flatMap((r) => ('fail' in r ? [r.fail] : []));
  if (fails.length) return { status: 'hide', reasons: fails, needs: [] };

  const pending = results.flatMap((r) => ('need' in r ? [r] : []));
  if (pending.length) {
    return { status: 'pending', reasons: pending.map((p) => p.label), needs: [...new Set(pending.map((p) => p.need))] };
  }

  const unverified = results.flatMap((r) => ('unverified' in r ? [r.unverified] : []));
  return { status: unverified.length && ctx.filters.strict ? 'hide' : 'show', reasons: unverified, needs: [] };
}
