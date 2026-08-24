import {
  currentPhase,
  formatDdMonYyyy,
  formatWorkWindow,
  hasProgressFigure,
  progressBarWidth,
  scheduleColour,
  selectUpcomingTasks,
  sortIssuesBySeverity,
  taskStartUrgency,
  topSeverityCount,
  urgencyCounts,
  type ActiveIssue,
  type ProjectPhase,
  type UpcomingTask,
} from '../siteEngineerHome';

function task(over: Partial<UpcomingTask> = {}): UpcomingTask {
  return {
    task_id: 't1',
    task_name: 'Foundation pouring',
    status: 'NOT_STARTED',
    planned_start: '2026-07-20',
    ...over,
  };
}

function issue(severity: string, id = 'i1'): ActiveIssue {
  return { issue_id: id, issue_number: null, title: 'Steel beam delay', severity, status: 'OPEN' };
}

function phase(seq: number, status: string, name = `Phase ${seq}`): ProjectPhase {
  return { phase_id: `ph${seq}`, seq, name, status };
}

describe('selectUpcomingTasks', () => {
  it('orders by planned start, soonest first', () => {
    const out = selectUpcomingTasks([
      task({ task_id: 'late', planned_start: '2026-08-01' }),
      task({ task_id: 'soon', planned_start: '2026-07-17' }),
      task({ task_id: 'mid', planned_start: '2026-07-25' }),
    ]);
    expect(out.map((t) => t.task_id)).toEqual(['soon', 'mid', 'late']);
  });

  it('drops finished and cancelled work', () => {
    const out = selectUpcomingTasks([
      task({ task_id: 'done', status: 'COMPLETED' }),
      task({ task_id: 'dropped', status: 'CANCELLED' }),
      task({ task_id: 'open', status: 'IN_PROGRESS' }),
    ]);
    expect(out.map((t) => t.task_id)).toEqual(['open']);
  });

  it('drops tasks with no planned start', () => {
    // The list is ordered by when work begins; a task with no start has no position on it.
    const out = selectUpcomingTasks([
      task({ task_id: 'undated', planned_start: null }),
      task({ task_id: 'dated' }),
    ]);
    expect(out.map((t) => t.task_id)).toEqual(['dated']);
  });

  it('caps the list so the card cannot push the rest of the screen away', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      task({ task_id: `t${i}`, planned_start: `2026-07-${String(i + 10).padStart(2, '0')}` }),
    );
    expect(selectUpcomingTasks(many)).toHaveLength(5);
    expect(selectUpcomingTasks(many, 2).map((t) => t.task_id)).toEqual(['t0', 't1']);
  });

  it('returns empty rather than throwing on no tasks', () => {
    expect(selectUpcomingTasks([])).toEqual([]);
  });
});

describe('currentPhase — derived, never a stored flag (ADR-070)', () => {
  it('picks the lowest-seq IN_PROGRESS phase, ignoring input order', () => {
    const out = currentPhase([
      phase(3, 'IN_PROGRESS', 'MEP'),
      phase(1, 'COMPLETED', 'Foundation'),
      phase(2, 'IN_PROGRESS', 'Structure'),
    ]);
    expect(out?.name).toBe('Structure');
  });

  it('falls back to the lowest-seq not-COMPLETED when none is in progress', () => {
    // Foundation done, nothing started yet → the next due phase (Structure) is current.
    const out = currentPhase([
      phase(1, 'COMPLETED', 'Foundation'),
      phase(2, 'NOT_STARTED', 'Structure'),
      phase(3, 'NOT_STARTED', 'MEP'),
    ]);
    expect(out?.name).toBe('Structure');
  });

  it('is null when every phase is COMPLETED', () => {
    expect(currentPhase([phase(1, 'COMPLETED'), phase(2, 'COMPLETED')])).toBeNull();
  });

  it('is null for an empty list', () => {
    expect(currentPhase([])).toBeNull();
  });

  it('does not mutate the input', () => {
    const input = [phase(2, 'IN_PROGRESS'), phase(1, 'COMPLETED')];
    currentPhase(input);
    expect(input.map((p) => p.seq)).toEqual([2, 1]);
  });
});

