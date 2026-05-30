// EP-AUTH-001: AdvancedABACPolicy
// Source: context/00_master_construction_os.md §Phase 2 Extension points
// Trigger: enterprise customer requires custom attribute rules beyond default ABAC
// Default ABAC (project_membership, tenant_match, resource_ownership) is implemented
// in PolicyGuard — this EP activates when rules become configurable per tenant.

import { StubBase } from '../stub-base';

export interface ResourceContext {
  tenantId: string;
  resourceType: string;
  resourceId?: string;
  ownerId?: string;
  projectId?: string;
  attributes?: Record<string, unknown>;
}

export interface JwtPayloadMinimal {
  cos_user_id: string;
  cos_tenant_id: string;
  cos_role: string;
  [key: string]: unknown;
}

export class AdvancedABACPolicy extends StubBase {
  readonly EP_ID = 'EP-AUTH-001';
  readonly EP_VERSION = '0.1.0';
  readonly TRIGGER = 'Enterprise customer requires configurable per-tenant ABAC rules beyond default project_membership + tenant_match + resource_ownership';
  readonly PHASE = 'Phase 2';

  async evaluate(
    _user: JwtPayloadMinimal,
    _resource: ResourceContext,
    _action: string,
  ): Promise<boolean> {
    this.logStubCall('evaluate', { action: _action, resourceType: _resource.resourceType });
    // Default: allow (PolicyGuard enforces built-in ABAC before this EP is called)
    return true;
  }
}
