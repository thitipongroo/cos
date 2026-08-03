// Shared helpers for the analytics controllers.
//
// tenantId is taken from the authenticated request context (set by TenantMiddleware from the JWT),
// NOT from a client-supplied query param — a caller must never be able to read another tenant's
// analytics by passing an arbitrary tenantId. The optional `tenantId` query param is kept only as a
// fallback for older callers and is ignored whenever the request context carries one.
//
// dateRange defaults to the last 90 days when the caller omits it, so a client (e.g. the mobile PM
// dashboard) can call GET /analytics/pm/:projectId with no query string and still get data.

import { UnauthorizedException } from '@nestjs/common';
import { clsTenantId } from '../../shared/context/cls-context';

export interface TenantRequest {
  tenantId?: string;
}

export function resolveTenantId(req: TenantRequest, _queryTenantId?: string): string {
  // Tenant scope comes ONLY from the authenticated request context. The client-supplied `tenantId`
  // query param is deliberately IGNORED: honouring it as a fallback would let an authenticated user
  // of one tenant read another tenant's analytics (IDOR).
  //
  // CLS is a real fallback, not belt-and-braces. TenantContextInterceptor sets req.tenantId, but
  // under @nestjs/platform-fastify the request object an interceptor decorates is not guaranteed to
  // be the one the handler receives — that is why JwtAuthGuard publishes the tenant into CLS and why
  // every other module reads `req.x ?? cls…` (see cls-context.ts, workforce.controller.ts).
  //
  // Returning '' when both are missing was worse than useless: '' flows into a ClickHouse
  // {tenantId:UUID} bind and surfaces as a 500 from the driver, so a context-propagation failure
  // looked like a database fault. Fail closed, and say why.
  const tenantId = req.tenantId ?? clsTenantId();
  if (!tenantId) {
    throw new UnauthorizedException({
      code: 'COS-ANALYTICS-001',
      message: 'Tenant context missing from request',
      messageKey: 'analytics.tenantContextMissing',
    });
  }
  return tenantId;
}

export function resolveDateRange(dateRange?: unknown): string {
  // `unknown`, not `string`. A query parameter arrives as an array whenever the caller repeats it
  // (`?dateRange=a&dateRange=b`), and the declared TypeScript type does not check that at runtime.
  // Array.prototype.includes exists too, so the old `dateRange.includes(',')` guard passed an array
  // straight through as if it were a range. The ClickHouse queries bind their dates as typed
  // parameters ({startDate:Date}), so this was never SQL injection — but it did reach the cache key
  // and the driver as a non-string. Found by CodeQL js/type-confusion-through-parameter-tampering.
  if (typeof dateRange === 'string' && dateRange.includes(',')) return dateRange;
  const end = new Date();
  const start = new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date): string => d.toISOString().slice(0, 10);
  return `${fmt(start)},${fmt(end)}`;
}
