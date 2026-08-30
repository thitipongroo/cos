// PolicyGuard — enforces ABAC rules (project_membership, tenant_match, resource_ownership).
// Default ABAC covers MVP. Swap advanced policy via EP-AUTH-001.
//
// Wired into the tenant-scoped feature controllers (boq, crm, master-data, procurement, safety,
// site-ops, tasks, finance) as defense-in-depth (security review L2). It is NOT the primary
// cross-tenant control — PostgreSQL RLS is (ADR-008 / the H1 fix). It is deliberately NOT applied to
// the SYSTEM_ADMIN cross-tenant routes in tenant.controller (`:tenantId` path param), where an admin
// legitimately operates on another tenant and tenant_match would wrongly block it.

import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { createLogger } from '@cos/logger';
import { JwtPayload } from '../context/jwt-payload';

const logger = createLogger('policy-guard');

export interface ResourceContext {
  tenantId?: string;
  ownerId?: string;
  projectId?: string;
}

@Injectable()
export class PolicyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      user?: JwtPayload;
      params?: Record<string, string>;
      tenantId?: string;
    }>();

    const user = request.user;
    if (!user) return false;

    // 1. tenant_match — request tenant must match JWT tenant
    const requestTenantId = request.tenantId ?? request.params?.['tenantId'];
    if (requestTenantId && requestTenantId !== user.tenant_id) {
      logger.warn(
        { userId: user.user_id, requestTenantId, jwtTenantId: user.tenant_id },
        'Cross-tenant access attempt blocked',
      );
      throw new ForbiddenException('Cross-tenant access is not allowed');
    }

    // 2. project_membership and resource_ownership are enforced in service layer
    //    (requires DB query — guard enforces what can be checked from JWT alone)

    return true;
  }
}
