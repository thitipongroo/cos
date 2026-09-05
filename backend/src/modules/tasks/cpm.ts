// Critical Path Method — the pure computation, with no database and no NestJS in it (ADR-097).
//
// Kept a separate module for one reason: every branch here is reachable from a plain function call,
// so QM-1's 100% line-and-branch bar is met by a unit test with literal arrays instead of a fixture
// database. The repository hands it rows; it hands back a schedule.
//
// WHAT IT COMPUTES. The standard precedence-diagram forward/backward pass:
//   forward   earliest start (ES) and earliest finish (EF) for every task
//   backward  latest start (LS) and latest finish (LF)
//   float     LS − ES, and a task is on the critical path when that is zero
//
// DAYS ARE CALENDAR DAYS, NOT WORKING DAYS, and that is a limitation rather than a simplification.
// A working-day CPM needs a calendar per project — weekends, Thai public holidays, a site's own
// shutdown — and this platform has no such table. `projects.tasks` carries planned_start and
// planned_end as bare DATEs and nothing anywhere marks a non-working day. Introducing a calendar is
// a schema decision, not something to infer here, so the pass counts every day and the API says so.
//
// DURATION IS INCLUSIVE. planned_start = planned_end is a one-day task, so
// duration = (planned_end − planned_start) + 1. Offsets are then continuous:
// EF = ES + duration, and an FS successor with zero lag starts the day after its predecessor ends.
//
// A TASK WITHOUT BOTH PLANNED DATES IS NOT SCHEDULABLE and is excluded from the network rather than
// given an invented duration. The result reports how many were dropped — a critical path computed
// over half a project, presented as if it covered all of it, is worse than one that admits the gap.

/** The four precedence-diagram relationships (`projects.task_dependencies.dependency_type`). */
export type DependencyType = 'FS' | 'SS' | 'FF' | 'SF';

/** One task as the network sees it. `plannedStart`/`plannedEnd` are UTC-midnight dates. */
export interface CpmTaskInput {
  taskId: string;
  plannedStart: Date | null;
  plannedEnd: Date | null;
}

/** One edge. `lagDays` is signed — a negative value is a lead. */
export interface CpmEdgeInput {
  predecessorTaskId: string;
  successorTaskId: string;
  dependencyType: DependencyType;
  lagDays: number;
}

/** The schedule computed for one task. Offsets are whole days from the network's own start. */
export interface CpmTaskSchedule {
  taskId: string;
  durationDays: number;
  earliestStartOffset: number;
  earliestFinishOffset: number;
  latestStartOffset: number;
  latestFinishOffset: number;
  totalFloatDays: number;
  isCritical: boolean;
}

export interface CpmResult {
  /** Every schedulable task, ordered by earliest start then task id (a stable order for the UI). */
  tasks: CpmTaskSchedule[];
  /** The zero-float tasks, in the same order. */
  criticalTaskIds: string[];
  /** Whole-day span from the earliest earliest-start to the latest earliest-finish. */
  durationDays: number;
  /** Tasks dropped for want of both planned dates. */
  excludedTaskCount: number;
}

/** Raised when the edges contain a cycle. A cyclic network has no critical path at all. */
export class CpmCycleError extends Error {
  constructor(readonly taskIds: string[]) {
    super(`Dependency cycle detected among tasks: ${taskIds.join(', ')}`);
    this.name = 'CpmCycleError';
  }
}

const MS_PER_DAY = 86_400_000;

/** Whole days from `from` to `to`. Both come from Postgres DATE columns, so both are UTC midnight. */
function dayDiff(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
}

/**
 * Whether adding `predecessor → successor` would close a cycle.
 *
 * It would exactly when the predecessor is already reachable from the successor, so this walks
 * forward from the successor and looks for the predecessor. Separate from `computeCriticalPath`
 * on purpose: the write path must reject the edge BEFORE it is stored, and reporting a cycle at
 * read time would mean the bad edge is already in the table (ADR-097, COS-TASK-003).
 */
export function wouldCreateCycle(
  edges: readonly CpmEdgeInput[],
  predecessorTaskId: string,
  successorTaskId: string,
): boolean {
  if (predecessorTaskId === successorTaskId) return true;

  const successors = new Map<string, string[]>();
  for (const e of edges) {
    const list = successors.get(e.predecessorTaskId);
    if (list) list.push(e.successorTaskId);
    else successors.set(e.predecessorTaskId, [e.successorTaskId]);
  }

  const seen = new Set<string>();
  const stack = [successorTaskId];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node === predecessorTaskId) return true;
    if (seen.has(node)) continue;
    seen.add(node);
    for (const next of successors.get(node) ?? []) stack.push(next);
  }
  return false;
}

/**
 * The forward and backward pass.
 *
 * @throws {CpmCycleError} when the edges among schedulable tasks contain a cycle. The write path
 *   (`wouldCreateCycle`) is what normally prevents this; the check is repeated here because rows can
 *   also arrive from a seed script or a direct SQL insert, and silently returning a partial schedule
 *   for a cyclic network would be the worse failure.
 */
