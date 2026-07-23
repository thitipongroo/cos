// Shared helpers for the analytics controllers.
//
// tenantId is taken from the authenticated request context (set by TenantMiddleware from the JWT),
// NOT from a client-supplied query param — a caller must never be able to read another tenant's
// analytics by passing an arbitrary tenantId. The optional `tenantId` query param is kept only as a
// fallback for older callers and is ignored whenever the request context carries one.
//
// dateRange defaults to the last 90 days when the caller omits it, so a client (e.g. the mobile PM
// dashboard) can call GET /analytics/pm/:projectId with no query string and still get data.

export interface TenantRequest {
  tenantId?: string;
}

export function resolveTenantId(req: TenantRequest, _queryTenantId?: string): string {
  // Tenant scope comes ONLY from the authenticated request context (TenantContextInterceptor sets
  // req.tenantId from the verified JWT `tenant_id`; the analytics controllers are behind JwtAuthGuard,
  // and KeycloakJwtStrategy.validate() rejects any token missing tenant_id — so req.tenantId is always
  // present here). The client-supplied `tenantId` query param is deliberately IGNORED: honouring it as
  // a fallback would let an authenticated user of one tenant read another tenant's analytics (IDOR).
  return req.tenantId ?? '';
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
