// analytics.request helpers — resolveTenantId / resolveDateRange (QM-1: 100% branches)

import { resolveDateRange, resolveTenantId } from '../analytics.request';

describe('resolveTenantId', () => {
  it('prefers the authenticated request tenantId over the query param', () => {
    expect(resolveTenantId({ tenantId: 'req-tenant' }, 'query-tenant')).toBe('req-tenant');
  });

  it('falls back to the query param when the request carries no tenantId', () => {
    expect(resolveTenantId({}, 'query-tenant')).toBe('query-tenant');
  });

  it('returns empty string when neither request nor query provides a tenantId', () => {
    expect(resolveTenantId({})).toBe('');
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
