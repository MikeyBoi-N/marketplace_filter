import type { LatLng } from './types';

const EARTH_RADIUS_MI = 3958.8;
const toRad = (d: number) => (d * Math.PI) / 180;

export function distanceMiles(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.sqrt(h));
}

/** Ray casting on lat/lng treated as planar; accurate enough at city/region scale. */
export function pointInPolygon(p: LatLng, polygon: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if (a.lat > p.lat !== b.lat > p.lat && p.lng < ((b.lng - a.lng) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lng) {
      inside = !inside;
    }
  }
  return inside;
}

/** Approximate polygon area in square miles (equirectangular projection around the polygon's mean latitude). */
export function polygonAreaSqMi(polygon: LatLng[]): number {
  if (polygon.length < 3) return 0;
  const meanLat = polygon.reduce((s, p) => s + p.lat, 0) / polygon.length;
  const milesPerDegLat = (Math.PI * EARTH_RADIUS_MI) / 180;
  const milesPerDegLng = milesPerDegLat * Math.cos(toRad(meanLat));
  let twiceArea = 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    twiceArea += b.lng * milesPerDegLng * a.lat * milesPerDegLat;
    twiceArea -= a.lng * milesPerDegLng * b.lat * milesPerDegLat;
  }
  return Math.abs(twiceArea) / 2;
}

/** A circle (bounding-box center + farthest vertex) that covers the polygon. */
export function coveringCircle(polygon: LatLng[]): { center: LatLng; radiusMiles: number } | null {
  if (!polygon.length) return null;
  const lats = polygon.map((p) => p.lat);
  const lngs = polygon.map((p) => p.lng);
  const center = {
    lat: (Math.min(...lats) + Math.max(...lats)) / 2,
    lng: (Math.min(...lngs) + Math.max(...lngs)) / 2,
  };
  return { center, radiusMiles: Math.max(...polygon.map((p) => distanceMiles(center, p))) };
}

/** Points on a circle of the given radius, for drawing it as a polygon. */
export function circlePolygon(center: LatLng, radiusMiles: number, steps = 64): LatLng[] {
  const angular = radiusMiles / EARTH_RADIUS_MI;
  const lat1 = toRad(center.lat);
  const lng1 = toRad(center.lng);
  return Array.from({ length: steps }, (_, i) => {
    const bearing = (2 * Math.PI * i) / steps;
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing));
    const lng2 =
      lng1 + Math.atan2(Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1), Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2));
    return { lat: (lat2 * 180) / Math.PI, lng: (lng2 * 180) / Math.PI };
  });
}
