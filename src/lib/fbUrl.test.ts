import { describe, expect, it } from 'vitest';
import { buildSearchUrl, fbDaysSinceListed, isListingGridPath, locationSegment } from './fbUrl';
import { DEFAULT_FILTERS } from './filters';

describe('locationSegment', () => {
  it('keeps city slugs and ids, ignores Marketplace sections', () => {
    expect(locationSegment('/marketplace/denver/search/')).toBe('denver');
    expect(locationSegment('/marketplace/108424279189115/')).toBe('108424279189115');
    expect(locationSegment('/marketplace/search/')).toBeNull();
    expect(locationSegment('/marketplace/category/vehicles')).toBeNull();
  });
});

describe('isListingGridPath', () => {
  it('excludes item pages and inbox', () => {
    expect(isListingGridPath('/marketplace/denver/search/')).toBe(true);
    expect(isListingGridPath('/marketplace/')).toBe(true);
    expect(isListingGridPath('/marketplace/item/123/')).toBe(false);
    expect(isListingGridPath('/marketplace/inbox/')).toBe(false);
    expect(isListingGridPath('/groups/')).toBe(false);
  });
});

describe('buildSearchUrl', () => {
  it('pushes server-side filters into the URL', () => {
    const url = buildSearchUrl(
      ' road bike ',
      { ...DEFAULT_FILTERS, minPrice: 100, maxPrice: 900, postedWithinDays: 3, conditions: ['new', 'used_like_new'] },
      '/marketplace/denver/',
    );
    const [path, query] = url.split('?');
    expect(path).toBe('/marketplace/denver/search/');
    expect(Object.fromEntries(new URLSearchParams(query))).toEqual({
      query: 'road bike',
      minPrice: '100',
      maxPrice: '900',
      daysSinceListed: '7',
      itemCondition: 'new,used_like_new',
      sortBy: 'creation_time_descend',
      exact: 'false',
    });
  });

  it('maps posted-within to the nearest value Facebook supports', () => {
    expect([1, 2, 7, 14, 30, 60, null].map(fbDaysSinceListed)).toEqual([1, 7, 7, 30, 30, null, null]);
  });
});
