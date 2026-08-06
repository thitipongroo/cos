// analytics.request helpers — resolveTenantId / resolveDateRange (QM-1: 100% branches)

import { UnauthorizedException } from '@nestjs/common';
import { ClsServiceManager } from 'nestjs-cls';
import { resolveDateRange, resolveTenantId } from '../analytics.request';
import { CLS_TENANT_ID } from '../../../shared/context/cls-context';

describe('resolveTenantId', () => {
  it('prefers the authenticated request tenantId over the query param', () => {
    expect(resolveTenantId({ tenantId: 'req-tenant' }, 'query-tenant')).toBe('req-tenant');
  });

  it('ignores a client-supplied query param — tenant comes only from the authenticated request (IDOR fix)', () => {
    // Honouring the query param would let an authenticated caller read another tenant's analytics.
    expect(() => resolveTenantId({}, 'query-tenant')).toThrow(UnauthorizedException);
  });

  // Under Fastify the request an interceptor decorates is not guaranteed to be the one the handler
  // receives, so CLS — written by JwtAuthGuard — is the reliable source.
  it('falls back to the CLS tenant when the request object does not carry one', async () => {
    const cls = ClsServiceManager.getClsService();
    await cls.run(async () => {
      cls.set(CLS_TENANT_ID, 'cls-tenant');
      expect(resolveTenantId({})).toBe('cls-tenant');
    });
  });

  it('still prefers the request tenantId when CLS also has one', async () => {
    const cls = ClsServiceManager.getClsService();
    await cls.run(async () => {
      cls.set(CLS_TENANT_ID, 'cls-tenant');
      expect(resolveTenantId({ tenantId: 'req-tenant' })).toBe('req-tenant');
    });
  });

  // Returning '' sent an empty string into a ClickHouse {tenantId:UUID} bind, so a lost tenant
  // context surfaced as a 500 from the driver instead of an auth error.
  it('throws 401 rather than returning an empty tenant when context is missing entirely', () => {
    expect(() => resolveTenantId({})).toThrow(UnauthorizedException);
    // Asserted on the QM-10 envelope, not on `exception.message`: wrapping the body in `error` (so
    // GlobalExceptionFilter stops rewriting the code to COS-GENERAL-401) moves the text off the
    // exception's own message, which becomes the Nest default.
    try {
      resolveTenantId({});
    } catch (e) {
      expect((e as UnauthorizedException).getResponse()).toMatchObject({
        error: { code: 'COS-ANALYTICS-001', message: 'Tenant context missing from request' },
      });
    }
  });
});

describe('resolveDateRange', () => {
  it('passes an explicit "start,end" range through unchanged', () => {
    expect(resolveDateRange('2026-01-01,2026-06-30')).toBe('2026-01-01,2026-06-30');
  });

  it('defaults to the last 90 days when the range is omitted', () => {
    const result = resolveDateRange();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2},\d{4}-\d{2}-\d{2}$/);
    const [start, end] = result.split(',');
    const diffDays = (new Date(end).getTime() - new Date(start).getTime()) / (24 * 60 * 60 * 1000);
    expect(diffDays).toBe(90);
  });

  it('defaults to the last 90 days when the range has no comma', () => {
    expect(resolveDateRange('2026-01-01')).toMatch(/^\d{4}-\d{2}-\d{2},\d{4}-\d{2}-\d{2}$/);
  });
});

describe('resolveDateRange with a tampered parameter type', () => {
  // A repeated query parameter (?dateRange=a&dateRange=b) arrives as an array. Array has its own
  // .includes, so the old string-typed guard let it through untouched. CodeQL
  // js/type-confusion-through-parameter-tampering.
  it.each([
    ['an array that contains a comma', [',']],
    ['an array of ranges', ['2026-01-01,2026-06-30', '2026-07-01,2026-12-31']],
    ['an object', { toString: () => '2026-01-01,2026-06-30' }],
    ['a number', 20260101],
    ['null', null],
  ])('falls back to the 90-day default for %s', (_label, tampered) => {
    const result = resolveDateRange(tampered as unknown);

    expect(typeof result).toBe('string');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2},\d{4}-\d{2}-\d{2}$/);
  });
});
