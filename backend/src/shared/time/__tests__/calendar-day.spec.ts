jest.mock('../../prisma/get-db-url', () => ({
  ...jest.requireActual('../../prisma/get-db-url'),
  tenantTimezone: jest.fn(),
}));
jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { tenantTimezone as tenantTimezoneFn } from '../../prisma/get-db-url';
import { calendarDayIn, tenantCalendarDay } from '../calendar-day';

const tenantTimezone = tenantTimezoneFn as jest.Mock;

describe('calendarDayIn', () => {
  it('is the day in the given zone, not the UTC day', () => {
    const now = new Date('2026-06-10T23:30:00Z'); // 06:30 on 11 Jun in Bangkok
    expect(calendarDayIn('Asia/Bangkok', now)).toBe('2026-06-11');
    expect(calendarDayIn('UTC', now)).toBe('2026-06-10');
    expect(calendarDayIn('America/Los_Angeles', now)).toBe('2026-06-10');
  });

  it('pads month and day', () => {
    expect(calendarDayIn('UTC', new Date('2026-01-05T12:00:00Z'))).toBe('2026-01-05');
  });
});

describe('tenantCalendarDay', () => {
  const now = new Date('2026-06-10T23:30:00Z');

  it("is the day in the tenant's zone", async () => {
    tenantTimezone.mockResolvedValueOnce('Asia/Bangkok');
    await expect(tenantCalendarDay('t-1', now)).resolves.toBe('2026-06-11');
  });

  it('falls back to the platform default on a zone Intl does not know', async () => {
    tenantTimezone.mockResolvedValueOnce('Not/AZone');
    await expect(tenantCalendarDay('t-1', now)).resolves.toBe('2026-06-11'); // Asia/Bangkok
  });
});
