// Unit tests — Critical Path Method (ADR-097)
//
// `cpm.ts` is pure, so the forward pass, the backward pass, all four precedence relationships, lag,
// lead, cycles and the unschedulable-task rule are exercised directly with literal arrays. No
// database, no NestJS, no fixture: every branch in the module is reachable from a function call,
// which is why the computation was separated from the repository in the first place.
//
// Dates are UTC midnight throughout, matching what Postgres returns for a DATE column.

import {
  computeCriticalPath,
  wouldCreateCycle,
  offsetToDate,
  CpmCycleError,
  type CpmEdgeInput,
  type CpmTaskInput,
} from '../cpm';

/** A task from `start` to `end`, both `YYYY-MM-DD`. */
function task(taskId: string, start: string | null, end: string | null): CpmTaskInput {
  return {
    taskId,
    plannedStart: start === null ? null : new Date(`${start}T00:00:00.000Z`),
    plannedEnd: end === null ? null : new Date(`${end}T00:00:00.000Z`),
  };
}

function edge(
  predecessorTaskId: string,
  successorTaskId: string,
  dependencyType: CpmEdgeInput['dependencyType'] = 'FS',
  lagDays = 0,
): CpmEdgeInput {
  return { predecessorTaskId, successorTaskId, dependencyType, lagDays };
}

/** The schedule for one task, by id. */
function byId(result: ReturnType<typeof computeCriticalPath>, taskId: string) {
  const found = result.tasks.find((t) => t.taskId === taskId);
  if (!found) throw new Error(`task ${taskId} not in result`);
  return found;
}

describe('computeCriticalPath — duration', () => {
  it('counts an inclusive day span, so start === end is one day', () => {
    const result = computeCriticalPath([task('a', '2026-09-01', '2026-09-01')], []);
    expect(byId(result, 'a').durationDays).toBe(1);
  });

  it('counts calendar days, weekends included — there is no working calendar', () => {
    // 2026-09-04 is a Friday; 2026-09-07 a Monday. A working-day pass would call this 2 days.
    const result = computeCriticalPath([task('a', '2026-09-04', '2026-09-07')], []);
    expect(byId(result, 'a').durationDays).toBe(4);
  });

  it('floors a reversed date range at one day rather than producing a negative duration', () => {
    const result = computeCriticalPath([task('a', '2026-09-10', '2026-09-01')], []);
    expect(byId(result, 'a').durationDays).toBe(1);
  });
});

describe('computeCriticalPath — forward pass', () => {
  it('starts an unconstrained task at its own planned start, not at day zero', () => {
    const result = computeCriticalPath(
      [task('a', '2026-09-01', '2026-09-02'), task('b', '2026-09-10', '2026-09-11')],
      [],
    );
    expect(byId(result, 'a').earliestStartOffset).toBe(0);
    expect(byId(result, 'b').earliestStartOffset).toBe(9);
  });

  it('FS with no lag starts the successor the day after the predecessor ends', () => {
    const result = computeCriticalPath(
      [task('a', '2026-09-01', '2026-09-03'), task('b', '2026-09-01', '2026-09-02')],
      [edge('a', 'b')],
    );
    // a: ES 0, duration 3, EF 3 → b starts at offset 3, which is 2026-09-04.
    expect(byId(result, 'a').earliestFinishOffset).toBe(3);
    expect(byId(result, 'b').earliestStartOffset).toBe(3);
  });

  it('takes the LATEST predecessor when a task has several', () => {
    const result = computeCriticalPath(
      [
        task('a', '2026-09-01', '2026-09-02'), // EF 2
        task('b', '2026-09-01', '2026-09-05'), // EF 5
        task('c', '2026-09-01', '2026-09-01'),
      ],
      [edge('a', 'c'), edge('b', 'c')],
    );
    expect(byId(result, 'c').earliestStartOffset).toBe(5);
  });

  it('applies a positive lag as a delay and a negative lag as a lead', () => {
    const late = computeCriticalPath(
      [task('a', '2026-09-01', '2026-09-02'), task('b', '2026-09-01', '2026-09-02')],
      [edge('a', 'b', 'FS', 3)],
    );
    expect(byId(late, 'b').earliestStartOffset).toBe(5);

    const lead = computeCriticalPath(
      [task('a', '2026-09-01', '2026-09-04'), task('b', '2026-09-01', '2026-09-02')],
      [edge('a', 'b', 'FS', -2)],
    );
    expect(byId(lead, 'b').earliestStartOffset).toBe(2);
  });

  it('handles SS — the successor starts with the predecessor', () => {
    const result = computeCriticalPath(
      [task('a', '2026-09-01', '2026-09-10'), task('b', '2026-09-01', '2026-09-03')],
      [edge('a', 'b', 'SS', 2)],
    );
    expect(byId(result, 'b').earliestStartOffset).toBe(2);
  });

  it('handles FF — the successor finishes with the predecessor', () => {
    const result = computeCriticalPath(
      [task('a', '2026-09-01', '2026-09-10'), task('b', '2026-09-01', '2026-09-03')],
      [edge('a', 'b', 'FF', 0)],
    );
    // a EF 10; b duration 3 → b must finish at 10, so it starts at 7.
    expect(byId(result, 'b').earliestFinishOffset).toBe(10);
    expect(byId(result, 'b').earliestStartOffset).toBe(7);
  });

  it('handles SF — the successor finishes when the predecessor starts', () => {
    const result = computeCriticalPath(
      [task('a', '2026-09-06', '2026-09-10'), task('b', '2026-09-01', '2026-09-02')],
      [edge('a', 'b', 'SF', 0)],
    );
    // a ES 5; b duration 2 → b finishes at 5, starts at 3.
    expect(byId(result, 'b').earliestFinishOffset).toBe(5);
    expect(byId(result, 'b').earliestStartOffset).toBe(3);
  });
});

