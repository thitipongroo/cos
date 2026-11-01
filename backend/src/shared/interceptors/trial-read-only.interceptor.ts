// TrialReadOnlyInterceptor — an ended free trial is read-only (spec §7.10, ADR-109).
//
// While the caller's tenant is EXPIRED or PENDING_DELETION, every request that is not GET / HEAD / OPTIONS is
// refused with 403 COS-PLAN-003 — in every module, including modules added later, with nothing for a controller
// to remember. The exceptions are opted in explicitly with @AllowWhileReadOnly(): authentication and session
// endpoints, and the data-subject rights (consent changes, data export) that PDPA §19, §30 and §31 never let a
// controller withhold.
//
// AN INTERCEPTOR, NOT A GUARD OR MIDDLEWARE. The tenant is resolved by KeycloakJwtStrategy.validate() during
// JwtAuthGuard, a route-level guard; middleware and global guards both run before it and never see req.user.
// Interceptors run after every guard, so this sees the same request TenantContextInterceptor does. It costs no
// query: subscription_status comes back from the tenant lookup validate() already runs on every request.
//
// Unauthenticated routes have no req.user and pass untouched. Behind the s1.tenant.trial-lifecycle flag (QM-15):
// OFF, nothing is refused.

import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Observable } from 'rxjs';
import type { AuthenticatedUser } from '../context/jwt-payload';
import { FeatureFlagService } from '../feature-flags/feature-flag.service';

/** QM-15 flag for the trial lifecycle: this interceptor and the daily job (ADR-109). New feature, default OFF. */
export const TRIAL_LIFECYCLE_FLAG = 's1.tenant.trial-lifecycle';

/** docs/api/error-codes.md § COS-PLAN. */
export const TRIAL_READ_ONLY_CODE = 'COS-PLAN-003';

/** The subscription states in which a tenant may read but not write (§7.10). */
export const READ_ONLY_STATUSES: ReadonlySet<string> = new Set(['EXPIRED', 'PENDING_DELETION']);

const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

export const ALLOW_WHILE_READ_ONLY_KEY = 'cos:allow-while-read-only';

/**
 * Lets a write through while the tenant is read-only. For authentication / session endpoints and data-subject
 * rights only (§7.10) — anything else is a hole in the commitment that an ended trial cannot change data.
 */
export const AllowWhileReadOnly = (): MethodDecorator & ClassDecorator =>
  SetMetadata(ALLOW_WHILE_READ_ONLY_KEY, true);

@Injectable()
export class TrialReadOnlyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly flags: FeatureFlagService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest<{ method?: string; user?: AuthenticatedUser }>();
    const status = req.user?.subscriptionStatus;
    if (
      !status ||
      !READ_ONLY_STATUSES.has(status) ||
      SAFE_METHODS.has((req.method ?? '').toUpperCase())
    ) {
      return next.handle();
    }

    const allowed = this.reflector.getAllAndOverride<boolean | undefined>(
      ALLOW_WHILE_READ_ONLY_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (allowed) return next.handle();

    const tenantId = req.user!.tenant_id;
    if (!this.flags.isEnabled(TRIAL_LIFECYCLE_FLAG, { tenantId, userId: req.user!.user_id })) {
      return next.handle();
    }

    throw new ForbiddenException({
      error: {
        code: TRIAL_READ_ONLY_CODE,
        message: 'Your free trial has ended. The account is read-only until a plan is chosen.',
        messageKey: 'trial.error.readOnly',
        details: { subscription_status: status },
      },
    });
  }
}
