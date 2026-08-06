// The short form of a UUID the app shows to people.
//
// Existed five times, byte-identical, in users, user-profile, reset-password and sync-queue. Five
// copies is five chances for one to take a different number of characters, and the same record
// showing as `5DB19BF3` on one screen and `5DB19B` on another is exactly the kind of difference that
// makes someone doubt they are looking at the same thing.

/**
 * `'5db19bf3-4c2a-...'` → `'5DB19BF3'`.
 *
 * A DISPLAY CONVENIENCE, NOT A KEY. Eight hex characters is 32 bits, so it is not guaranteed unique
 * across a large tenant and must never be used to look a record up — every call site passes the full
 * id and renders this beside it or in place of it, and the full id is what travels in requests.
 *
 * Uppercase because these are read aloud and copied by hand in support conversations, where
 * lowercase hex is easy to confuse with letters (`b`/`6`, `d`/`0`).
 */
export function shortId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}
