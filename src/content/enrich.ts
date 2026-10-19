import { browser } from 'wxt/browser';
import { matchJoinYear, parseItemPage } from '@/lib/extract';
import type { Listing } from '@/lib/types';

export type Task = { kind: 'details'; id: string } | { kind: 'seller'; id: string };
/** 'network' tasks are followed by a polite delay; cached or skipped ones are not. */
export type Outcome = 'network' | 'cache' | 'skip';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Single serial queue for every request we make to Facebook, spaced out so browsing
 * with the extension looks like a person opening listings rather than a scraper.
 */
export class TaskQueue {
  private items: Task[] = [];
  private keys = new Set<string>();
  private running = false;

  constructor(
    private worker: (task: Task) => Promise<Outcome>,
    private gapMs = 1500,
    private jitterMs = 1000,
    private errorBackoffMs = 15_000,
  ) {}

  get size() {
    return this.items.length;
  }

  add(task: Task) {
    const key = `${task.kind}:${task.id}`;
    if (this.keys.has(key)) return;
    this.keys.add(key);
    this.items.push(task);
    void this.run();
  }

  private async run() {
    if (this.running) return;
    this.running = true;
    while (this.items.length) {
      const task = this.items.shift()!;
      let outcome: Outcome;
      try {
        outcome = await this.worker(task);
      } catch (err) {
        console.warn('[Marketplace Filter] lookup failed', task, err);
        await sleep(this.errorBackoffMs);
        continue;
      }
      // A skipped task wasn't needed yet; let it be queued again later.
      if (outcome === 'skip') this.keys.delete(`${task.kind}:${task.id}`);
      if (outcome === 'network') await sleep(this.gapMs + Math.random() * this.jitterMs);
    }
    this.running = false;
  }
}

const DAY_MS = 86_400_000;
const ITEM_TTL_MS = 3 * DAY_MS;
const SELLER_RETRY_MS = 7 * DAY_MS;
const MAX_DESCRIPTION = 2000;

interface ItemCacheEntry {
  listing: Partial<Listing>;
  joinYear?: number;
  at: number;
}

interface SellerCacheEntry {
  joinYear: number | null;
  at: number;
}

async function readCache<T>(key: string): Promise<T | undefined> {
  return (await browser.storage.local.get(key))[key] as T | undefined;
}

async function fetchHtml(path: string): Promise<string> {
  // Without an HTML Accept header Facebook returns a lighter page that lacks the listing and seller data.
  const res = await fetch(`${location.origin}${path}`, {
    credentials: 'include',
    headers: { Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
  return res.text();
}

/** Item page details (date, exact location, seller, description), cached for a few days. */
export async function loadItemDetails(id: string): Promise<ItemCacheEntry & { cached: boolean }> {
  const key = `item:${id}`;
  const cached = await readCache<ItemCacheEntry>(key);
  if (cached && Date.now() - cached.at < ITEM_TTL_MS) return { ...cached, cached: true };

  const { listing, joinYear } = parseItemPage(await fetchHtml(`/marketplace/item/${id}/`), id);
  const entry: ItemCacheEntry = {
    listing: listing ? { ...listing, description: listing.description?.slice(0, MAX_DESCRIPTION) } : {},
    joinYear,
    at: Date.now(),
  };
  await browser.storage.local.set({ [key]: entry });
  return { ...entry, cached: false };
}

/** Seller's "Joined Facebook in YYYY", cached forever once found. */
export async function loadSellerJoinYear(sellerId: string): Promise<{ joinYear: number | null; cached: boolean }> {
  const key = `seller:${sellerId}`;
  const cached = await readCache<SellerCacheEntry>(key);
  if (cached && (cached.joinYear !== null || Date.now() - cached.at < SELLER_RETRY_MS)) {
    return { joinYear: cached.joinYear, cached: true };
  }
  const joinYear = matchJoinYear(await fetchHtml(`/marketplace/profile/${sellerId}/`)) ?? null;
  await saveSellerJoinYear(sellerId, joinYear);
  return { joinYear, cached: false };
}

export function saveSellerJoinYear(sellerId: string, joinYear: number | null): Promise<void> {
  return browser.storage.local.set({ [`seller:${sellerId}`]: { joinYear, at: Date.now() } satisfies SellerCacheEntry });
}
