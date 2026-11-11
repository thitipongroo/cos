// A tenant's timezone must be a zone the runtime knows, not only shaped like one. Notification quiet
// hours, digests and the trial-notice dates hand it to Intl.DateTimeFormat({ timeZone }), which throws
// RangeError on an unknown zone — so a value like 'Mars/Olympus' accepted at creation broke them later.

import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateTenantDto } from '../dto/create-tenant.dto';
import { CreateTrialTenantDto } from '../dto/create-trial-tenant.dto';

const JUSTIFICATION = 'Tenant requested by the customer (ticket 7c0e4d3a).';

async function timezoneErrors(cls: new () => object, timezone?: string): Promise<string[]> {
  const body: Record<string, unknown> = {
    tenantCode: 'somchai_build',
    tenantName: 'Somchai Build',
    planType: 'STARTER',
    justification: JUSTIFICATION,
  };
  if (timezone !== undefined) body['timezone'] = timezone;
  const errors = await validate(plainToInstance(cls, body));
  return errors
    .filter((e) => e.property === 'timezone')
    .flatMap((e) => Object.keys(e.constraints ?? {}));
}

describe.each([
  ['CreateTenantDto', CreateTenantDto],
  ['CreateTrialTenantDto', CreateTrialTenantDto],
])('%s timezone', (_name, cls) => {
  it('may be left out (the region default applies)', async () => {
    expect(await timezoneErrors(cls)).toEqual([]);
  });

  it.each(['Asia/Bangkok', 'Asia/Singapore', 'Europe/Dublin'])(
    'accepts %s, a region default',
    async (zone) => {
      expect(await timezoneErrors(cls, zone)).toEqual([]);
    },
  );

  it('refuses a zone that only looks like one', async () => {
    expect(await timezoneErrors(cls, 'Mars/Olympus')).toEqual(['isTimeZone']);
  });

  it('still refuses a name without the Area/Location shape', async () => {
    expect(await timezoneErrors(cls, 'UTC')).toContain('matches');
  });
});
