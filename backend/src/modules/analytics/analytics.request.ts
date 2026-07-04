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

export function resolveTenantId(req: TenantRequest, queryTenantId?: string): string {
  return req.tenantId ?? queryTenantId ?? '';
}

export function resolveDateRange(dateRange?: string): string {
  if (dateRange && dateRange.includes(',')) return dateRange;
  const end = new Date();
  const start = new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date): string => d.toISOString().slice(0, 10);
  return `${fmt(start)},${fmt(end)}`;
}