export function computeCriticalPath(
  tasks: readonly CpmTaskInput[],
  edges: readonly CpmEdgeInput[],
): CpmResult {
  // ── Schedulable subset ─────────────────────────────────────────────────────
  const scheduled = tasks.filter(
    (t): t is CpmTaskInput & { plannedStart: Date; plannedEnd: Date } =>
      t.plannedStart !== null && t.plannedEnd !== null,
  );
  const excludedTaskCount = tasks.length - scheduled.length;
  if (scheduled.length === 0) {
    return { tasks: [], criticalTaskIds: [], durationDays: 0, excludedTaskCount };
  }

  // Day 0 of the network is the earliest planned start in the schedulable subset. Every offset below
  // is relative to it, so the caller can turn an offset back into a date with one addition.
  let origin = scheduled[0]!.plannedStart;
  for (const t of scheduled) if (t.plannedStart < origin) origin = t.plannedStart;

  // Own planned start as a day offset, kept beside the duration so the forward pass does not scan
  // the task list once per task.
  const ownStart = new Map<string, number>();
  for (const t of scheduled) ownStart.set(t.taskId, dayDiff(origin, t.plannedStart));

  const duration = new Map<string, number>();
  for (const t of scheduled) {
    // Inclusive, and floored at 1: planned_end before planned_start is bad data, not a zero-day
    // task, and letting it produce a negative duration would corrupt every downstream figure.
    duration.set(t.taskId, Math.max(1, dayDiff(t.plannedStart, t.plannedEnd) + 1));
  }

  // Edges touching a task that is not schedulable cannot constrain anything, so they are dropped
  // rather than treated as a constraint against a task with no duration.
  const live = edges.filter(
    (e) => duration.has(e.predecessorTaskId) && duration.has(e.successorTaskId),
  );

  const successors = new Map<string, CpmEdgeInput[]>();
  const predecessors = new Map<string, CpmEdgeInput[]>();
  for (const id of duration.keys()) {
    successors.set(id, []);
    predecessors.set(id, []);
  }
  for (const e of live) {
    successors.get(e.predecessorTaskId)!.push(e);
    predecessors.get(e.successorTaskId)!.push(e);
  }

  // ── Topological order (Kahn) — also the cycle check ────────────────────────
  const indegree = new Map<string, number>();
  for (const id of duration.keys()) indegree.set(id, predecessors.get(id)!.length);
  const queue = [...duration.keys()].filter((id) => indegree.get(id) === 0);
  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const e of successors.get(id)!) {
      const left = indegree.get(e.successorTaskId)! - 1;
      indegree.set(e.successorTaskId, left);
      if (left === 0) queue.push(e.successorTaskId);
    }
  }
  if (order.length !== duration.size) {
    throw new CpmCycleError([...duration.keys()].filter((id) => indegree.get(id)! > 0));
  }

  // ── Forward pass ──────────────────────────────────────────────────────────
  // A task with no predecessor starts where its own planned_start says, so a network of unconnected
  // tasks reproduces the plan rather than collapsing every task onto day 0.
  const es = new Map<string, number>();
  const ef = new Map<string, number>();
  for (const id of order) {
    const dur = duration.get(id)!;
    let start = predecessors.get(id)!.length === 0 ? ownStart.get(id)! : Number.NEGATIVE_INFINITY;
    for (const e of predecessors.get(id)!) {
      const pes = es.get(e.predecessorTaskId)!;
      const pef = ef.get(e.predecessorTaskId)!;
      const candidate =
        e.dependencyType === 'FS'
          ? pef + e.lagDays
          : e.dependencyType === 'SS'
            ? pes + e.lagDays
            : e.dependencyType === 'FF'
              ? pef + e.lagDays - dur
              : pes + e.lagDays - dur; // SF
      if (candidate > start) start = candidate;
    }
    es.set(id, start);
    ef.set(id, start + dur);
  }

  const projectFinish = Math.max(...order.map((id) => ef.get(id)!));

  // ── Backward pass ─────────────────────────────────────────────────────────
  const ls = new Map<string, number>();
  const lf = new Map<string, number>();
  for (const id of [...order].reverse()) {
    const dur = duration.get(id)!;
    let finish = successors.get(id)!.length === 0 ? projectFinish : Number.POSITIVE_INFINITY;
    for (const e of successors.get(id)!) {
      const sls = ls.get(e.successorTaskId)!;
      const slf = lf.get(e.successorTaskId)!;
      const candidate =
        e.dependencyType === 'FS'
          ? sls - e.lagDays
          : e.dependencyType === 'SS'
            ? sls - e.lagDays + dur
            : e.dependencyType === 'FF'
              ? slf - e.lagDays
              : slf - e.lagDays + dur; // SF
      if (candidate < finish) finish = candidate;
    }
    lf.set(id, finish);
    ls.set(id, finish - dur);
  }

  // ── Assemble ──────────────────────────────────────────────────────────────
  const result: CpmTaskSchedule[] = order.map((id) => {
    const float = ls.get(id)! - es.get(id)!;
    return {
      taskId: id,
      durationDays: duration.get(id)!,
      earliestStartOffset: es.get(id)!,
      earliestFinishOffset: ef.get(id)!,
      latestStartOffset: ls.get(id)!,
      latestFinishOffset: lf.get(id)!,
      totalFloatDays: float,
      isCritical: float === 0,
    };
  });
  result.sort(
    (a, b) => a.earliestStartOffset - b.earliestStartOffset || a.taskId.localeCompare(b.taskId),
  );

  const earliestStart = Math.min(...result.map((t) => t.earliestStartOffset));
  return {
    tasks: result,
    criticalTaskIds: result.filter((t) => t.isCritical).map((t) => t.taskId),
    durationDays: projectFinish - earliestStart,
    excludedTaskCount,
  };
}

/** Turn a day offset from `computeCriticalPath` back into a calendar date. */
export function offsetToDate(origin: Date, offset: number): Date {
  return new Date(origin.getTime() + offset * MS_PER_DAY);
}
