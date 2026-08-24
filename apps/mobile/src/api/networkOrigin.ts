// Network origin (ADR-080) — what the platform can tell about the caller's own ingress address.
//
// The address itself is NOT a parameter. The server reads it from the request, so this call takes
// nothing: an endpoint that looked up an address the client chose would be a geo-IP service for
// anyone holding a session, rather than a transparency view of one person's own record.
//
// Nothing here is stored. City, region, ISP and the behavioural label are derived when this call is
// made and discarded — which is why the panel adds no retention row and no erasure target.

import { get } from './client';

export interface NetworkOrigin {
  city: string | null;
  region: string | null;
  countryIsoCode: string | null;
  /** The ISP name, from the GeoLite2 ASN database. */
  organisation: string | null;
}

export type StationaryContext = 'STATIONARY' | 'MOBILE' | 'INSUFFICIENT_DATA';

export interface StationaryVerdict {
  context: StationaryContext;
  pointCount: number;
  maxDistanceMetres: number | null;
}

export interface NetworkOriginPanel {
  /** Null when no GeoLite2 database is configured, or the address is not in it. */
  origin: NetworkOrigin | null;
  /**
   * Null means the subject has NOT consented to `operational` processing — "Not enabled".
   *
   * That is a different statement from `INSUFFICIENT_DATA` ("we would, but you have too few
   * check-ins"), and the screen must render them differently: collapsing the two tells someone who
   * declined profiling that the platform merely lacked data.
   */
  behavioral: StationaryVerdict | null;
  /** The rule's own thresholds, so the label can be shown with its derivation. */
  rule: { windowDays: number; radiusMetres: number; minPoints: number };
}

export async function getNetworkOrigin(): Promise<NetworkOriginPanel> {
  return get<NetworkOriginPanel>('/users/me/network-origin');
}
