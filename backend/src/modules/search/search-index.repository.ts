// Reads the rows the search indexer projects into OpenSearch (TDD OQ-22).
//
// The event that triggers indexing carries an id, not a document. Rebuilding the index entry from
// the event payload would need every indexed field in every payload — `construction.project.updated.v1`
// carries only `changed_fields`, `site.issue.created.v1` has no `status` — so the payloads would have
// to grow, each with an Avro schema change, and the index would still be a projection of what the
// event happened to say rather than of what the row is. Reading the row instead means a replayed
// event indexes CURRENT state, which is what makes replaying one a repair.
//
// A singleton, not Scope.REQUEST: there is no request. The tenant comes from the CLS context the
// consumer enters (runInTenantContext), which is the same context TenantPrismaService reads, so RLS
// applies here exactly as it does on the HTTP path.

import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/prisma/tenant-prisma.service';
import { clsTenantId } from '../../shared/context/cls-context';

export interface ProjectIndexRow {
  project_id: string;
  tenant_id: string;
  project_code: string;
  project_name: string;
  project_type: string;
  status: string;
  updated_at: Date;
}

export interface SiteReportIndexRow {
  report_id: string;
  project_id: string;
  tenant_id: string;
  report_date: string;
  summary: string | null;
  weather: string | null;
  submitted_by: string;
  status: string;
}

export interface IssueIndexRow {
  issue_id: string;
  project_id: string;
  tenant_id: string;
  title: string;
  description: string | null;
  severity: string;
  status: string;
}

@Injectable()
export class SearchIndexRepository {
  constructor(private readonly db: TenantPrismaService) {}

  // RLS is the primary control and TenantPrismaService has already set app.current_tenant_id.
  // The predicate below is the SECONDARY layer §7.7 asks every query to carry as well — the same
  // one whose absence would have made finance.wht_rules readable across tenants when its policy
  // turned out to be missing (20260822000001).
  private get tenantId(): string {
    return clsTenantId();
  }

  async findProject(projectId: string): Promise<ProjectIndexRow | null> {
    const rows = await this.db.run(async (prisma) => {
      return prisma.$queryRaw<ProjectIndexRow[]>`
        SELECT project_id, tenant_id, project_code, project_name, project_type, status, updated_at
        FROM projects.projects
        WHERE project_id = ${projectId}::uuid
          AND tenant_id = ${this.tenantId}::uuid
      `;
    });
    return rows[0] ?? null;
  }

  async findSiteReport(reportId: string): Promise<SiteReportIndexRow | null> {
    const rows = await this.db.run(async (prisma) => {
      return prisma.$queryRaw<SiteReportIndexRow[]>`
        SELECT report_id, project_id, tenant_id, report_date, summary, weather, submitted_by, status
        FROM site_ops.site_reports
        WHERE report_id = ${reportId}::uuid
          AND tenant_id = ${this.tenantId}::uuid
      `;
    });
    return rows[0] ?? null;
  }

  async findIssue(issueId: string): Promise<IssueIndexRow | null> {
    const rows = await this.db.run(async (prisma) => {
      return prisma.$queryRaw<IssueIndexRow[]>`
        SELECT issue_id, project_id, tenant_id, title, description, severity, status
        FROM site_ops.issues
        WHERE issue_id = ${issueId}::uuid
          AND tenant_id = ${this.tenantId}::uuid
      `;
    });
    return rows[0] ?? null;
  }
}
