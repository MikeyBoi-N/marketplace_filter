import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { evaluate, type EvalContext, type Need, type Verdict } from '@/lib/engine';
import { extractListings, mergeListing, parseCardText, parseGraphqlBody } from '@/lib/extract';
import { isListingGridPath } from '@/lib/fbUrl';
import { DEFAULT_FILTERS, loadFilters, watchFilters, type Filters } from '@/lib/filters';
import { compileKeywords } from '@/lib/keywords';
import { geocode } from '@/lib/messages';
import type { LatLng, Listing, Seller } from '@/lib/types';
import { findFbSidebar, scanCards, styleCell } from './dom';
import { loadItemDetails, loadSellerJoinYear, saveSellerJoinYear, TaskQueue, type Outcome, type Task } from './enrich';

export type UiMode = 'hidden' | 'docked' | 'floating' | 'collapsed';

export interface UiState {
  mode: UiMode;
  shown: number;
  hidden: number;
  pending: number;
  queued: number;
}

export interface Coverage {
  listings: number;
  withTitle: number;
  withPrice: number;
  withCity: number;
  withCoords: number;
  withDate: number;
  withSeller: number;
  sellersChecked: number;
}

const MAX_SAMPLES = 8;
const PANEL_WIDTH = 400;

// Facebook's sidebar is a flex sibling of the results, so widening it (while hidden)
// makes room for our panel and lets the grid reflow instead of being covered.
const SIDEBAR_PROPS = ['visibility', 'width', 'min-width', 'max-width', 'flex'];

function dockSidebar(sidebar: HTMLElement) {
  const s = sidebar.style;
  s.setProperty('visibility', 'hidden');
  s.setProperty('width', `${PANEL_WIDTH}px`);
  s.setProperty('min-width', `${PANEL_WIDTH}px`);
  s.setProperty('max-width', `${PANEL_WIDTH}px`);
  s.setProperty('flex', `0 0 ${PANEL_WIDTH}px`);
}

function undockSidebar(sidebar: HTMLElement) {
  for (const prop of SIDEBAR_PROPS) sidebar.style.removeProperty(prop);
}
const MAX_SAMPLE_CHARS = 300_000;

/** Owns all listing data and applies filter verdicts to the cards on the page. */
export class Controller {
  private listings = new Map<string, Listing>();
  private sellers = new Map<string, Seller>();
  private places = new Map<string, LatLng | null>();
  private placesInflight = new Set<string>();
  private cardTextParsed = new Set<string>();
  private cells = new Map<string, HTMLElement[]>();
  private verdicts = new Map<string, Verdict>();
  private filters: Filters = DEFAULT_FILTERS;
  private keywords = compileKeywords([], []);
  private queue = new TaskQueue((task) => this.runTask(task));
  private samples: string[] = [];

