// The Site Worker Home's "Shift Hours" tile (mockup 05_site_worker/01_home/01_dashboard).
//
// Pure, and in `src/lib/` rather than in the screen, for the reason `roleTabs.ts` and
// `landingRoute.ts` are: importing a screen drags in expo-router, which is ESM and dies under this
// CommonJS jest setup. It is also what puts this inside the 100%-coverage scope (jest.config.ts
// `collectCoverageFrom`), where a screen is not.
//
// The figure is elapsed time since TODAY'S check-in — real data from `local_attendance`, which the
// same screen's CHECK IN button writes. Nothing here is a forecast or an estimate.

/**
 * A standard shift, in hours, used ONLY to scale the tile's progress bar.
 *
 * Mirrors `DEFAULT_SHIFT_HOURS` in backend `site-ops.service.ts`, which is what the server assumes
 * when a daily report gives a headcount but no hours. Duplicated rather than imported because the
 * mobile app is outside the pnpm workspace (its own lockfile, hoisted node_linker) and does not
 * resolve `@cos/*`; if the server's assumption ever changes, both must move together.
 *
 * It scales the BAR ONLY. The number beside it is always the true elapsed time — a worker eight
 * hours into a ten-hour shift sees a full bar and "08:00", not a rounded-down eight.
 */
export const STANDARD_SHIFT_HOURS = 8;

export interface ShiftAttendance {
  /** ISO 8601, or null when the row has no check-in recorded. */
  checkInAt?: string | null;
  checkOutAt?: string | null;
}

export interface ShiftProgress {
  /** `HH:MM` since check-in, or null when the worker has not checked in today. */
  elapsed: string | null;
  /** 0..1 for the progress bar; 0 when there is no open shift. */
  fraction: number;
}

/**
 * Today's open shift → the tile's value and bar.
 *
 * Only an OPEN shift counts: a row with `check_out_at` set is a finished day, and showing its length
 * as "hours so far" would tell a worker who went home at noon that they are still five hours in.
 * Rows from previous days are ignored for the same reason — `now` is compared against the check-in's
 * own calendar day, not a rolling 24 hours, so a night shift that began yesterday reads as no open
 * shift rather than as 19 hours worked.
 *
 * Returns `{ elapsed: null, fraction: 0 }` when there is nothing to show, which the tile renders as
 * a dash. A zero would claim the worker checked in and has done no time.
 */
export function shiftProgress(rows: ShiftAttendance[], now: Date): ShiftProgress {
  const open = rows.filter(
    (r) => r.checkInAt && !r.checkOutAt && isSameDay(new Date(r.checkInAt), now),
  );
  if (open.length === 0) return { elapsed: null, fraction: 0 };

  // Earliest check-in of the day: a worker who checked in, was pushed back out by a sync conflict
  // and checked in again has two open rows, and the shift began at the first of them.
  const startedAt = Math.min(...open.map((r) => new Date(r.checkInAt as string).getTime()));
  const ms = now.getTime() - startedAt;
  // A clock skew between device and server can put the check-in slightly in the future; clamp rather
  // than render a negative shift.
  const hours = Math.max(0, ms / 3_600_000);

  return {
    elapsed: formatElapsed(hours),
    fraction: Math.min(1, hours / STANDARD_SHIFT_HOURS),
  };
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Hours → `HH:MM`. Not `formatDate`: this is a DURATION, not a time of day, so no locale calendar. */
function formatElapsed(hours: number): string {
  const whole = Math.floor(hours);
  const minutes = Math.floor((hours - whole) * 60);
  return `${String(whole).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
