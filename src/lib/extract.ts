import type { Condition, Listing } from './types';

/*
 * Facebook's DOM is obfuscated, but the GraphQL payloads behind it are structured.
 * Listing nodes are recognised by shape (an `id` plus `marketplace_listing_title`)
 * rather than by query name, so this keeps working when Facebook renames queries.
 */

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
};
const get = (o: unknown, ...path: string[]): unknown =>
  path.reduce<unknown>((cur, key) => (isObj(cur) ? cur[key] : undefined), o);

/** Parses a GraphQL response body, which may be several JSON documents separated by newlines. */
export function parseGraphqlBody(text: string): unknown[] {
  const docs: unknown[] = [];
  for (const line of text.replace(/^for \(;;\);/, '').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    try {
      docs.push(JSON.parse(trimmed));
    } catch {
      // partial or non-JSON chunk
    }
  }
  return docs;
}

export function parsePriceText(text: string): number | undefined {
  if (/^\s*free\s*$/i.test(text)) return 0;
  const match = text.replace(/,/g, '').match(/\d+(\.\d+)?/);
  return match ? Number(match[0]) : undefined;
}

export function normalizeCondition(raw: unknown): Condition | undefined {
  const s = str(raw)?.toLowerCase().replace(/[^a-z]+/g, '_');
  if (!s) return undefined;
  if (s.includes('like_new')) return 'used_like_new';
  if (s.includes('fair')) return 'used_fair';
  if (s.includes('good')) return 'used_good';
  if (/(^|_)new($|_)/.test(s)) return 'new';
  return undefined;
}

function parsePrice(o: Obj): { price?: number; currency?: string } {
  const p = o.listing_price ?? o.formatted_price ?? o.price;
  if (!isObj(p)) return {};
  const formatted = str(p.formatted_amount) ?? str(p.text);
  const price = num(p.amount) ?? (formatted ? parsePriceText(formatted) : undefined);
  return { price, currency: str(p.currency) };
}

function parseCondition(o: Obj): Condition | undefined {
  const direct = normalizeCondition(o.condition);
  if (direct) return direct;
  const attrs = o.attribute_data;
  if (!Array.isArray(attrs)) return undefined;
  for (const a of attrs) {
    if (isObj(a) && /condition/i.test(String(a.attribute_name ?? a.name ?? ''))) {
      return normalizeCondition(a.value ?? a.label);
    }
  }
  return undefined;
}

function parseLocation(o: Obj): Pick<Listing, 'city' | 'state' | 'coords'> {
  const loc = o.location ?? o.item_location;
  const geo = get(loc, 'reverse_geocode') ?? get(loc, 'reverse_geocode_detailed');
  let city = str(get(geo, 'city'));
  let state = str(get(geo, 'state'));
  if (!city) {
    const text = str(get(o, 'location_text', 'text')) ?? str(get(geo, 'city_page', 'display_name'));
    const m = text?.match(/^(.+?),\s*(.+)$/);
    if (m) [city, state] = [m[1], m[2]];
  }
  const lat = num(get(loc, 'latitude'));
  const lng = num(get(loc, 'longitude'));
  const coords = lat !== undefined && lng !== undefined && (lat !== 0 || lng !== 0) ? { lat, lng } : undefined;
  return { city, state, coords };
}

export function toListing(o: Obj): Listing | null {
  const id = str(o.id);
  if (!id || !/^\d+$/.test(id)) return null;
  const seller = isObj(o.marketplace_listing_seller) ? o.marketplace_listing_seller : undefined;
  const created = num(o.creation_time);
  const joined = num(seller?.join_time);
  return {
    id,
    title: str(o.marketplace_listing_title) ?? str(o.custom_title),
    ...parsePrice(o),
    ...parseLocation(o),
    createdAt: created !== undefined ? created * 1000 : undefined,
    isSold: typeof o.is_sold === 'boolean' ? o.is_sold : undefined,
    isPending: typeof o.is_pending === 'boolean' ? o.is_pending : undefined,
    sellerId: str(seller?.id),
    sellerName: str(seller?.name),
    sellerJoinYear: joined !== undefined ? new Date(joined * 1000).getUTCFullYear() : undefined,
    condition: parseCondition(o),
    description: str(get(o, 'redacted_description', 'text')) ?? str(get(o, 'description', 'text')),
  };
}

/** Walks any JSON value and reports every listing node found in it. */
export function extractListings(root: unknown, onListing: (listing: Listing) => void): void {
  const stack: unknown[] = [root];
  while (stack.length) {
    const v = stack.pop();
    if (Array.isArray(v)) {
      for (const x of v) if (x && typeof x === 'object') stack.push(x);
      continue;
    }
    if (!isObj(v)) continue;
    if (typeof v.marketplace_listing_title === 'string') {
      const listing = toListing(v);
      if (listing) onListing(listing);
    }
    for (const key in v) {
      const x = v[key];
      if (x && typeof x === 'object') stack.push(x);
    }
  }
}

/** Copies defined fields of `update` onto `base`. */
export function mergeListing(base: Listing | undefined, update: Partial<Listing> & { id: string }): Listing {
  const merged: Listing = { ...(base ?? { id: update.id }) };
  for (const [key, value] of Object.entries(update)) {
    if (value !== undefined) (merged as unknown as Obj)[key] = value;
  }
  return merged;
}

const JSON_SCRIPT_RE = /<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/g;

export function jsonScriptsFromHtml(html: string): unknown[] {
  const docs: unknown[] = [];
  for (const [, body = ''] of html.matchAll(JSON_SCRIPT_RE)) {
    if (!body.includes('marketplace')) continue;
    try {
      docs.push(JSON.parse(body));
    } catch {
      // not JSON after all
    }
  }
  return docs;
}

export function matchJoinYear(text: string): number | undefined {
  // React's server render puts a comment between the text and the year.
  const m = text.match(/Joined Facebook in (?:<!-- -->)?(\d{4})/);
  return m ? Number(m[1]) : undefined;
}

/** Pulls the target listing and the seller's join year out of an item page's HTML. */
export function parseItemPage(html: string, id: string): { listing: Listing | null; joinYear?: number } {
  let listing: Listing | null = null;
  for (const doc of jsonScriptsFromHtml(html)) {
    extractListings(doc, (l) => {
      if (l.id === id) listing = mergeListing(listing ?? undefined, l);
    });
  }
  return { listing, joinYear: (listing as Listing | null)?.sellerJoinYear ?? matchJoinYear(html) };
}

/**
 * Fallback for cards whose data never came through GraphQL. Card text is typically:
 * price, [old price], title, "City, ST", [mileage].
 */
export function parseCardText(text: string): Partial<Listing> {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const isPrice = (l: string) => /^(free|[$€£]\s?[\d,.]+|[\d,.]+\s?[$€£])$/i.test(l);
  const result: Partial<Listing> = {};
  const firstPrice = lines.find(isPrice);
  if (firstPrice) result.price = parsePriceText(firstPrice);
  const title = lines.find((l) => !isPrice(l));
  if (title) result.title = title;
  const place = lines.find((l) => l !== title && /^[^,\d]+,\s*[A-Z]{2}$/.test(l));
  if (place) {
    const [city, state] = place.split(/,\s*/);
    result.city = city;
    result.state = state;
  }
  return result;
}
