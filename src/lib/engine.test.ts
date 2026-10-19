import { describe, expect, it } from 'vitest';
import { evaluate, isPlaceholderPrice, type EvalContext } from './engine';
import { DEFAULT_FILTERS, type Filters } from './filters';
import { compileKeywords } from './keywords';
import type { Listing, Seller } from './types';

const NOW = Date.UTC(2026, 9, 19);
const DAY = 86_400_000;

function ctx(patch: Partial<Filters> = {}, sellers: Seller[] = [], places: Record<string, { lat: number; lng: number } | null> = {}): EvalContext {
  const filters = { ...DEFAULT_FILTERS, ...patch };
  return {
    filters,
    keywords: compileKeywords(filters.include, filters.exclude),
    seller: (id) => sellers.find((s) => s.id === id),
    geocode: (city, state) => places[`${city}, ${state}`],
    now: NOW,
  };
}

const listing = (patch: Partial<Listing> = {}): Listing => ({ id: '1', title: 'Road bike', price: 300, ...patch });

describe('evaluate', () => {
  it('shows everything when disabled', () => {
    expect(evaluate(listing({ isSold: true }), ctx({ enabled: false })).status).toBe('show');
  });

  it('hides sold and pending listings', () => {
    expect(evaluate(listing({ isPending: true }), ctx()).reasons).toEqual(['Pending']);
  });

  it('applies keyword include and exclude to title and description', () => {
    const c = ctx({ include: ['carbon'], exclude: ['parts'] });
    expect(evaluate(listing({ title: 'Carbon road bike' }), c).status).toBe('show');
    expect(evaluate(listing({ title: 'Road bike', description: 'Full carbon frame' }), c).status).toBe('show');
    expect(evaluate(listing({ title: 'Carbon bike for parts' }), c).reasons).toEqual(['Contains "parts"']);
    expect(evaluate(listing({ title: 'Aluminum bike' }), c).reasons).toEqual(['Missing "carbon"']);
  });

  it('filters price range and placeholder prices', () => {
    const c = ctx({ minPrice: 100, maxPrice: 500 });
    expect(evaluate(listing({ price: 50 }), c).status).toBe('hide');
    expect(evaluate(listing({ price: 600 }), c).status).toBe('hide');
    expect(evaluate(listing({ price: 1234 }), ctx()).reasons[0]).toMatch(/Placeholder/);
    expect(evaluate(listing({ price: 0 }), ctx()).status).toBe('show');
  });

  it('asks for details when the listing date is unknown, then judges it', () => {
    const c = ctx({ postedWithinDays: 7 });
    expect(evaluate(listing(), c)).toMatchObject({ status: 'pending', needs: ['details'] });
    expect(evaluate(listing({ createdAt: NOW - 2 * DAY }), c).status).toBe('show');
    expect(evaluate(listing({ createdAt: NOW - 10 * DAY }), c).status).toBe('hide');
    expect(evaluate(listing({ createdAt: NOW - 1 * DAY }), ctx({ listedAtLeastDays: 3 })).status).toBe('hide');
  });

  it('uses geocoded city centers for the radius filter', () => {
    const location = { mode: 'radius' as const, center: { lat: 39.74, lng: -104.99 }, radiusMiles: 30, polygon: [] };
    const near = listing({ city: 'Aurora', state: 'CO' });
    expect(evaluate(near, ctx({ location }))).toMatchObject({ status: 'pending', needs: ['geo'] });
    expect(evaluate(near, ctx({ location }, [], { 'Aurora, CO': { lat: 39.73, lng: -104.83 } })).status).toBe('show');
    const far = listing({ city: 'Pueblo', state: 'CO' });
    expect(evaluate(far, ctx({ location }, [], { 'Pueblo, CO': { lat: 38.25, lng: -104.61 } })).status).toBe('hide');
  });

  it('prefers exact coordinates and checks drawn areas', () => {
    const polygon = [
      { lat: 40, lng: -105 },
      { lat: 40, lng: -104 },
      { lat: 39, lng: -104 },
      { lat: 39, lng: -105 },
    ];
    const c = ctx({ location: { mode: 'area', center: null, radiusMiles: 25, polygon } });
    expect(evaluate(listing({ coords: { lat: 39.5, lng: -104.5 } }), c).status).toBe('show');
    expect(evaluate(listing({ coords: { lat: 41, lng: -104.5 } }), c).status).toBe('hide');
  });

  it('walks through seller lookup to a verdict', () => {
    const c = (sellers: Seller[] = []) => ctx({ sellerJoinedByYear: 2024 }, sellers);
    expect(evaluate(listing(), c()).needs).toEqual(['details']);
    expect(evaluate(listing({ sellerId: 's' }), c()).needs).toEqual(['seller']);
    expect(evaluate(listing({ sellerId: 's' }), c([{ id: 's', checked: true, joinYear: 2025 }])).status).toBe('hide');
    expect(evaluate(listing({ sellerId: 's' }), c([{ id: 's', checked: true, joinYear: 2012 }])).status).toBe('show');
  });

  it('shows unverifiable listings unless strict', () => {
    const unknown = listing({ sellerId: 's' });
    const sellers = [{ id: 's', checked: true }];
    expect(evaluate(unknown, ctx({ sellerJoinedByYear: 2024 }, sellers)).status).toBe('show');
    expect(evaluate(unknown, ctx({ sellerJoinedByYear: 2024, strict: true }, sellers)).status).toBe('hide');
  });

  it('does not fetch anything once a cheap check already fails', () => {
    const v = evaluate(listing({ price: 5 }), ctx({ minPrice: 100, sellerJoinedByYear: 2024 }));
    expect(v).toMatchObject({ status: 'hide', needs: [] });
  });
});

describe('isPlaceholderPrice', () => {
  it('flags typical placeholder prices only', () => {
    expect([1, 1234, 123456, 999999].every(isPlaceholderPrice)).toBe(true);
    expect([0, 15, 9999, 1250].some(isPlaceholderPrice)).toBe(false);
  });
});
