// Enter a tenant CLS context outside the HTTP request pipeline.
//
// WHY THIS EXISTS (TDD OQ-45)
// ---------------------------
// TenantPrismaService — the only sanctioned way to reach a tenant-scoped table — resolves its tenant
// from CLS and from nowhere else:
//
//     const tenantId = clsTenantId();
//     if (!tenantId) throw new UnauthorizedException('Tenant context missing from request');
//
// JwtAuthGuard populates that context, so every HTTP path has one. A Kafka consumer does not. Its
// handler runs on an async chain rooted at `consumer.connect()` during bootstrap, which never passed
// through a guard, so `cls.isActive()` is false and the FIRST database call throws — verified
// directly against TenantPrismaService.
//
// FinanceConsumer and RisksConsumer both did exactly that. Passing the tenant through
// `moduleRef.registerRequestByContextId({ tenantId })` gives the request-scoped SERVICE a tenant, and
// reads like it is enough, but TenantPrismaService is a singleton that never looks at the request
// object — so FinanceConsumer.handlePoCreated → FinanceRepository.createTransaction → db.run() threw
// before writing a row, on every event. The same trap has been hit twice before in this codebase: see
// the headers of vendor-auth.guard.ts ("every vendor request died in db.run()") and
// privacy-inquiry.service.ts.
//
// So a consumer must enter CLS itself, the way data-export.activities.ts does for its Temporal
// activity. That is what this wraps — in one place, rather than three copies of `cls.run` plus a
// list of keys someone will forget one of.

import { ClsServiceManager } from 'nestjs-cls';
import { CLS_TENANT_ID, CLS_USER_ID, CLS_USER_ROLE } from './cls-context';

export interface TenantContext {
  tenantId: string;
  /** The event's actor, for repositories and audit columns that record who caused the write. */
  userId?: string;
  /** CosRole. Consumers act on behalf of the system, so callers that have no better answer omit it. */
  userRole?: string;
}

/**
 * Run `fn` with `ctx` published into CLS, so TenantPrismaService (and everything else reading
 * cls-context) resolves the tenant exactly as it does inside a request.
 *
 * `cls.run` and not `enterWith`: this scopes the context to the callback, so two events processed
 * concurrently cannot see each other's tenant. `enterWith` would leak the last one entered into the
 * surrounding async resource — which, for a consumer polling in a loop, means events processed under
 * the wrong tenant. That is a cross-tenant data fault, not a bug in the ordinary sense, so the
 * distinction is load-bearing.
 */
export async function runInTenantContext<T>(ctx: TenantContext, fn: () => Promise<T>): Promise<T> {
  const cls = ClsServiceManager.getClsService();
  return cls.run(async () => {
    cls.set(CLS_TENANT_ID, ctx.tenantId);
    if (ctx.userId) cls.set(CLS_USER_ID, ctx.userId);
    if (ctx.userRole) cls.set(CLS_USER_ROLE, ctx.userRole);
    return fn();
  });
}
