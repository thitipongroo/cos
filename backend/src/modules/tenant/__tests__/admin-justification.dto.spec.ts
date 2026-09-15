// The §6.7 justification is enforced at the API edge. These run the real class-transformer +
// class-validator pipeline the global ValidationPipe uses (transform: true), so "required" is proven on
// the wire shape rather than assumed from the decorators.

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  AdminJustificationDto,
  JUSTIFICATION_MAX,
  JUSTIFICATION_MIN,
} from '../public/admin-justification.dto';
import { CreateTenantDto } from '../dto/create-tenant.dto';
import { AssignDedicatedDbDto } from '../dto/assign-dedicated-db.dto';
import { MarkContractedDto } from '../dto/mark-contracted.dto';

async function errorsFor<T extends object>(cls: new () => T, body: Record<string, unknown>) {
  const errors = await validate(plainToInstance(cls, body));
  return errors.map((e) => e.property);
}

describe('AdminJustificationDto', () => {
  it('accepts a reason of the minimum length, trimmed', async () => {
    const dto = plainToInstance(AdminJustificationDto, {
      justification: `  ${'a'.repeat(JUSTIFICATION_MIN)}  `,
    });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.justification).toBe('a'.repeat(JUSTIFICATION_MIN));
  });

  it.each([
    ['missing', {}],
    ['blank after trimming', { justification: '          ' }],
    ['one character short', { justification: 'a'.repeat(JUSTIFICATION_MIN - 1) }],
    ['one character long', { justification: 'a'.repeat(JUSTIFICATION_MAX + 1) }],
    ['not a string', { justification: 1234567890123 }],
  ])('rejects a justification that is %s', async (_label, body) => {
    expect(await errorsFor(AdminJustificationDto, body)).toEqual(['justification']);
  });

  it.each([
    [
      'CreateTenantDto',
      CreateTenantDto,
      { tenantCode: 'acme_corp', tenantName: 'Acme', planType: 'STARTER' },
    ],
    ['AssignDedicatedDbDto', AssignDedicatedDbDto, { dedicatedDbUrl: 'postgresql://h:5432/db' }],
    ['MarkContractedDto', MarkContractedDto, {}],
  ] as const)('%s requires it too', async (_name, cls, body) => {
    expect(await errorsFor(cls as new () => object, { ...body })).toEqual(['justification']);
    expect(
      await errorsFor(cls as new () => object, {
        ...body,
        justification: 'a'.repeat(JUSTIFICATION_MIN),
      }),
    ).toEqual([]);
  });
});
