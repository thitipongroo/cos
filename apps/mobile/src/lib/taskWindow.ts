// The working window a task card is headed by — "08:00 - 12:00"
// (mockup 05_site_worker/01_home/01_sw_dashboard).
//
// WHY THIS EXISTS AT ALL. The dashboard card used to print the planned DATE RANGE here, because
// that was the only thing `projects.tasks` recorded: planned_start and planned_end are DATE, and I
// raised the window as an escalation on 2026-08-10 for exactly that reason. The product owner asked
// for it directly on 2026-08-11, so migration 20260811000001 added `planned_start_time` and
// `planned_end_time` (TIME, both nullable) and this reads them.
//
// A DATE RANGE IS A DIFFERENT FACT. "Jul 6 → Jul 26" answers "when is this scheduled"; a worker
// standing on site at 09:00 is asking "is this the morning job", and only the window answers that.
// Both are true and only one belongs on a card headed TODAY'S PRIORITY TASKS.
//
// NULL IS NOT A DEFAULT. Nothing recorded what time older tasks were planned for, so a task with no
// window returns null here and the card falls back to its dates. Filling in an 08:00–17:00 working
// day would state a fact about that task that nobody entered.

/**
 * Trim a stored TIME to the "HH:MM" a card shows.
 *
 * TWO SHAPES ARRIVE HERE, and both are the same fact.
 *
 * Postgres renders TIME as "HH:MM:SS". But `/sync/delta` reaches it through Prisma, which maps a
 * bare TIME to a JS Date and therefore serialises it as `"1970-01-01T08:00:00.000Z"` — a wall-clock
 * time pinned to the epoch. That is what the device actually receives (verified against the running
 * database on 2026-08-11, after the first build of this screen silently fell back to showing dates).
 * The delta endpoint is one generic `SELECT *` over every synced table, so casting this one column
 * to text server-side would mean special-casing the query that must not know about columns.
 *
 * IT SLICES THE CHARACTERS AND NEVER BUILDS A DATE. Parsing "1970-01-01T08:00:00.000Z" with `new
 * Date()` and reading local hours turns 08:00 into 15:00 on a Bangkok handset — the device's own
 * timezone, applied to a time that never had one. A site's hours are wall-clock hours at that site,
 * so the digits between the "T" and the seconds are the answer, exactly as written.
 *
 * The seconds are dropped either way: nobody planned a shift to the second. Anything that is not a
 * recognisable time returns null rather than being printed half-parsed — a card showing "0:MM" is
 * worse than one showing its dates.
 */
function hhmm(value: string | null | undefined): string | null {
  if (value == null) return null;
  const text = value.trim();
  const m = /^(?:\d{4}-\d{2}-\d{2}T)?(\d{1,2}):(\d{2})/.exec(text);
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${m[2]}`;
}

/**
 * The window as one string, or null when there is no window to show.
 *
 * BOTH ENDS OR NEITHER. A half-open window ("08:00 - ") reads as a rendering fault, and "from 08:00"
 * is a sentence the drawing does not have. With one end recorded and not the other, the card falls
 * back to the dates, which are complete.
 *
 * An end BEFORE its start is returned as it is, not repaired: night work crossing midnight is real
 * ("22:00 - 06:00"), and there is nothing in the row to distinguish that from a typo. Silently
 * swapping them would rewrite a night shift into a day one.
 */
export function taskWindow(
  startTime: string | null | undefined,
  endTime: string | null | undefined,
): string | null {
  const start = hhmm(startTime);
  const end = hhmm(endTime);
  if (start === null || end === null) return null;
  return `${start} - ${end}`;
}