  private host: HTMLElement | null = null;
  private hostCss = '';
  private fbSidebar: HTMLElement | null = null;
  private collapsed = false;
  private ui: UiState = { mode: 'hidden', shown: 0, hidden: 0, pending: 0, queued: 0 };
  private listeners = new Set<() => void>();
  private applyTimer: ReturnType<typeof setTimeout> | undefined;
  private scanTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private ctx: ContentScriptContext) {}

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };

  getUi = () => this.ui;

  /** Call at document_start: starts listening for GraphQL payloads before the page makes requests. */
  async start() {
    this.ctx.addEventListener(window, 'message', (e: MessageEvent) => {
      if (e.source !== window || e.origin !== location.origin) return;
      if (e.data?.__mpf === 'graphql' && typeof e.data.text === 'string') this.ingestText(e.data.text);
    });
    this.setFilters(await loadFilters());
    this.ctx.onInvalidated(watchFilters((f) => this.setFilters(f)));
  }

  /** Call once the DOM exists and the panel's shadow host is in the page. */
  attach(host: HTMLElement) {
    this.host = host;
    for (const script of document.querySelectorAll('script[type="application/json"]')) {
      const text = script.textContent ?? '';
      if (!text.includes('marketplace_listing_title')) continue;
      try {
        this.ingestDoc(JSON.parse(text));
      } catch {
        // not JSON
      }
    }
    const observer = new MutationObserver(() => this.scheduleScan());
    observer.observe(document.body, { childList: true, subtree: true });
    this.ctx.onInvalidated(() => observer.disconnect());
    this.ctx.setInterval(() => this.layout(), 700);
    this.layout();
    this.scheduleScan();
  }

  setCollapsed(collapsed: boolean) {
    this.collapsed = collapsed;
    this.layout();
  }

  coverage(): Coverage {
    const all = [...this.listings.values()];
    const count = (pred: (l: Listing) => unknown) => all.filter(pred).length;
    return {
      listings: all.length,
      withTitle: count((l) => l.title),
      withPrice: count((l) => l.price !== undefined),
      withCity: count((l) => l.city),
      withCoords: count((l) => l.coords),
      withDate: count((l) => l.createdAt),
      withSeller: count((l) => l.sellerId),
      sellersChecked: [...this.sellers.values()].filter((s) => s.checked).length,
    };
  }

  /** Snapshot for troubleshooting parsers against Facebook's current payloads. */
  diagnostics() {
    return {
      url: location.href,
      at: new Date().toISOString(),
      coverage: this.coverage(),
      listings: [...this.listings.values()],
      sellers: [...this.sellers.values()],
      verdicts: Object.fromEntries(this.verdicts),
      samples: this.samples,
    };
  }

  private setFilters(filters: Filters) {
    this.filters = filters;
    this.keywords = compileKeywords(filters.include, filters.exclude);
    this.scheduleApply();
  }

  private ingestText(text: string) {
    if (!text.includes('marketplace_listing_title')) return;
    this.samples.push(text.slice(0, MAX_SAMPLE_CHARS));
    if (this.samples.length > MAX_SAMPLES) this.samples.shift();
    for (const doc of parseGraphqlBody(text)) this.ingestDoc(doc);
  }

  private ingestDoc(doc: unknown) {
    extractListings(doc, (l) => {
      this.listings.set(l.id, mergeListing(this.listings.get(l.id), l));
      if (l.sellerId && l.sellerJoinYear !== undefined) {
        this.sellers.set(l.sellerId, { id: l.sellerId, joinYear: l.sellerJoinYear, checked: true });
      }
    });
    this.scheduleApply();
  }

  private scheduleScan() {
    clearTimeout(this.scanTimer);
    this.scanTimer = setTimeout(() => {
      this.cells = isListingGridPath(location.pathname) ? scanCards() : new Map();
      this.parseNewCards();
      this.apply();
    }, 200);
  }

  private scheduleApply() {
    clearTimeout(this.applyTimer);
    this.applyTimer = setTimeout(() => this.apply(), 100);
  }

  /** Card text is a fallback for listings whose GraphQL data we never saw. */
  private parseNewCards() {
    for (const [id, cells] of this.cells) {
      const [cell] = cells;
      if (!cell || this.cardTextParsed.has(id)) continue;
      this.cardTextParsed.add(id);
      const fromCard = parseCardText(cell.innerText);
      const existing = this.listings.get(id);
      const missing = Object.fromEntries(
        Object.entries(fromCard).filter(([k]) => existing?.[k as keyof Listing] === undefined),
      );
      this.listings.set(id, mergeListing(existing, { ...missing, id }));
    }
  }

  private placeKey(city: string, state?: string) {
    return state ? `${city}, ${state}` : city;
  }

  private apply() {
    const ctx: EvalContext = {
      filters: this.filters,
      keywords: this.keywords,
      seller: (id) => this.sellers.get(id),
      geocode: (city, state) => this.places.get(this.placeKey(city, state)),
      now: Date.now(),
    };
    const counts = { shown: 0, hidden: 0, pending: 0 };
    for (const [id, cells] of this.cells) {
      const listing = this.listings.get(id) ?? { id };
      const verdict = evaluate(listing, ctx);
      this.verdicts.set(id, verdict);
      const state = verdict.status === 'hide' ? (this.filters.revealHidden ? 'dim' : 'hide') : verdict.status;
      const reason = verdict.status === 'show' ? '' : verdict.reasons.join('\n');
      for (const cell of cells) styleCell(cell, state, reason);
      counts[verdict.status === 'show' ? 'shown' : verdict.status === 'hide' ? 'hidden' : 'pending']++;
      for (const need of verdict.needs) this.request(need, listing);
    }
    this.setUi({ ...counts, queued: this.queue.size });
  }

  private request(need: Need, listing: Listing) {
    if (need === 'details' && !listing.detailsFetched) this.queue.add({ kind: 'details', id: listing.id });
    if (need === 'seller' && listing.sellerId) this.queue.add({ kind: 'seller', id: listing.sellerId });
    if (need === 'geo' && listing.city) {
      const key = this.placeKey(listing.city, listing.state);
      if (this.places.has(key) || this.placesInflight.has(key)) return;
      this.placesInflight.add(key);
      geocode(key)
        .then((place) => this.places.set(key, place?.center ?? null))
        .catch(() => this.places.set(key, null))
        .finally(() => {
          this.placesInflight.delete(key);
          this.scheduleApply();
        });
    }
  }

  private async runTask(task: Task): Promise<Outcome> {
    try {
      return task.kind === 'details' ? await this.runDetails(task.id) : await this.runSeller(task.id);
    } finally {
      this.scheduleApply();
    }
  }

  private async runDetails(id: string): Promise<Outcome> {
    // Only fetch for listings still on screen and still waiting on this data.
    if (!this.cells.has(id) || !this.verdicts.get(id)?.needs.includes('details')) return 'skip';
    try {
      const { listing, joinYear, cached } = await loadItemDetails(id);
      const merged = mergeListing(this.listings.get(id), { ...listing, id, detailsFetched: true });
      this.listings.set(id, merged);
      if (merged.sellerId && joinYear !== undefined) {
        this.sellers.set(merged.sellerId, { id: merged.sellerId, joinYear, checked: true });
        if (!cached) await saveSellerJoinYear(merged.sellerId, joinYear);
      }
      return cached ? 'cache' : 'network';
    } catch (err) {
      this.listings.set(id, mergeListing(this.listings.get(id), { id, detailsFetched: true }));
      throw err;
    }
  }

  private async runSeller(sellerId: string): Promise<Outcome> {
    if (this.sellers.get(sellerId)?.checked) return 'cache';
    const stillNeeded = [...this.cells.keys()].some(
      (id) => this.listings.get(id)?.sellerId === sellerId && this.verdicts.get(id)?.needs.includes('seller'),
    );
    if (!stillNeeded) return 'skip';
    try {
      const { joinYear, cached } = await loadSellerJoinYear(sellerId);
      this.sellers.set(sellerId, { id: sellerId, joinYear: joinYear ?? undefined, checked: true });
      return cached ? 'cache' : 'network';
    } catch (err) {
      this.sellers.set(sellerId, { id: sellerId, checked: true });
      throw err;
    }
  }

  /** Docks the panel over Facebook's sidebar, or floats it when the sidebar can't be found. */
  private layout() {
    const onGrid = isListingGridPath(location.pathname);
    const sidebar = onGrid ? findFbSidebar() : null;
    if (this.fbSidebar && this.fbSidebar !== sidebar) undockSidebar(this.fbSidebar);
    this.fbSidebar = sidebar;

    const mode: UiMode = !onGrid ? 'hidden' : this.collapsed ? 'collapsed' : sidebar ? 'docked' : 'floating';
    if (sidebar) {
      if (mode === 'docked') dockSidebar(sidebar);
      else undockSidebar(sidebar);
    }

    let css = 'position:fixed;z-index:2;';
    if (mode === 'hidden') css = 'display:none;';
    else if (mode === 'collapsed') css += 'left:16px;bottom:16px;';
    else if (mode === 'floating') css += 'left:16px;top:72px;width:340px;height:calc(100vh - 88px);';
    else {
      const r = sidebar!.getBoundingClientRect();
      const bannerBottom = document.querySelector('[role="banner"]')?.getBoundingClientRect().bottom ?? 0;
      const top = Math.max(r.top, bannerBottom);
      css += `left:${r.left}px;top:${top}px;width:${r.width}px;height:${window.innerHeight - top}px;`;
    }
    if (this.host && this.hostCss !== css) {
      this.host.style.cssText = css;
      this.hostCss = css;
    }
    this.setUi({ mode });
  }

  private setUi(patch: Partial<UiState>) {
    const next = { ...this.ui, ...patch };
    if ((Object.keys(next) as (keyof UiState)[]).every((k) => next[k] === this.ui[k])) return;
    this.ui = next;
    for (const fn of this.listeners) fn();
  }
}
