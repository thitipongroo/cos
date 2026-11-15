import { createLogger } from '@cos/logger';
import { DEFAULT_TENANT_TIMEZONE, tenantTimezone } from '../prisma/get-db-url';

const logger = createLogger('calendar-day');

/**
 * The calendar day (`YYYY-MM-DD`) that `now` falls on in `timeZone` — what a DATE column should hold
 * for "today" as the tenant lives it.
 *
 * Not `now.toISOString().slice(0, 10)`: that is the UTC day, which in Bangkok (UTC+7) is still
 * yesterday before 07:00, so a PO approved at 06:00 was dated the day before. `en-CA` formats a date
 * as `YYYY-MM-DD`.
 */
export function calendarDayIn(timeZone: string, now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * Today as `tenantId`'s tenant lives it — its zone from `platform.tenants` (tenantTimezone). A zone
 * `Intl` does not know (only a hand-written SQL value can be one: the API validates it) falls back to
 * the platform default with a warning, rather than failing every write that needs a date.
 */
export async function tenantCalendarDay(tenantId: string, now: Date = new Date()): Promise<string> {
  const zone = await tenantTimezone(tenantId);
  try {
    return calendarDayIn(zone, now);
  } catch (err) {
    if (!(err instanceof RangeError)) throw err;
    logger.warn(
      { tenant_id: tenantId, zone },
      'tenant.timezone.invalid — using the platform default',
    );
    return calendarDayIn(DEFAULT_TENANT_TIMEZONE, now);
  }
}
