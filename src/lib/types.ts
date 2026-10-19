export interface LatLng {
  lat: number;
  lng: number;
}

export type Condition = 'new' | 'used_like_new' | 'used_good' | 'used_fair';

/** Everything we know about one listing, merged from search results, card text and the item page. */
export interface Listing {
  id: string;
  title?: string;
  price?: number;
  currency?: string;
  city?: string;
  state?: string;
  coords?: LatLng;
  /** Epoch milliseconds. */
  createdAt?: number;
  isSold?: boolean;
  isPending?: boolean;
  sellerId?: string;
  sellerName?: string;
  sellerJoinYear?: number;
  condition?: Condition;
  description?: string;
  /** True once the item page has been fetched (successfully or not), so we stop asking for it. */
  detailsFetched?: boolean;
}

export interface Seller {
  id: string;
  joinYear?: number;
  /** True once a lookup has finished, even if the join year could not be found. */
  checked?: boolean;
}

export interface Place {
  center: LatLng;
  /** [[south, west], [north, east]] */
  bounds: [[number, number], [number, number]];
  label: string;
}
