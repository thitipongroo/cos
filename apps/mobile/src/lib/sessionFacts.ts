// The session and timestamp transparency screens (ADR-084) — mockups 03_05 and 03_06.
//
// EVERY VALUE HERE IS TRACEABLE TO A SPEC LINE. That is the whole reason this file exists rather
// than the numbers sitting inline in two screens. The mockups asserted four things the platform does
// not do — a 3600-second token TTL, AES-256-GCM session encryption, a session id, and Stratum-1 NTP
// discipline — and a transparency screen is the one surface where an unverifiable claim costs the
// most: it discredits the true rows next to it.
//
// If a value below ever stops matching its cited section, this file is where the fix goes, and the
// tests beside it are what notice.

/** Access-token lifetime, minutes. §5.4.1 step 4 — Keycloak issues an RS256 access token (15 min). */
export const ACCESS_TOKEN_MINUTES = 15;

/** Refresh-token lifetime, days. §5.4.1 — rotated natively on use (`refreshTokenMaxReuse: 0`). */
export const REFRESH_TOKEN_DAYS = 7;

/** In transit. §5.2 transport row — NOT AES-256-GCM, which is ADR-035's at-rest issuer-key cipher. */
export const TRANSPORT = 'TLS 1.3';

/** Application logs: §31.2 — 30 days hot in Loki, then a year cold. */
export const LOG_RETENTION_HOT_DAYS = 30;
export const LOG_RETENTION_COLD_YEARS = 1;

/** Audit entries: §31.4 / §9 — seven years, write-once-read-many. */
export const AUDIT_RETENTION_WORM_YEARS = 7;

/**
 * Truncate the JWT id for display.
 *
 * `jti` replaces the mockup's invented `sid_9f8a…2b1c` because it answers the same question — which
 * credential is this? — with a value that already exists in the token the app holds. No new field,
 * no new endpoint, no new stored data.
 *
 * Truncated for the same reason the mockup truncated its invented value: the full token id is a
 * correlation handle, and a transparency screen should not be the place it is first shown in full or
 * screenshotted into a support chat. Short ids are returned unchanged rather than padded — a fake
 * ellipsis would imply hidden characters that are not there.
 */
export function shortTokenId(jti: string | null | undefined, keep = 4): string | null {
  if (!jti) return null;
  if (jti.length <= keep * 2 + 1) return jti;
  return `${jti.slice(0, keep)}…${jti.slice(-keep)}`;
}

/**
 * What the three explanatory cards on 03_05 point at.
 *
 * Unlike the parameters card, these turned out to describe real subsystems (ADR-084): the offline
 * sync queue, the RBAC permission map, and Keycloak's refresh rotation. They are kept and
 * re-anchored rather than rewritten.
 */
export const SESSION_CARDS = ['offlineQueue', 'rolePermissions', 'tokenRotation'] as const;
export type SessionCard = (typeof SESSION_CARDS)[number];

/**
 * The timestamp facts that survive (03_06).
 *
 * `appendOnly` is the strongest of the four and the least impressive-sounding: `app_user` holds no
 * `DELETE` grant on `platform.audit_logs` (§11.4). A reader can go and check that. "Cryptographically
 * hashed timestamps", the claim it replaces, could not be checked and was not true.
 */
export const TIMESTAMP_FACTS = ['utc', 'precision', 'appendOnly', 'retention'] as const;
export type TimestampFact = (typeof TIMESTAMP_FACTS)[number];