describe('formatWorkWindow — the time strip (ADR-072)', () => {
  it('trims Postgres TIME (HH:MM:SS) to HH:MM', () => {
    expect(formatWorkWindow('07:00:00', '18:00:00')).toEqual({ start: '07:00', end: '18:00' });
  });

  it('extracts HH:MM from an ISO datetime (pg/Prisma parses TIME to an epoch-day Date)', () => {
    // Regression: the live capture showed "1970-" because the value arrives as a full ISO datetime.
    expect(formatWorkWindow('1970-01-01T07:00:00.000Z', '1970-01-01T18:00:00.000Z')).toEqual({
      start: '07:00',
      end: '18:00',
    });
  });

  it('passes an already-HH:MM window through', () => {
    expect(formatWorkWindow('07:00', '18:00')).toEqual({ start: '07:00', end: '18:00' });
  });

  it('is null when either end is unset (no half-set strip)', () => {
    expect(formatWorkWindow(null, '18:00')).toBeNull();
    expect(formatWorkWindow('07:00', null)).toBeNull();
    expect(formatWorkWindow(null, null)).toBeNull();
  });
});

describe('formatDdMonYyyy — project date footer "DD Mon YYYY" (PO 2026-07-26)', () => {
  it('formats a bare YYYY-MM-DD date as DD Mon YYYY (English month abbreviation)', () => {
    expect(formatDdMonYyyy('2026-06-01')).toBe('01 Jun 2026');
    expect(formatDdMonYyyy('2027-01-31')).toBe('31 Jan 2027');
    expect(formatDdMonYyyy('2026-12-25')).toBe('25 Dec 2026');
  });

  it('takes the date part when the value arrives as an ISO datetime', () => {
    // A Postgres DATE parsed to a Date reaches the client as a full ISO datetime.
    expect(formatDdMonYyyy('2026-06-01T00:00:00.000Z')).toBe('01 Jun 2026');
  });

  it('returns an unexpected shape (or out-of-range month) unchanged rather than a wrong value', () => {
    expect(formatDdMonYyyy('not-a-date')).toBe('not-a-date');
    expect(formatDdMonYyyy('2026-13-01')).toBe('2026-13-01');
  });
});

describe('sortIssuesBySeverity', () => {
  it('orders worst first', () => {
    const out = sortIssuesBySeverity([
      issue('LOW', 'a'),
      issue('CRITICAL', 'b'),
      issue('MEDIUM', 'c'),
      issue('HIGH', 'd'),
    ]);
    expect(out.map((i) => i.severity)).toEqual(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);
  });

  it('does not mutate the input', () => {
    const input = [issue('LOW', 'a'), issue('CRITICAL', 'b')];
    sortIssuesBySeverity(input);
    expect(input.map((i) => i.severity)).toEqual(['LOW', 'CRITICAL']);
  });

  it('ranks an unknown severity below the known ones', () => {
    const out = sortIssuesBySeverity([issue('WEIRD', 'a'), issue('LOW', 'b')]);
    expect(out.map((i) => i.severity)).toEqual(['LOW', 'WEIRD']);
  });
});

describe('topSeverityCount — the header badge follows the data, not a hard-coded "CRITICAL"', () => {
  it('reports the worst level present and how many are at it', () => {
    // Real data has no critical issue; the badge must still surface the worst open ones.
    expect(topSeverityCount([issue('MEDIUM', 'a'), issue('HIGH', 'b')])).toEqual({
      severity: 'HIGH',
      count: 1,
    });
  });

  it('counts every issue at the top severity', () => {
    expect(
      topSeverityCount([issue('CRITICAL', 'a'), issue('CRITICAL', 'b'), issue('HIGH', 'c')]),
    ).toEqual({ severity: 'CRITICAL', count: 2 });
  });

  it('is null when there are no issues', () => {
    expect(topSeverityCount([])).toBeNull();
  });
});