describe('computeCriticalPath — backward pass and float', () => {
  it('puts a single chain entirely on the critical path', () => {
    const result = computeCriticalPath(
      [
        task('a', '2026-09-01', '2026-09-02'),
        task('b', '2026-09-01', '2026-09-03'),
        task('c', '2026-09-01', '2026-09-01'),
      ],
      [edge('a', 'b'), edge('b', 'c')],
    );
    expect(result.criticalTaskIds).toEqual(['a', 'b', 'c']);
    expect(result.tasks.every((t) => t.totalFloatDays === 0)).toBe(true);
  });

  it('gives the shorter of two parallel branches the float, and keeps the longer critical', () => {
    //        ┌ short (1d) ┐
    //  start ┤            ├ finish
    //        └ long  (5d) ┘
    const result = computeCriticalPath(
      [
        task('start', '2026-09-01', '2026-09-01'),
        task('short', '2026-09-01', '2026-09-01'),
        task('long', '2026-09-01', '2026-09-05'),
        task('finish', '2026-09-01', '2026-09-01'),
      ],
      [
        edge('start', 'short'),
        edge('start', 'long'),
        edge('short', 'finish'),
        edge('long', 'finish'),
      ],
    );
    expect(byId(result, 'long').totalFloatDays).toBe(0);
    expect(byId(result, 'short').totalFloatDays).toBe(4);
    expect(result.criticalTaskIds).toEqual(['start', 'long', 'finish']);
  });

  it('reports the whole-network span as durationDays', () => {
    const result = computeCriticalPath(
      [task('a', '2026-09-01', '2026-09-02'), task('b', '2026-09-01', '2026-09-03')],
      [edge('a', 'b')],
    );
    // a 2 days then b 3 days, back to back.
    expect(result.durationDays).toBe(5);
  });
});

describe('computeCriticalPath — independent of the order edges arrive in', () => {
  // Both passes keep a running best (max forward, min backward). If the FIRST edge examined is
  // already the winner, the comparison against every later edge must leave it alone. Rows come back
  // in whatever order the index returns them, so getting this wrong would make the schedule depend
  // on the query plan.
  const tasks = [
    task('early', '2026-09-01', '2026-09-02'), // EF 2
    task('late', '2026-09-01', '2026-09-05'), // EF 5
    task('joins', '2026-09-01', '2026-09-01'),
  ];

  it('forward pass — a later edge that is earlier does not pull the start back', () => {
    const lateFirst = computeCriticalPath(tasks, [edge('late', 'joins'), edge('early', 'joins')]);
    const earlyFirst = computeCriticalPath(tasks, [edge('early', 'joins'), edge('late', 'joins')]);
    expect(byId(lateFirst, 'joins').earliestStartOffset).toBe(5);
    expect(byId(earlyFirst, 'joins').earliestStartOffset).toBe(5);
  });

  it('backward pass — a later successor with more slack does not push the finish out', () => {
    const branchTasks = [
      task('start', '2026-09-01', '2026-09-01'),
      task('short', '2026-09-01', '2026-09-01'),
      task('long', '2026-09-01', '2026-09-05'),
      task('finish', '2026-09-01', '2026-09-01'),
    ];
    const tail = [edge('short', 'finish'), edge('long', 'finish')];
    const longFirst = computeCriticalPath(branchTasks, [
      edge('start', 'long'),
      edge('start', 'short'),
      ...tail,
    ]);
    const shortFirst = computeCriticalPath(branchTasks, [
      edge('start', 'short'),
      edge('start', 'long'),
      ...tail,
    ]);
    expect(byId(longFirst, 'start').latestFinishOffset).toBe(1);
    expect(byId(shortFirst, 'start').latestFinishOffset).toBe(1);
    expect(longFirst.criticalTaskIds).toEqual(shortFirst.criticalTaskIds);
  });
});

