// Keyset-pagination cursor encoding, shared by every repository that pages on (created_at, id).
//
// Extracted 2026-07-21 (ADR-021). Seven repositories under modules/project/ carried their own copy;
// six were byte-identical and project.repository.ts differed only in naming its field `projectId`
// instead of `id`, plus a try/catch that could never fire (see decodeCursor below). Duplicating a
// cursor codec is worse than it looks: encode and decode must agree exactly, and once there are
// seven pairs there is no single place to change the format.

export interface DecodedCursor {
  id: string;
  createdAt: string;
}

/** Encode a keyset position as an opaque base64 cursor. */
export function encodeCursor(id: string, createdAt: Date): string {
  return Buffer.from(`${id}:${createdAt.toISOString()}`).toString('base64');
}

/**
 * Decode a cursor produced by {@link encodeCursor}. Returns null for anything malformed.
 *
 * No try/catch, deliberately. project.repository.ts wrapped this in one carrying
 * `istanbul ignore next` — an admission that the catch was unreachable. It is:
 * `Buffer.from(s, 'base64')` does not throw on invalid input, it discards the characters it cannot
 * decode and returns an empty buffer. Verified against Node with '', '!!!', '====', '%%' and a lone
 * NUL — every one returned '' rather than throwing. The guards below are what actually reject bad
 * input, and they are reachable and tested.
 */
export function decodeCursor(cursor: string): DecodedCursor | null {
  const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
  const colonIdx = decoded.indexOf(':');
  if (colonIdx === -1) return null;
  const id = decoded.slice(0, colonIdx);
  const createdAt = decoded.slice(colonIdx + 1);
  if (!id || !createdAt) return null;
  return { id, createdAt };
}
