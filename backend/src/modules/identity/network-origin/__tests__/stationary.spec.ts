// The Behavioral Context rule (ADR-080).
//
// This is PROFILING — a label the platform attaches to a person — so these tests pin the exact
// thresholds the product owner set, in a form the subject could be shown:
//
//   STATIONARY  every attendance coordinate in the last 7 days within 100 m of the centroid, >= 3 points
//   MOBILE      >= 3 points, spread wider than 100 m
//   INSUFFICIENT_DATA  fewer than 3 points — never "Stationary"
//
// The >= 3 floor is the one that stops the rule flattering itself: a single check-in is trivially
// within 100 m of itself, so without the floor one attendance record would produce a confident
// "Stationary Worker" label about someone seen exactly once.

import {
  centroid,
  classify,
  distanceMetres,
  STATIONARY_MIN_POINTS,
  STATIONARY_RADIUS_METRES,
  STATIONARY_WINDOW_DAYS,
  type GeoPoint,
} from '../stationary';

/** Bangkok — a real latitude, so the longitude-scaling in the distance maths is genuinely exercised. */
const BASE: GeoPoint = { latitude: 13.7563, longitude: 100.5018 };

/** Offset a point by metres north/east. Uses the local metres-per-degree at BASE's latitude. */
function offset(from: GeoPoint, northMetres: number, eastMetres: number): GeoPoint {
  const latDegreePerMetre = 1 / 111_320;
  const lonDegreePerMetre = 1 / (111_320 * Math.cos((from.latitude * Math.PI) / 180));
  return {
    latitude: from.latitude + northMetres * latDegreePerMetre,
    longitude: from.longitude + eastMetres * lonDegreePerMetre,
  };
}

describe('the published thresholds', () => {
  it('are ADR-080’s, exactly', () => {
    // Named constants, asserted, because the screen quotes them back to the subject. A silent drift
    // here would make the on-screen explanation a lie about how the label was derived.
    expect(STATIONARY_WINDOW_DAYS).toBe(7);
    expect(STATIONARY_RADIUS_METRES).toBe(100);
    expect(STATIONARY_MIN_POINTS).toBe(3);
  });
});

describe('distanceMetres', () => {
  it('is zero for a point against itself', () => {
    expect(distanceMetres(BASE, BASE)).toBe(0);
  });

  it('measures a known northward offset to within a metre', () => {
    expect(distanceMetres(BASE, offset(BASE, 100, 0))).toBeCloseTo(100, 0);
  });

  it('measures an eastward offset correctly at this latitude', () => {
    // The case a flat-earth shortcut gets wrong: a degree of longitude is shorter away from the
    // equator, and Bangkok is far enough north for that to matter over 100 m.
    expect(distanceMetres(BASE, offset(BASE, 0, 100))).toBeCloseTo(100, 0);
  });

  it('is symmetric', () => {
    const a = BASE;
    const b = offset(BASE, 250, -80);
    expect(distanceMetres(a, b)).toBeCloseTo(distanceMetres(b, a), 6);
  });

  it('handles antipodal-ish points without NaN', () => {
    // The `Math.min(1, …)` guard: floating-point error can push the argument of asin past 1, which
    // would return NaN and quietly classify someone as STATIONARY (NaN <= 100 is false → MOBILE,
    // but NaN in the max would poison the whole reduction).
    const d = distanceMetres({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 180 });
    expect(Number.isFinite(d)).toBe(true);
    expect(d).toBeGreaterThan(19_000_000);
  });
});

describe('centroid', () => {
  it('is the arithmetic mean', () => {
    const c = centroid([
      { latitude: 0, longitude: 0 },
      { latitude: 2, longitude: 4 },
    ]);
    expect(c).toEqual({ latitude: 1, longitude: 2 });
  });

  it('returns the point itself for a single point', () => {
    expect(centroid([BASE])).toEqual(BASE);
  });
});

describe('classify', () => {
  it('is INSUFFICIENT_DATA below the floor — never STATIONARY', () => {
    // The whole reason the floor exists. Both of these are trivially "within 100 m of the centroid".
    expect(classify([]).context).toBe('INSUFFICIENT_DATA');
    expect(classify([BASE]).context).toBe('INSUFFICIENT_DATA');
    expect(classify([BASE, offset(BASE, 1, 1)]).context).toBe('INSUFFICIENT_DATA');
  });

  it('reports no distance when there were too few points', () => {
    // A number here would imply a measurement was made and found acceptable.
    expect(classify([BASE, BASE]).maxDistanceMetres).toBeNull();
  });

  it('still reports the point count below the floor, so the screen can say why', () => {
    // "Insufficient data" is more useful as "based on 2 check-ins; 3 are needed".
    expect(classify([BASE, BASE]).pointCount).toBe(2);
  });

  it('is STATIONARY for three points on one site', () => {
    const verdict = classify([BASE, offset(BASE, 20, 10), offset(BASE, -15, 25)]);
    expect(verdict.context).toBe('STATIONARY');
    expect(verdict.pointCount).toBe(3);
    expect(verdict.maxDistanceMetres).toBeLessThanOrEqual(STATIONARY_RADIUS_METRES);
  });

  it('is MOBILE when one point sits outside the radius', () => {
    // Two sites, not one. The centroid lands between them and both ends fall outside.
    const verdict = classify([BASE, offset(BASE, 10, 0), offset(BASE, 5_000, 0)]);
    expect(verdict.context).toBe('MOBILE');
    expect(verdict.maxDistanceMetres).toBeGreaterThan(STATIONARY_RADIUS_METRES);
  });

  it('treats GPS jitter as one site, not as movement', () => {
    // 100 m is deliberately wider than consumer-GPS error. A rule tighter than the error would label
    // a worker who never left the hut as MOBILE.
    const jitter = [BASE, offset(BASE, 8, -6), offset(BASE, -11, 4), offset(BASE, 3, 12)];
    expect(classify(jitter).context).toBe('STATIONARY');
  });

  it('is inclusive at exactly the radius', () => {
    // Boundary behaviour is a decision, not an accident: flipping on the last centimetre would label
    // more people MOBILE than the definition intends. Points on opposite sides of the centroid at
    // ~99 m each keep the max just inside.
    const verdict = classify([offset(BASE, -99, 0), BASE, offset(BASE, 99, 0)]);
    expect(verdict.maxDistanceMetres).toBe(99);
    expect(verdict.context).toBe('STATIONARY');
  });

  it('flips to MOBILE just past the radius', () => {
    const verdict = classify([offset(BASE, -101, 0), BASE, offset(BASE, 101, 0)]);
    expect(verdict.maxDistanceMetres).toBe(101);
    expect(verdict.context).toBe('MOBILE');
  });

  it('measures from the centroid, not from the first point', () => {
    // Two clusters 150 m apart: every point is >75 m from the centroid but within 150 m of the
    // first point. Anchoring on the first point would give a different answer for the same data
    // depending only on row order.
    const far = offset(BASE, 150, 0);
    const verdict = classify([BASE, offset(BASE, 2, 0), far, offset(far, 2, 0)]);
    expect(verdict.context).toBe('STATIONARY');
    expect(verdict.maxDistanceMetres).toBeLessThanOrEqual(STATIONARY_RADIUS_METRES);
  });

  it('gives the same verdict regardless of the order rows came back in', () => {
    const points = [BASE, offset(BASE, 40, 20), offset(BASE, -30, 10), offset(BASE, 5_000, 0)];
    const forward = classify(points);
    const reversed = classify([...points].reverse());
    expect(reversed).toEqual(forward);
  });
});
