import { describe, expect, it } from 'vitest';
import { extractListings, mergeListing, parseCardText, parseGraphqlBody, parseItemPage } from './extract';
import type { Listing } from './types';

// Shape modelled on Marketplace search results; only the fields we read.
const searchNode = {
  node: {
    listing: {
      __typename: 'GroupCommerceProductItem',
      id: '1234567890',
      marketplace_listing_title: 'Trek Domane AL 2',
      listing_price: { formatted_amount: '$450', amount: '450.00', currency: 'USD' },
      location: { reverse_geocode: { city: 'Lakewood', state: 'CO' } },
      is_sold: false,
      is_pending: true,
      marketplace_listing_seller: { __typename: 'User', id: '555', name: 'Pat' },
      creation_time: 1760000000,
    },
  },
};

describe('parseGraphqlBody', () => {
  it('splits multi-document responses and strips the anti-hijacking prefix', () => {
    const body = `for (;;);{"data":{"a":1}}\n{"label":"x","data":{"b":2}}\nnot json`;
    expect(parseGraphqlBody(body)).toHaveLength(2);
  });
});

describe('extractListings', () => {
  it('finds listing nodes anywhere in a payload', () => {
    const found: Listing[] = [];
    extractListings({ data: { marketplace_search: { feed_units: { edges: [searchNode] } } } }, (l) => found.push(l));
    expect(found).toEqual([
      expect.objectContaining({
        id: '1234567890',
        title: 'Trek Domane AL 2',
        price: 450,
        currency: 'USD',
        city: 'Lakewood',
        state: 'CO',
        isPending: true,
        sellerId: '555',
        createdAt: 1760000000 * 1000,
      }),
    ]);
  });

  it('reads condition attributes, coordinates and free prices', () => {
    const found: Listing[] = [];
    extractListings(
      {
        id: '42',
        marketplace_listing_title: 'Couch',
        listing_price: { formatted_amount: 'Free' },
        attribute_data: [{ attribute_name: 'Condition', value: 'Used - Like New' }],
        location: { latitude: 39.7, longitude: -105.1 },
        redacted_description: { text: 'Pet free home' },
      },
      (l) => found.push(l),
    );
    expect(found[0]).toMatchObject({
      price: 0,
      condition: 'used_like_new',
      coords: { lat: 39.7, lng: -105.1 },
      description: 'Pet free home',
    });
  });
});

describe('seller join time', () => {
  it('reads the join year from the seller object on item pages', () => {
    const found: Listing[] = [];
    extractListings(
      { id: '7', marketplace_listing_title: 'Bike', marketplace_listing_seller: { id: 'pfbid0x', join_time: 1593144780 } },
      (l) => found.push(l),
    );
    expect(found[0]).toMatchObject({ sellerId: 'pfbid0x', sellerJoinYear: 2020 });
  });
});

describe('mergeListing', () => {
  it('keeps known fields when an update leaves them undefined', () => {
    const merged = mergeListing({ id: '1', title: 'A', price: 5 }, { id: '1', title: undefined, city: 'X' });
    expect(merged).toEqual({ id: '1', title: 'A', price: 5, city: 'X' });
  });
});

describe('parseItemPage', () => {
  it('pulls the matching listing and seller join year from server-rendered JSON', () => {
    const html = `
      <script type="application/json" data-sjs>${JSON.stringify({ require: [[{ __bbox: { result: { data: searchNode } } }]] })}</script>
      <script type="application/json">{"other":"marketplace","x":{"id":"999","marketplace_listing_title":"Other"}}</script>
      <span>Joined Facebook in <!-- -->2011</span>`;
    const { listing, joinYear } = parseItemPage(html, '1234567890');
    expect(listing?.title).toBe('Trek Domane AL 2');
    expect(joinYear).toBe(2011);
  });
});

describe('parseCardText', () => {
  it('reads price, title and city from card text', () => {
    expect(parseCardText('$1,200\n$1,500\n2015 Honda Civic\nAurora, CO\n120K miles')).toEqual({
      price: 1200,
      title: '2015 Honda Civic',
      city: 'Aurora',
      state: 'CO',
    });
  });
});
