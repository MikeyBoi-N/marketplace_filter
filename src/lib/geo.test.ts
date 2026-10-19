import { describe, expect, it } from 'vitest';
import { circlePolygon, coveringCircle, distanceMiles, pointInPolygon, polygonAreaSqMi } from './geo';

const denver = { lat: 39.7392, lng: -104.9903 };
const boulder = { lat: 40.015, lng: -105.2705 };

describe('geo', () => {
  it('measures distance in miles', () => {
    expect(distanceMiles(denver, boulder)).toBeCloseTo(24.3, 0);
  });

  it('tests points against concave polygons', () => {
    // U shape: the notch between the arms is outside.
    const u = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 3 },
      { lat: 3, lng: 3 },
      { lat: 3, lng: 2 },
      { lat: 1, lng: 2 },
      { lat: 1, lng: 1 },
      { lat: 3, lng: 1 },
      { lat: 3, lng: 0 },
    ];
    expect(pointInPolygon({ lat: 2, lng: 0.5 }, u)).toBe(true);
    expect(pointInPolygon({ lat: 2, lng: 1.5 }, u)).toBe(false);
  });

  it('approximates area and a covering circle', () => {
    // ~1 degree square at the equator is ~69 x 69 miles.
    const square = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 1 },
      { lat: 1, lng: 1 },
      { lat: 1, lng: 0 },
    ];
    expect(polygonAreaSqMi(square)).toBeCloseTo(4774, -2);
    const circle = coveringCircle(square)!;
    expect(circle.center).toEqual({ lat: 0.5, lng: 0.5 });
    expect(square.every((p) => distanceMiles(circle.center, p) <= circle.radiusMiles + 1e-9)).toBe(true);
  });
});

describe('circlePolygon', () => {
  it('puts every point at the requested distance', () => {
    const ring = circlePolygon(denver, 25);
    expect(ring).toHaveLength(64);
    expect(ring.every((p) => Math.abs(distanceMiles(denver, p) - 25) < 0.01)).toBe(true);
  });
});
