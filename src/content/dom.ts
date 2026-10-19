const ITEM_LINK = 'a[href*="/marketplace/item/"]';
const CELL_ATTR = 'data-mpf-cell';

export const listingIdFromHref = (href: string) => href.match(/\/marketplace\/item\/(\d+)/)?.[1];

const isGridContainer = (el: HTMLElement) => {
  const cs = getComputedStyle(el);
  return (cs.display === 'flex' && cs.flexWrap === 'wrap') || cs.display === 'grid';
};

/**
 * The grid cell for a listing: the child of the wrapping flex/grid container that holds its
 * link. Hiding that cell (not an inner wrapper) lets Facebook's grid reflow without gaps.
 * Falls back to the highest ancestor that contains no other listing.
 */
function findCell(anchor: HTMLAnchorElement, id: string): HTMLElement {
  const known = anchor.closest<HTMLElement>(`[${CELL_ATTR}="${id}"]`);
  if (known) return known;
  let cell: HTMLElement = anchor;
  for (let parent = cell.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
    if (isGridContainer(parent) || parent.matches('[role="main"]')) break;
    const hasOtherListing = [...parent.querySelectorAll<HTMLAnchorElement>(ITEM_LINK)].some(
      (a) => listingIdFromHref(a.href) !== id,
    );
    if (hasOtherListing) break;
    cell = parent;
  }
  cell.setAttribute(CELL_ATTR, id);
  return cell;
}

/** Listing id -> grid cells currently in the page (a listing can appear in more than one section). */
export function scanCards(): Map<string, HTMLElement[]> {
  const cells = new Map<string, HTMLElement[]>();
  for (const a of document.querySelectorAll<HTMLAnchorElement>(ITEM_LINK)) {
    const id = listingIdFromHref(a.href);
    if (!id || a.closest('[role="dialog"]')) continue;
    const cell = findCell(a, id);
    const list = cells.get(id);
    if (!list) cells.set(id, [cell]);
    else if (!list.includes(cell)) list.push(cell);
  }
  return cells;
}

export type CellState = 'show' | 'hide' | 'dim' | 'pending';

export function styleCell(cell: HTMLElement, state: CellState, reason: string): void {
  if (cell.dataset.mpfState === state && (cell.dataset.mpfReason ?? '') === reason) return;
  const s = cell.style;
  s.removeProperty('display');
  s.removeProperty('opacity');
  s.removeProperty('filter');
  if (state === 'hide') s.setProperty('display', 'none', 'important');
  if (state === 'dim') {
    s.setProperty('opacity', '0.3');
    s.setProperty('filter', 'grayscale(1)');
  }
  if (state === 'pending') s.setProperty('opacity', '0.5');
  if (reason) {
    cell.title = reason;
    cell.dataset.mpfReason = reason;
  } else if (cell.dataset.mpfReason !== undefined) {
    cell.removeAttribute('title');
    delete cell.dataset.mpfReason;
  }
  cell.dataset.mpfState = state;
}

/** Facebook's own Marketplace sidebar (search box, categories, filters). */
export function findFbSidebar(): HTMLElement | null {
  for (const nav of document.querySelectorAll<HTMLElement>('[role="navigation"]')) {
    const r = nav.getBoundingClientRect();
    if (r.left > 50 || r.width < 200 || r.width > 520 || r.height < 300) continue;
    if (nav.textContent?.includes('Marketplace')) return nav;
  }
  return null;
}
