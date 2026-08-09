import { shiftProgress, STANDARD_SHIFT_HOURS, type ShiftAttendance } from '../shiftHours';

// Built with the LOCAL Date constructor, not an ISO string with a fixed `+07:00` offset.
// `shiftProgress` compares calendar days in DEVICE-LOCAL time — that is the behaviour under test —
// so an anchor pinned to one offset only lines up on a machine in that zone. It did: `+07:00` 15:00
// is 08:00Z, and the ten-hours-ago case landed at 22:00Z the PREVIOUS day, so the row was correctly
// discarded as yesterday's and the assertion failed on CI (UTC) while passing here (UTC+7).
// A local anchor at 15:00 keeps every offset in this file inside the same local day, in any zone.
const NOW = new Date(2026, 7, 8, 15, 0, 0);

/** `hoursAgo` before NOW, as the ISO string local_attendance stores. */
const checkedInHoursAgo = (hours: number): ShiftAttendance => ({
  checkInAt: new Date(NOW.getTime() - hours * 3_600_000).toISOString(),
  checkOutAt: null,
});

describe('shiftProgress', () => {
  it('shows nothing when the worker has not checked in', () => {
    expect(shiftProgress([], NOW)).toEqual({ elapsed: null, fraction: 0 });
  });

  it('formats elapsed time as HH:MM', () => {
    expect(shiftProgress([checkedInHoursAgo(6.75)], NOW).elapsed).toBe('06:45');
    expect(shiftProgress([checkedInHoursAgo(2)], NOW).elapsed).toBe('02:00');
  });

  it('scales the bar against a standard shift', () => {
    expect(shiftProgress([checkedInHoursAgo(4)], NOW).fraction).toBeCloseTo(
      4 / STANDARD_SHIFT_HOURS,
    );
  });

  it('caps the bar at full but keeps the true elapsed time', () => {
    // Ten hours into an eight-hour shift: the bar is full, the number is not clamped with it.
    const result = shiftProgress([checkedInHoursAgo(10)], NOW);
    expect(result.fraction).toBe(1);
    expect(result.elapsed).toBe('10:00');
  });

  it('ignores a shift that has been checked out', () => {
    // Went home at noon — "hours so far" must not keep counting.
    const closed: ShiftAttendance = {
      checkInAt: new Date(NOW.getTime() - 7 * 3_600_000).toISOString(),
      checkOutAt: new Date(NOW.getTime() - 3 * 3_600_000).toISOString(),
    };
    expect(shiftProgress([closed], NOW)).toEqual({ elapsed: null, fraction: 0 });
  });

  it("ignores a previous day's open row", () => {
    // A night shift left open yesterday must not read as 19 hours worked today.
    const yesterday: ShiftAttendance = {
      checkInAt: new Date(2026, 7, 7, 20, 0, 0).toISOString(),
      checkOutAt: null,
    };
    expect(shiftProgress([yesterday], NOW)).toEqual({ elapsed: null, fraction: 0 });
  });

  it('takes the EARLIEST open check-in when a re-check-in left two rows', () => {
    const rows = [checkedInHoursAgo(2), checkedInHoursAgo(5)];
    expect(shiftProgress(rows, NOW).elapsed).toBe('05:00');
  });

  it('clamps a check-in that clock skew put in the future', () => {
    const skewed = checkedInHoursAgo(-1); // one hour ahead of the device clock
    expect(shiftProgress([skewed], NOW)).toEqual({ elapsed: '00:00', fraction: 0 });
  });

  it('ignores a row with no check-in recorded at all', () => {
    expect(shiftProgress([{ checkInAt: null, checkOutAt: null }], NOW)).toEqual({
      elapsed: null,
      fraction: 0,
    });
    expect(shiftProgress([{}], NOW)).toEqual({ elapsed: null, fraction: 0 });
  });
});
