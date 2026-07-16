// Unit tests — Project Progress Metric (§32.12)
//
// deriveProgress is pure, so the formula and its null semantics are tested directly rather than
// through a mocked repository. The SQL that produces the sums is covered separately; what matters
// here is that "not computable" never renders as 0, and that SPI compares like with like.

import { deriveProgress, earnedScheduleDays } from '../tasks.service';
import type { ProgressSums, SchedulableTaskRow } from '../tasks.repository';

/** Sums for a single BOQ-linked task: weight `w`, progress `p`%, planned `plan`% (null = undated). */
function oneTask(w: number, p: number, plan: number | null): ProgressSums {
  const dated = plan !== null;
  return {
    weightTotal: w,
    earnedTotal: p * w,
    schedWeightTotal: dated ? w : 0,
    schedEarnedTotal: dated ? p * w : 0,
    schedPlannedTotal: dated ? plan * w : 0,
  };
}

const EMPTY: ProgressSums = {
  weightTotal: 0,
  earnedTotal: 0,
  schedWeightTotal: 0,
  schedEarnedTotal: 0,
  schedPlannedTotal: 0,
};

describe('deriveProgress — §32.12 project progress metric', () => {
  describe('value weighting', () => {
    it('weights by BOQ value, not by task count', () => {
      // 10,000,000 of concrete at 100% + 5,000 of paint at 0% is ~99.95% of the value, even though
      // a raw task average would call it 50%. This is the whole point of the cost-ratio method.
      const sums: ProgressSums = {
        weightTotal: 10_000_000 + 5_000,
        earnedTotal: 100 * 10_000_000 + 0 * 5_000,
        schedWeightTotal: 0,
        schedEarnedTotal: 0,
        schedPlannedTotal: 0,
      };
      expect(deriveProgress(sums).percentComplete).toBeCloseTo(99.95, 2);
    });

    it('a half-done single task reads 50%', () => {
      expect(deriveProgress(oneTask(1000, 50, null)).percentComplete).toBe(50);
    });
  });

  describe('null means "not computable", never zero', () => {
    it('returns all-null when no BOQ-linked task carries value', () => {
      // A 0% bar here would read as "no work done" when the truth is "no BOQ linked yet".
      expect(deriveProgress(EMPTY)).toEqual({
        percentComplete: null,
        plannedPercent: null,
        spi: null,
        status: null,
      });
    });

    it('keeps percentComplete but drops the verdict when nothing has planned dates', () => {
      const r = deriveProgress(oneTask(1000, 40, null));
      expect(r.percentComplete).toBe(40);
      expect(r.plannedPercent).toBeNull();
      expect(r.spi).toBeNull();
      expect(r.status).toBeNull();
    });

    it('drops the verdict when nothing was due to have started yet', () => {
      // plannedPercent = 0 → SPI would be Infinity, which would render as spectacular progress.
      const r = deriveProgress(oneTask(1000, 0, 0));
      expect(r.percentComplete).toBe(0);
      expect(r.plannedPercent).toBe(0);
      expect(r.spi).toBeNull();
      expect(r.status).toBeNull();
    });

    it('distinguishes genuine 0% progress from no data', () => {
      // Both have "zero" somewhere, but only one is measurable.
      expect(deriveProgress(oneTask(1000, 0, 50)).percentComplete).toBe(0);
      expect(deriveProgress(EMPTY).percentComplete).toBeNull();
    });
  });

  describe('schedule verdict bands', () => {
    it('SPI > 1.05 is ahead', () => {
      const r = deriveProgress(oneTask(1000, 66, 60)); // 66/60 = 1.1
      expect(r.spi).toBeCloseTo(1.1, 5);
      expect(r.status).toBe('ahead');
    });

    it('SPI < 0.95 is behind', () => {
      const r = deriveProgress(oneTask(1000, 54, 60)); // 54/60 = 0.9
      expect(r.spi).toBeCloseTo(0.9, 5);
      expect(r.status).toBe('behind');
    });

    it('SPI within 0.95–1.05 is on_track', () => {
      expect(deriveProgress(oneTask(1000, 60, 60)).status).toBe('on_track'); // exactly 1.0
      expect(deriveProgress(oneTask(1000, 63, 60)).status).toBe('on_track'); // 1.05
      expect(deriveProgress(oneTask(1000, 57, 60)).status).toBe('on_track'); // 0.95
    });

    it('the band edges are inclusive of on_track', () => {
      // 1.05 and 0.95 themselves are on_track — only strictly outside the band changes the verdict.
      expect(deriveProgress(oneTask(1000, 63, 60)).spi).toBeCloseTo(1.05, 5);
      expect(deriveProgress(oneTask(1000, 57, 60)).spi).toBeCloseTo(0.95, 5);
      expect(deriveProgress(oneTask(1000, 63.1, 60)).status).toBe('ahead');
      expect(deriveProgress(oneTask(1000, 56.9, 60)).status).toBe('behind');
    });
  });

  describe('SPI compares like with like', () => {
    it('an undated task moves percentComplete but never the verdict', () => {
      // Dated: weight 1000 at 50% earned, 50% planned → SPI 1.0, on_track.
      // Undated: weight 1000 at 0% — drags the headline to 25% but has no schedule to be late against.
      const sums: ProgressSums = {
        weightTotal: 2000,
        earnedTotal: 50 * 1000 + 0 * 1000,
        schedWeightTotal: 1000,
        schedEarnedTotal: 50 * 1000,
        schedPlannedTotal: 50 * 1000,
      };
      const r = deriveProgress(sums);
      expect(r.percentComplete).toBe(25);
      expect(r.spi).toBeCloseTo(1.0, 5);
      expect(r.status).toBe('on_track');
    });

    it('does not divide the headline percent by the planned percent', () => {
      // Guards the specific bug of using percentComplete (wide base) as SPI's numerator: that would
      // give 25/50 = 0.5 → "behind", punishing the project for a task that has no dates at all.
      const sums: ProgressSums = {
        weightTotal: 2000,
        earnedTotal: 50 * 1000,
        schedWeightTotal: 1000,
        schedEarnedTotal: 50 * 1000,
        schedPlannedTotal: 50 * 1000,
      };
      expect(deriveProgress(sums).status).not.toBe('behind');
    });

    it('bases match when every task is dated', () => {
      const r = deriveProgress(oneTask(1000, 65, 60));
      expect(r.percentComplete).toBe(65);
      expect(r.spi).toBeCloseTo(65 / 60, 5);
    });
  });

  describe('SPI converges to 1.0 at completion — where scheduleDaysBehind takes over (§32.12)', () => {
    it('reports a finished-late project as on_track by spi', () => {
      // spi can't see lateness once every task is done (earned = planned = 100); the day-variance can.
      const r = deriveProgress(oneTask(1000, 100, 100));
      expect(r.spi).toBe(1);
      expect(r.status).toBe('on_track');
    });
  });
});

