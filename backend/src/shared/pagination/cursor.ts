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

/** Options every keyset-paginated `list()` accepts: an opaque cursor and a page size. */
export interface CursorListOptions {
  cursor?: string;
  limit: number;
}

/**
 * Trim a keyset page and derive its next cursor.
 *
 * Repositories fetch `limit + 1` rows (a probe row that answers "is there a next page?"). This drops
 * that probe, and — when there is more — encodes the last kept row's (id, created_at) as the next
 * cursor. Only the row's id field differs between repositories, so it is supplied via `getId`; the
 * sort key is always `created_at`. Behaviour matches the copy every `modules/project/*` repository
 * carried before this was extracted (ADR-021 follow-up): an empty page (e.g. `limit === 0`) yields a
 * null cursor rather than encoding an undefined row.
 */
export function paginate<T>(
  rows: T[],
  limit: number,
  getId: (row: T) => string,
  getCreatedAt: (row: T) => Date,
): { items: T[]; nextCursor: string | null } {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  const nextCursor = hasMore && last ? encodeCursor(getId(last), getCreatedAt(last)) : null;
  return { items, nextCursor };
}
