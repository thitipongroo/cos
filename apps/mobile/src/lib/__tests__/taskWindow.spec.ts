import { taskWindow } from '../taskWindow';

describe('taskWindow', () => {
  it('renders the window the mockup draws', () => {
    expect(taskWindow('08:00:00', '12:00:00')).toBe('08:00 - 12:00');
    expect(taskWindow('13:00:00', '15:00:00')).toBe('13:00 - 15:00');
  });

  it('drops the seconds Postgres renders — nobody planned to the second', () => {
    expect(taskWindow('08:00:00', '17:30:00')).toBe('08:00 - 17:30');
  });

  it('accepts a time already trimmed, so the shape of the column can change under it', () => {
    expect(taskWindow('08:00', '12:00')).toBe('08:00 - 12:00');
  });

  it('pads a single-digit hour, so a column of cards lines up', () => {
    expect(taskWindow('8:00', '9:30')).toBe('08:00 - 09:30');
  });

  it('reads the epoch-pinned form Prisma actually sends', () => {
    // `/sync/delta` reaches TIME through Prisma, which maps it to a JS Date and serialises it as a
    // 1970-01-01 timestamp. This is the shape the device receives — verified against the running
    // database on 2026-08-11, after the first build of the card silently fell back to dates.
    expect(taskWindow('1970-01-01T08:00:00.000Z', '1970-01-01T12:00:00.000Z')).toBe(
      '08:00 - 12:00',
    );
    expect(taskWindow('1970-01-01T13:00:00.000Z', '1970-01-01T17:00:00.000Z')).toBe(
      '13:00 - 17:00',
    );
  });

  it('does not let the device’s timezone move the hours', () => {
    // Parsing that timestamp with `new Date()` and reading LOCAL hours turns 08:00 into 15:00 on a
    // Bangkok handset — the device's own offset applied to a time that never had one. A site's
    // hours are wall-clock hours at that site, so the digits are taken exactly as written.
    const tz = process.env.TZ;
    process.env.TZ = 'Asia/Bangkok';
    expect(taskWindow('1970-01-01T08:00:00.000Z', '1970-01-01T12:00:00.000Z')).toBe(
      '08:00 - 12:00',
    );
    process.env.TZ = tz;
  });

  it('is null when no window was recorded — the card then shows its dates', () => {
    // Not a default: nothing records what time older tasks were planned for, and inventing an
    // 08:00–17:00 working day would state a fact nobody entered.
    expect(taskWindow(null, null)).toBeNull();
    expect(taskWindow(undefined, undefined)).toBeNull();
  });

  it('is null when only one end is recorded', () => {
    // "08:00 - " reads as a rendering fault, and "from 08:00" is not a sentence the drawing has.
    expect(taskWindow('08:00:00', null)).toBeNull();
    expect(taskWindow(null, '12:00:00')).toBeNull();
    expect(taskWindow('08:00:00', '')).toBeNull();
  });

  it('is null for anything that is not a time, rather than printing it half-parsed', () => {
    expect(taskWindow('not a time', '12:00')).toBeNull();
    expect(taskWindow('08:00', 'noon')).toBeNull();
    expect(taskWindow('25:00', '12:00')).toBeNull();
    expect(taskWindow('08:99', '12:00')).toBeNull();
  });

  it('keeps a window that crosses midnight as it was entered', () => {
    // Night work is real. Swapping the ends to "repair" it would rewrite a night shift into a day
    // one, and nothing in the row distinguishes that from a typo.
    expect(taskWindow('22:00:00', '06:00:00')).toBe('22:00 - 06:00');
  });
});
