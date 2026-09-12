// Turn a stored file URL into something <Image /> can actually fetch (ADR-105).
//
// ── WHY THIS EXISTS ───────────────────────────────────────────────────────────────────────────
//
// `platform.users.photo_url` holds a File Service URL, and since 2026-09-13 that is the permanent
// one — `GET /api/v1/files/:fileId/image` — rather than a presigned URL that expires in an hour.
// Permanence was bought by moving the authorisation OUT of the URL and into the request: the route
// takes the same bearer token, the same tenant scope and the same CLEAN gate as every other file
// read, and the File Service has no unauthenticated path at all but its two health probes
// (`plugins/auth.ts` explains at length why there is no gateway behind which one could be safe).
//
// So a plain `<Image source={{ uri: photoUrl }} />` gets a 401 and draws nothing. The token has to
// ride along, and this is the one place that decides when it does.
//
// ── THE RULE: OUR API ONLY ────────────────────────────────────────────────────────────────────
//
// The header is attached ONLY to a URL whose origin is this deployment's own API. Anything else —
// a presigned MinIO URL, a CDN, an avatar service, a seeded placeholder — is fetched plain.
//
// That is a security rule before it is a compatibility one. `Authorization` is a bearer credential:
// attaching it to whatever string happened to be in a database column would send the user's session
// token to any host that column could be made to name.

import { API_BASE_URL } from '../api/client';
import { useAuthStore } from '../store/authStore';

export interface ImageSource {
  uri: string;
  headers?: Record<string, string>;
}

/**
 * The origin (scheme + host + port) of a URL, or null when it is not an absolute URL.
 *
 * Hand-parsed rather than `new URL()`: Hermes ships a partial `URL` and this runs on every avatar
 * render, so a throw here would be a blank face rather than an error anyone sees. A string that is
 * not an absolute http(s) URL has no origin, which is the answer `isOwnApi` wants anyway.
 */
function originOf(url: string): string | null {
  const match = /^(https?:)\/\/([^/?#]+)/i.exec(url.trim());
  return match ? `${match[1]!.toLowerCase()}//${match[2]!.toLowerCase()}` : null;
}

/**
 * Does this URL point at the API this app was built against?
 *
 * Compared by ORIGIN, not by prefix. A prefix test (`url.startsWith(API_BASE_URL)`) would be
 * defeated by a host that merely begins with ours — `https://api.cos.example.com.evil.test/...`
 * starts with `https://api.cos.example.com` — and that is precisely a URL an attacker would want
 * the token sent to.
 */
export function isOwnApi(url: string): boolean {
  const base = originOf(API_BASE_URL);
  return base !== null && originOf(url) === base;
}

/**
 * An `<Image source>` for a stored file URL.
 *
 * Returns `null` for a null/blank URL so a caller can render its own fallback (initials, a glyph)
 * rather than an `<Image>` pointed at nothing.
 *
 * The token is read at CALL time, not captured: a session that refreshes between renders must send
 * the new one, and a signed-out session must send none rather than a stale credential.
 */
export function fileImageSource(url: string | null | undefined): ImageSource | null {
  if (url == null || url.trim() === '') return null;
  if (!isOwnApi(url)) return { uri: url };
  const token = useAuthStore.getState().accessToken;
  // No token: return the bare URL rather than a header of `Bearer null`. The fetch then 401s and
  // the caller's `onError` falls back to initials, which is the same outcome as no photo.
  return token ? { uri: url, headers: { Authorization: `Bearer ${token}` } } : { uri: url };
}