describe('computeCriticalPath — tasks it will not schedule', () => {
  it('excludes a task missing either planned date and counts it', () => {
    const result = computeCriticalPath(
      [
        task('a', '2026-09-01', '2026-09-02'),
        task('no-end', '2026-09-01', null),
        task('no-start', null, '2026-09-02'),
        task('neither', null, null),
      ],
      [],
    );
    expect(result.tasks.map((t) => t.taskId)).toEqual(['a']);
    expect(result.excludedTaskCount).toBe(3);
  });

  it('drops an edge that touches an unschedulable task instead of constraining against it', () => {
    const result = computeCriticalPath(
      [task('a', '2026-09-01', '2026-09-02'), task('ghost', null, null)],
      [edge('ghost', 'a', 'FS', 100)],
    );
    expect(byId(result, 'a').earliestStartOffset).toBe(0);
  });

  it('returns an empty result when nothing is schedulable', () => {
    const result = computeCriticalPath([task('a', null, null)], []);
    expect(result).toEqual({
      tasks: [],
      criticalTaskIds: [],
      durationDays: 0,
      excludedTaskCount: 1,
    });
  });

  it('returns an empty result for no tasks at all', () => {
    expect(computeCriticalPath([], [])).toEqual({
      tasks: [],
      criticalTaskIds: [],
      durationDays: 0,
      excludedTaskCount: 0,
    });
  });
});

describe('computeCriticalPath — cycles', () => {
  it('throws rather than returning a partial schedule, naming the tasks in the cycle', () => {
    const tasks = [
      task('a', '2026-09-01', '2026-09-02'),
      task('b', '2026-09-01', '2026-09-02'),
      task('c', '2026-09-01', '2026-09-02'),
    ];
    const edges = [edge('a', 'b'), edge('b', 'c'), edge('c', 'a')];
    expect(() => computeCriticalPath(tasks, edges)).toThrow(CpmCycleError);
    try {
      computeCriticalPath(tasks, edges);
    } catch (err) {
      expect((err as CpmCycleError).taskIds.sort()).toEqual(['a', 'b', 'c']);
    }
  });
});

describe('wouldCreateCycle', () => {
  it('rejects a self-edge', () => {
    expect(wouldCreateCycle([], 'a', 'a')).toBe(true);
  });

  it('rejects an edge that closes a loop back to the predecessor', () => {
    expect(wouldCreateCycle([edge('b', 'c'), edge('c', 'a')], 'a', 'b')).toBe(true);
  });

  it('allows an edge that only adds depth', () => {
    expect(wouldCreateCycle([edge('a', 'b')], 'b', 'c')).toBe(false);
  });

  it('allows a diamond — two paths to the same task are not a cycle', () => {
    expect(wouldCreateCycle([edge('a', 'b'), edge('a', 'c')], 'b', 'd')).toBe(false);
  });

  it('terminates on an already-cyclic set instead of walking it forever', () => {
    expect(wouldCreateCycle([edge('x', 'y'), edge('y', 'x')], 'p', 'x')).toBe(false);
  });
});

describe('offsetToDate', () => {
  it('turns a day offset back into a calendar date', () => {
    const origin = new Date('2026-09-01T00:00:00.000Z');
    expect(offsetToDate(origin, 0).toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(offsetToDate(origin, 4).toISOString()).toBe('2026-09-05T00:00:00.000Z');
    expect(offsetToDate(origin, -1).toISOString()).toBe('2026-08-31T00:00:00.000Z');
  });
});