describe('earnedScheduleDays — schedule variance in days (§32.12)', () => {
  const day = (iso: string): Date => new Date(`${iso}T00:00:00Z`);

  /** One schedulable task: `p`% done, weight `w`, 20-day span from `start`. */
  function task(start: string, end: string, p: number, w = 1): SchedulableTaskRow {
    return { progress: p, weight: w, planned_start: day(start), planned_end: day(end) };
  }

  it('is behind when the plan expected today’s progress earlier', () => {
    // 50% earned; the plan reached 50% at the span midpoint (Jan 11). Today is Jan 16 → 5 days behind.
    const rows = [task('2026-01-01', '2026-01-21', 50)];
    expect(earnedScheduleDays(rows, day('2026-01-16'))).toBe(5);
  });

  it('is ahead (negative) when more is done than the plan expected by today', () => {
    // 80% earned; the plan reaches 80% at Jan 17. Today is Jan 11 → 6 days ahead.
    const rows = [task('2026-01-01', '2026-01-21', 80)];
    expect(earnedScheduleDays(rows, day('2026-01-11'))).toBe(-6);
  });

  it('does not collapse to zero for a project finished late', () => {
    // All done (earned 100) → ES is the latest planned_end (Jan 21). A month later → 31 behind.
    const rows = [task('2026-01-01', '2026-01-21', 100)];
    expect(earnedScheduleDays(rows, day('2026-02-21'))).toBe(31);
  });

  it('is zero when a fully-done project sits exactly on its planned finish', () => {
    const rows = [task('2026-01-01', '2026-01-21', 100)];
    expect(earnedScheduleDays(rows, day('2026-01-21'))).toBe(0);
  });

  it('anchors ES at the earliest start when nothing is earned yet', () => {
    // 0% earned → ES = earliest planned_start (Jan 1). Today Jan 6 → 5 days behind (should've begun).
    const rows = [task('2026-01-01', '2026-01-21', 0)];
    expect(earnedScheduleDays(rows, day('2026-01-06'))).toBe(5);
  });

  it('weights by BOQ value across several tasks', () => {
    // A heavy task done and a light one not: ES leans toward the heavy task's plan.
    const rows = [
      task('2026-01-01', '2026-01-21', 100, 9), // heavy, done
      task('2026-01-01', '2026-01-21', 0, 1), // light, untouched
    ];
    // earned = (100×9 + 0×1)/10 = 90 → plan reaches 90% at Jan 19. Today Jan 21 → 2 days behind.
    expect(earnedScheduleDays(rows, day('2026-01-21'))).toBe(2);
  });

  it('ignores zero-weight tasks and returns null when none remain', () => {
    expect(
      earnedScheduleDays([task('2026-01-01', '2026-01-21', 50, 0)], day('2026-01-16')),
    ).toBeNull();
  });

  it('is null when there is no schedulable task', () => {
    expect(earnedScheduleDays([], day('2026-01-16'))).toBeNull();
  });

  it('reproduces the R9CT case — ~21 days behind (76% done, plan finished 7 Jul, today 16 Jul)', () => {
    const rows = [
      task('2026-06-05', '2026-06-25', 100, 4_096_000),
      task('2026-06-08', '2026-06-28', 65, 1_205_750),
      task('2026-06-11', '2026-07-01', 40, 3_733_800),
      task('2026-06-17', '2026-07-07', 100, 1_855_980),
    ];
    const days = earnedScheduleDays(rows, day('2026-07-16'));
    expect(days).not.toBeNull();
    expect(days).toBeGreaterThanOrEqual(20);
    expect(days).toBeLessThanOrEqual(22);
  });
});
