// CLS-backed auth context accessors.
//
// Under @nestjs/platform-fastify, Passport's `req.user` (and interceptor projections onto the request)
// do NOT reliably reach guards / interceptors / Scope.REQUEST providers — Fastify hands out different
// request instances. JwtAuthGuard therefore publishes the authenticated tenant context into CLS
// (AsyncLocalStorage via nestjs-cls), and providers read it from here as a fallback when the request
// object does not carry it. Static access (ClsServiceManager) avoids injecting ClsService everywhere.
//
// All reads are guarded by isActive() so they are safe (return undefined/'') outside a request — e.g.
// in unit tests that construct providers directly with a mock request and no CLS context.

import { ClsServiceManager } from 'nestjs-cls';

export const CLS_TENANT_ID = 'tenantId';
export const CLS_USER_ID = 'userId';
export const CLS_USER_ROLE = 'userRole';
export const CLS_TENANT_CODE = 'tenantCode';
export const CLS_DEDICATED_DB_URL = 'dedicatedDbUrl';

function clsGet(key: string): string | undefined {
  const cls = ClsServiceManager.getClsService();
  return cls.isActive() ? cls.get<string | undefined>(key) : undefined;
}

/** Tenant id from CLS, or '' when no context (caller treats '' as "missing"). */
export function clsTenantId(): string {
  return clsGet(CLS_TENANT_ID) ?? '';
}

/** User id from CLS, or '' when no context. */
export function clsUserId(): string {
  return clsGet(CLS_USER_ID) ?? '';
}

/** User role (CosRole) from CLS, or '' when no context. */
export function clsUserRole(): string {
  return clsGet(CLS_USER_ROLE) ?? '';
}

/** Dedicated DB URL from CLS (enterprise tenants), or undefined. */
export function clsDedicatedDbUrl(): string | undefined {
  return clsGet(CLS_DEDICATED_DB_URL);
}
