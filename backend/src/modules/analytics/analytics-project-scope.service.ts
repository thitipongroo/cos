// ABAC project scoping for the analytics dashboards (06-rbac-permission-matrix §6.5).
//
// RBAC (§6.4) decides WHICH dashboard a role may open; it does not decide WHICH projects that role
// may see inside it. §6.5 supplies the second half:
//
//   "Project scope: a PM can only read/write entities within projects they are assigned to"
//
// The analytics endpoints take `projectIds` straight from the query string, so without this a
// PROJECT_MANAGER could read committed cost, budget variance and overdue-invoice totals for any
// project in the tenant simply by passing its UUID — including projects they were never assigned to.
//
// SCOPE OF THIS FILE — deliberately narrow. §6.5 names the PM and only the PM, so only
// PROJECT_MANAGER is filtered here. EXECUTIVE and TENANT_ADMIN hold FULL on the Executive dashboard
// row in §6.4 (§6.3: "full access including configuration"), which is tenant-wide by definition, and
// FINANCE holds `R` with no §6.5 rule naming it. Extending the filter to a role the spec does not
// place under project scope would be inventing policy, so roles other than PROJECT_MANAGER pass
// through untouched. If Finance should also be project-scoped, add it to PROJECT_SCOPED_ROLES.

import { Injectable } from '@nestjs/common';
import { CosRole } from '@cos/types';
import { createLogger } from '@cos/logger';
import { TenantPrismaService } from '../tenant/prisma/tenant-prisma.service';
import { clsUserId, clsUserRole } from '../../shared/context/cls-context';

const logger = createLogger('analytics-project-scope');

/** Roles §6.5 places under project scope. Everything else is tenant-wide within its §6.4 grant. */
const PROJECT_SCOPED_ROLES: readonly string[] = [CosRole.PROJECT_MANAGER];

@Injectable()
export class AnalyticsProjectScopeService {
  constructor(private readonly db: TenantPrismaService) {}

  /**
   * Narrow `requestedProjectIds` to those the caller may actually see.
   *
   * Returns the input unchanged for roles that are not project-scoped. For a PROJECT_MANAGER it
   * returns the intersection with `projects.project_members`, logging anything dropped — a dashboard
   * that quietly answers for fewer projects than were asked for must be visible in the logs.
   */
  async filterVisibleProjectIds(requestedProjectIds: string[]): Promise<string[]> {
    const role = clsUserRole();
    if (!PROJECT_SCOPED_ROLES.includes(role)) {
      return requestedProjectIds;
    }
    if (requestedProjectIds.length === 0) {
      return requestedProjectIds;
    }

    const userId = clsUserId();
    if (!userId) {
      // Project-scoped role with no resolvable identity: nothing can be proven visible, so show
      // nothing. Failing open here would hand a PM the whole tenant.
      logger.warn(
        { role },
        'analytics.project-scope: no user id in context — denying all projects',
      );
      return [];
    }

    // RLS already confines this to the caller's tenant; the tenant predicate is spelled out anyway to
    // match every other repository in the codebase.
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<Array<{ project_id: string }>>`
        SELECT m.project_id
          FROM projects.project_members m
         WHERE m.user_id = ${userId}::uuid
           AND m.project_id = ANY(${requestedProjectIds}::uuid[])
           AND m.tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid
      `,
    );

    const visible = new Set(rows.map((r) => r.project_id));
    const allowed = requestedProjectIds.filter((id) => visible.has(id));
    const denied = requestedProjectIds.filter((id) => !visible.has(id));
    if (denied.length > 0) {
      logger.warn(
        { userId, role, denied, allowed },
        'analytics.project-scope: dropped projects the caller is not assigned to',
      );
    }
    return allowed;
  }
}
