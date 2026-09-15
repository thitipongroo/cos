// Validation of the audit-log query DTOs, run the way the global ValidationPipe runs them (main.ts:
// transform on, implicit conversion OFF, whitelist + forbidNonWhitelisted).

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  AuditLogExportDto,
  AuditLogListDto,
  AuditLogPageDto,
  AuditLogSummaryDto,
} from '../dto/audit-log-query.dto';

async function errors<T extends object>(cls: new () => T, plain: Record<string, unknown>) {
  const dto = plainToInstance(cls, plain, { enableImplicitConversion: false });
  const found = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return { dto, props: found.map((e) => e.property) };
}

const UUID = '11111111-1111-4111-8111-111111111111';

describe('audit-log query DTOs', () => {
  it('a page query converts a digit-string limit and trims q', async () => {
    const { dto, props } = await errors(AuditLogPageDto, { limit: '25', q: '  ops ', cursor: 'c' });
    expect(props).toEqual([]);
    expect(dto).toMatchObject({ limit: 25, q: 'ops', cursor: 'c' });
  });

  it.each([['0'], ['101'], ['abc'], ['1.5'], ['-1']])('limit=%s is refused', async (limit) => {
    expect((await errors(AuditLogPageDto, { limit })).props).toEqual(['limit']);
  });

  it('a non-string q is left untransformed and refused', async () => {
    expect((await errors(AuditLogPageDto, { q: 5 })).props).toEqual(['q']);
  });

  it('the list query accepts every filter together with paging', async () => {
    const { props } = await errors(AuditLogListDto, {
      tenantId: UUID,
      actorId: UUID,
      action: 'tenant.',
      from: '2026-09-01',
      to: '2026-09-15T00:00:00Z',
      q: 'x',
      cursor: 'c',
      limit: '50',
    });
    expect(props).toEqual([]);
  });

  it('the list query refuses a non-UUID tenant / actor and a non-ISO date', async () => {
    const { props } = await errors(AuditLogListDto, {
      tenantId: 'x',
      actorId: 'y',
      from: 'yesterday',
      to: '15/09/2026',
    });
    expect(props.sort()).toEqual(['actorId', 'from', 'tenantId', 'to']);
  });

  it.each([
    ['a date-time with no offset', '2026-09-15T10:00:00'],
    ['a signed year', '+2026-01-01'],
    ['a negative year', '-2026-01-01'],
    ['microseconds', '2026-09-15T10:00:00.123456Z'],
  ])('the window refuses %s', async (_label, from) => {
    expect((await errors(AuditLogSummaryDto, { from, to: from })).props.sort()).toEqual([
      'from',
      'to',
    ]);
  });

  it.each([['2026-09-15'], ['2026-09-15T10:00Z'], ['2026-09-15T10:00:00.123+07:00']])(
    'the window accepts %s',
    async (from) => {
      expect((await errors(AuditLogSummaryDto, { from })).props).toEqual([]);
    },
  );

  it('q and action refuse a NUL character', async () => {
    const { props } = await errors(AuditLogListDto, { q: 'a\u0000b', action: 'tenant.\u0000' });
    expect(props.sort()).toEqual(['action', 'q']);
  });

  it('the summary query takes only the window', async () => {
    expect((await errors(AuditLogSummaryDto, { from: '2026-09-01' })).props).toEqual([]);
    expect((await errors(AuditLogSummaryDto, { q: 'x' })).props).toEqual(['q']);
  });

  it('the export query takes csv or json and nothing else', async () => {
    expect((await errors(AuditLogExportDto, { format: 'json' })).props).toEqual([]);
    expect((await errors(AuditLogExportDto, { format: 'xml' })).props).toEqual(['format']);
    expect((await errors(AuditLogExportDto, { cursor: 'c' })).props).toEqual(['cursor']);
  });
});