describe('scheduleColour — three-band split of spi (§32.12 Display)', () => {
  it('is green at or above 0.95 (ahead / on_track)', () => {
    expect(scheduleColour(1.2)).toBe('green');
    expect(scheduleColour(0.95)).toBe('green');
  });

  it('is amber for a gentle slip (0.90–0.95)', () => {
    expect(scheduleColour(0.94)).toBe('amber');
    expect(scheduleColour(0.9)).toBe('amber');
  });

  it('is red for a serious slip (below 0.90)', () => {
    expect(scheduleColour(0.756)).toBe('red'); // the real R9CT value
    expect(scheduleColour(0.89)).toBe('red');
  });

  it('has no colour when spi is not computable', () => {
    expect(scheduleColour(null)).toBeNull();
    expect(scheduleColour(undefined)).toBeNull();
  });
});

describe('hasProgressFigure — §32.12 null is "not computable", never 0%', () => {
  it('treats null and undefined as no figure', () => {
    expect(hasProgressFigure(null)).toBe(false);
    expect(hasProgressFigure(undefined)).toBe(false);
  });

  it('treats a genuine zero as a figure', () => {
    // The distinction the card depends on: 0% renders a bar, null renders the placeholder.
    expect(hasProgressFigure(0)).toBe(true);
    expect(hasProgressFigure(65.4)).toBe(true);
  });
});

describe('progressBarWidth', () => {
  it('passes through in-range values', () => {
    expect(progressBarWidth(65.4)).toBe(65.4);
  });

  it('clamps out-of-range values to the track', () => {
    expect(progressBarWidth(120)).toBe(100);
    expect(progressBarWidth(-5)).toBe(0);
  });
});

describe('taskStartUrgency — colour the start date (≤ 3 days = due-soon)', () => {
  const now = new Date('2026-07-16T09:00:00Z');

  it('is overdue once the start date has passed', () => {
    expect(taskStartUrgency('2026-07-15', now)).toBe('overdue');
    expect(taskStartUrgency('2026-06-05', now)).toBe('overdue'); // the aged seed data
  });

  it('is due-soon from today through three days out', () => {
    expect(taskStartUrgency('2026-07-16', now)).toBe('due-soon'); // today
    expect(taskStartUrgency('2026-07-19', now)).toBe('due-soon'); // +3
  });

  it('is normal beyond three days', () => {
    expect(taskStartUrgency('2026-07-20', now)).toBe('normal'); // +4
  });

  it('compares by date, ignoring the time of day', () => {
    // A start earlier today than `now` is still "today" (due-soon), not overdue.
    expect(taskStartUrgency('2026-07-16T01:00:00Z', new Date('2026-07-16T23:00:00Z'))).toBe(
      'due-soon',
    );
  });
});

describe('urgencyCounts — the "งานที่กำลังจะเริ่ม" header badge', () => {
  const now = new Date('2026-07-16T09:00:00Z');

  it('buckets upcoming tasks into overdue and due-soon', () => {
    const counts = urgencyCounts(
      [
        task({ task_id: 'a', planned_start: '2026-06-05' }), // overdue
        task({ task_id: 'b', planned_start: '2026-07-14' }), // overdue
        task({ task_id: 'c', planned_start: '2026-07-18' }), // due-soon (+2)
        task({ task_id: 'd', planned_start: '2026-08-30' }), // normal — counted in neither
      ],
      now,
    );
    expect(counts).toEqual({ overdue: 2, dueSoon: 1 });
  });

  it('ignores finished, cancelled, and undated tasks', () => {
    const counts = urgencyCounts(
      [
        task({ task_id: 'done', status: 'COMPLETED', planned_start: '2026-06-01' }),
        task({ task_id: 'cx', status: 'CANCELLED', planned_start: '2026-06-01' }),
        task({ task_id: 'undated', planned_start: null }),
        task({ task_id: 'real', planned_start: '2026-06-01' }), // overdue
      ],
      now,
    );
    expect(counts).toEqual({ overdue: 1, dueSoon: 0 });
  });

  it('counts the whole set, not just the five shown', () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      task({ task_id: `t${i}`, planned_start: '2026-06-01' }),
    );
    expect(urgencyCounts(many, now).overdue).toBe(8);
  });

  it('is all zeros for an empty list', () => {
    expect(urgencyCounts([], now)).toEqual({ overdue: 0, dueSoon: 0 });
  });
});
