// Validation of the first-TENANT_ADMIN request body (ADR-110).

import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BootstrapTenantAdminDto } from '../dto/bootstrap-tenant-admin.dto';

const valid = {
  email: 'somchai@acme.co.th',
  display_name: 'สมชาย ใจดี',
  justification: 'Trial request TR-0042 from construction-os.io — first admin.',
};

async function failing(body: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(plainToInstance(BootstrapTenantAdminDto, body));
  return errors.map((e) => e.property);
}

describe('BootstrapTenantAdminDto', () => {
  it('accepts an email, a name and a justification', async () => {
    expect(await failing(valid)).toEqual([]);
  });

  it('trims the email and the name', () => {
    const dto = plainToInstance(BootstrapTenantAdminDto, {
      ...valid,
      email: '  somchai@acme.co.th ',
      display_name: ' สมชาย ',
    });
    expect(dto.email).toBe('somchai@acme.co.th');
    expect(dto.display_name).toBe('สมชาย');
  });

  it.each([
    ['email', { email: 'not-an-email' }],
    ['email', { email: `${'a'.repeat(250)}@x.co` }],
    ['display_name', { display_name: '   ' }],
    ['display_name', { display_name: 'ก'.repeat(256) }],
    ['justification', { justification: 'too short' }],
  ])('refuses a bad %s', async (field, over) => {
    expect(await failing({ ...valid, ...over })).toEqual([field]);
  });

  it('refuses non-string values without trimming them', async () => {
    expect(await failing({ ...valid, email: 42, display_name: 7 })).toEqual([
      'email',
      'display_name',
    ]);
  });
});
