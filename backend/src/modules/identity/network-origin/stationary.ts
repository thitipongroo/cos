// The "Behavioral Context" rule (ADR-080) — pure, so the subject's label is checkable.
//
// The product owner's definition, 2026-08-04, verbatim from ADR-080:
//
//   > A worker is Stationary when every workforce_telemetry.attendance_logs coordinate for that
//   > worker in the last 7 days lies within 100 m of their centroid, and there are >= 3 such points.
//   > Fewer than 3 points renders "Insufficient data" — never "Stationary".
//
// WHY THIS FILE HAS NO I/O. Deriving a behavioural label about a person is profiling, and a label a
// subject cannot check is one they cannot contest. Keeping the rule a pure function means the exact
// thresholds are readable, testable, and quotable back to them — the difference between "Stationary
// Worker" as an assertion and as a statement with a stated derivation.
//
// THE >= 3 FLOOR IS NOT A ROUNDING DETAIL. One check-in is trivially "within 100 m of itself", so
// without the floor a single attendance record would produce a confident "Stationary" label about
// someone the platform has seen exactly once.

/** One attendance coordinate. Records with a NULL lat/lng are filtered out before they reach here. */
export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export type BehavioralContext =
  /** Every point in the window is within the radius of the centroid. */
  | 'STATIONARY'
  /** Points exist and are spread wider than the radius. */
  | 'MOBILE'
  /** Fewer than the minimum number of points — the honest answer, not a guess. */
  | 'INSUFFICIENT_DATA';

export interface StationaryVerdict {
  context: BehavioralContext;
  /** How many points the window actually held, so the screen can say "based on N check-ins". */
  pointCount: number;
  /** The furthest any point sat from the centroid, in metres. Null when there were too few points. */
  maxDistanceMetres: number | null;
}

/** ADR-080's window and thresholds, named rather than inlined so the screen can quote them. */
export const STATIONARY_WINDOW_DAYS = 7;
export const STATIONARY_RADIUS_METRES = 100;
export const STATIONARY_MIN_POINTS = 3;

const EARTH_RADIUS_METRES = 6_371_008.8; // IUGG mean radius
const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * Great-circle distance between two points, in metres (haversine).
 *
 * Haversine rather than a flat-earth approximation: the formula is the same handful of operations,
 * and a planar shortcut would need a justification about latitude that this does not.
 */
export function distanceMetres(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Arithmetic mean of the coordinates.
 *
 * A plain mean, not a spherical centroid. At the scale this rule cares about — points that are
 * either within 100 m of each other or obviously not — the two agree to well under a metre, and the
 * spherical version would add trigonometry whose behaviour near the poles and the antimeridian
 * nobody would ever exercise. If this rule ever grows to span continents, that reasoning stops
 * holding and the centroid has to change with it.
 */
export function centroid(points: GeoPoint[]): GeoPoint {
  const sum = points.reduce(
    (acc, p) => ({ latitude: acc.latitude + p.latitude, longitude: acc.longitude + p.longitude }),
    { latitude: 0, longitude: 0 },
  );
  return { latitude: sum.latitude / points.length, longitude: sum.longitude / points.length };
}

/**
 * Apply ADR-080's rule.
 *
 * The caller is responsible for the 7-day window — it is a SQL predicate, not arithmetic, and doing
 * it here would mean loading a worker's whole coordinate history to throw most of it away.
 */
export function classify(points: GeoPoint[]): StationaryVerdict {
  if (points.length < STATIONARY_MIN_POINTS) {
    return { context: 'INSUFFICIENT_DATA', pointCount: points.length, maxDistanceMetres: null };
  }

  const centre = centroid(points);
  const maxDistance = points.reduce((max, p) => Math.max(max, distanceMetres(centre, p)), 0);

  return {
    // Inclusive at exactly the radius: a worker sitting precisely on the boundary is at one site,
    // and a rule that flipped on the last centimetre would be arbitrary in the direction that
    // labels more people MOBILE than the definition intends.
    context: maxDistance <= STATIONARY_RADIUS_METRES ? 'STATIONARY' : 'MOBILE',
    pointCount: points.length,
    maxDistanceMetres: Math.round(maxDistance),
  };
}
