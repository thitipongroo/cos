// Selection logic for the Site Engineer Home (components/SiteEngineerHome.tsx).
//
// Kept out of the component so it is testable: apps/mobile has no react-native render harness, and
// every existing suite tests logic directly. These are the parts with real decisions in them —
// which tasks count as "upcoming", how to rank issues, the schedule-verdict colour, and so on.

export interface UpcomingTask {
  task_id: string;
  task_name: string;
  status: string;
  planned_start: string | null;
}

export interface ActiveIssue {
  issue_id: string;
  title: string;
  severity: string;
  status: string;
}

/** A task that survived the `planned_start` filter — narrowed so the sort needs no null fallback. */
type DatedTask = UpcomingTask & { planned_start: string };

function isDated(task: UpcomingTask): task is DatedTask {
  // A task with no planned_start has no place on a list ordered by when work begins.
  return task.planned_start !== null;
}

/** Tasks the engineer has not finished, soonest planned start first. */
export function selectUpcomingTasks(tasks: UpcomingTask[], limit = 5): UpcomingTask[] {
  return (
    tasks
      .filter((task) => task.status !== 'COMPLETED' && task.status !== 'CANCELLED')
      .filter(isDated)
      // ISO-8601 dates sort correctly as strings, so this needs no Date parsing.
      .sort((a, b) => a.planned_start.localeCompare(b.planned_start))
      .slice(0, limit)
  );
}

// ── issue ranking ────────────────────────────────────────────────────────────

// Worst first. Unknown severities rank below LOW rather than throwing — the API enum could grow.
const SEVERITY_RANK: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

function rankOf(severity: string): number {
  return SEVERITY_RANK[severity] ?? 0;
}

/** Issues most severe first (stable within a severity). */
export function sortIssuesBySeverity(issues: ActiveIssue[]): ActiveIssue[] {
  return [...issues].sort((a, b) => rankOf(b.severity) - rankOf(a.severity));
}

/**
 * The count shown beside the "issues waiting" header: the most severe level present and how many are
 * at it (e.g. HIGH×1 → `{ severity: 'HIGH', count: 1 }`). The mockup hard-coded "2 CRITICAL"; this
 * follows the data instead, so a project with no critical issue still surfaces its worst open ones.
 * Null when there are no issues — the header then shows no count.
 */
export function topSeverityCount(
  issues: ActiveIssue[],
): { severity: string; count: number } | null {
  if (issues.length === 0) return null;
  const top = sortIssuesBySeverity(issues)[0]!.severity;
  return { severity: top, count: issues.filter((i) => i.severity === top).length };
}

// ── schedule verdict presentation (§32.12 Display) ───────────────────────────

export type ScheduleColour = 'green' | 'amber' | 'red';

/**
 * Three-band colour for the schedule verdict, from `spi` — finer than the ahead/on_track/behind
 * enum so a gentle slip (amber) and a serious one (red) do not look identical (§32.12 Display):
 *   spi ≥ 0.95 → green · 0.90 ≤ spi < 0.95 → amber · spi < 0.90 → red.
 * Null spi (no schedulable task) → no colour.
 */
export function scheduleColour(spi: number | null | undefined): ScheduleColour | null {
  if (spi === null || spi === undefined) return null;
  if (spi >= 0.95) return 'green';
  if (spi >= 0.9) return 'amber';
  return 'red';
}

/**
 * Whether the progress card can render a figure at all.
 *
 * §32.12 makes every field nullable, where null means "not computable" — a project with no
 * BOQ-linked task must show a placeholder, never a 0% bar, which would read as "no work done".
 */
export function hasProgressFigure(
  percentComplete: number | null | undefined,
): percentComplete is number {
  return typeof percentComplete === 'number';
}

/** Clamp the bar's fill to the track, however the server rounds. */
export function progressBarWidth(percentComplete: number): number {
  return Math.min(100, Math.max(0, percentComplete));
}

// ── upcoming-task urgency (§ mockup: date colouring) ─────────────────────────

export type TaskUrgency = 'overdue' | 'due-soon' | 'normal';

/** Whole days from `now` to `planned_start`, comparing dates only (time of day ignored). */
function daysUntil(plannedStart: string, now: Date): number {
  const start = new Date(plannedStart);
  const startMidnight = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const nowMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((startMidnight - nowMidnight) / 86_400_000);
}

/**
 * Colour band for an upcoming task's start date (product-owner decision 2026-07-16):
 *   start already past → overdue (red) · within 3 days → due-soon (amber) · else normal.
 * Keyed on planned_start — the list is ordered by when work begins, and "overdue" here means the
 * task should already have started.
 */
export function taskStartUrgency(plannedStart: string, now: Date): TaskUrgency {
  const days = daysUntil(plannedStart, now);
  if (days < 0) return 'overdue';
  if (days <= 3) return 'due-soon';
  return 'normal';
}

/**
 * The "งานที่กำลังจะเริ่ม" header badge counts (product-owner decision 2026-07-16): how many
 * upcoming tasks are overdue to start and how many start within three days.
 *
 * Counts the whole upcoming set — same not-finished + dated filter as selectUpcomingTasks — not the
 * five shown, so the badge does not undercount when the list is capped.
 */
export function urgencyCounts(
  tasks: UpcomingTask[],
  now: Date,
): { overdue: number; dueSoon: number } {
  let overdue = 0;
  let dueSoon = 0;
  for (const task of tasks) {
    if (task.status === 'COMPLETED' || task.status === 'CANCELLED') continue;
    if (task.planned_start === null) continue;
    const urgency = taskStartUrgency(task.planned_start, now);
    if (urgency === 'overdue') overdue++;
    else if (urgency === 'due-soon') dueSoon++;
  }
  return { overdue, dueSoon };
}
