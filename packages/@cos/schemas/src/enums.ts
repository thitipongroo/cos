// Shared enum vocabularies for client-side form validation.
//
// Values are copied verbatim from apps/web/src/lib/api/types.ts, which mirrors the API contract.
// DESIGN.md §9.1 is explicit: "Do not invent states." If a value changes on the server, change it
// here and in types.ts together — a mismatch fails validation client-side before the API ever sees it.
//
// zod/mini (NOT the classic `zod` entry): the classic entry measures 64,996 B gzipped, which alone
// exceeds the /login bundle headroom the Lighthouse gate allows. zod/mini is 4,165 B. Because mini
// drops method chaining, use z.string().check(z.minLength(1)) rather than z.string().min(1).
import * as z from 'zod/mini';

/** Issue severity — apps/web/src/lib/api/types.ts `IssueSeverity`. */
export const ISSUE_SEVERITY = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

/** Issue lifecycle — `IssueStatus`. */
export const ISSUE_STATUS = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;

/** Safety-incident severity — `IncidentSeverity`. */
export const INCIDENT_SEVERITY = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

/** Inspection result — `InspectionStatus`. */
export const INSPECTION_STATUS = ['PENDING', 'PASSED', 'FAILED', 'REQUIRES_REINSPECTION'] as const;

/** Task lifecycle — `TaskStatus`. */
export const TASK_STATUS = [
  'NOT_STARTED',
  'IN_PROGRESS',
  'COMPLETED',
  'BLOCKED',
  'CANCELLED',
] as const;

/** Project lifecycle — `ProjectStatus`. */
export const PROJECT_STATUS = ['DRAFT', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'] as const;

/** Project type — `ProjectType`. */
export const PROJECT_TYPE = ['RESIDENTIAL', 'COMMERCIAL', 'INFRASTRUCTURE', 'INDUSTRIAL'] as const;

/** Risk category — `RiskCategory` (ADR-065). */
export const RISK_CATEGORY = [
  'SAFETY',
  'FINANCIAL',
  'SCHEDULE',
  'TECHNICAL',
  'EXTERNAL',
  'OTHER',
] as const;

/** Risk lifecycle — `RiskStatus` (ADR-065). */
export const RISK_STATUS = ['OPEN', 'MITIGATING', 'CLOSED', 'ACCEPTED'] as const;

// `error` is set on every enum: zod's default rejection message is the English string
// "Invalid input", which would reach the UI untranslated and break QM-3.
export const issueSeverity = z.enum(ISSUE_SEVERITY, { error: 'validation.invalidOption' });
export const issueStatus = z.enum(ISSUE_STATUS, { error: 'validation.invalidOption' });
export const incidentSeverity = z.enum(INCIDENT_SEVERITY, { error: 'validation.invalidOption' });
export const inspectionStatus = z.enum(INSPECTION_STATUS, { error: 'validation.invalidOption' });
export const taskStatus = z.enum(TASK_STATUS, { error: 'validation.invalidOption' });
export const projectStatus = z.enum(PROJECT_STATUS, { error: 'validation.invalidOption' });
export const projectType = z.enum(PROJECT_TYPE, { error: 'validation.invalidOption' });
export const riskCategory = z.enum(RISK_CATEGORY, { error: 'validation.invalidOption' });
export const riskStatus = z.enum(RISK_STATUS, { error: 'validation.invalidOption' });

/** Tenant plan — apps/web/src/lib/api/types.ts `PlanType`. */
export const PLAN_TYPE = ['STARTER', 'PROFESSIONAL', 'ENTERPRISE'] as const;

/**
 * Tenant roles — `CosRole` in @cos/types (spec §6.2 + §6.8 sub-roles).
 *
 * Copied rather than imported: @cos/schemas is consumed by apps/mobile through a `file:` dependency
 * (Metro does not follow symlinks), and adding a workspace dependency to it would have to be
 * mirrored there too. The same copy-and-pin arrangement the vocabularies above use — the test
 * asserts the exact list, so a drift fails CI rather than shipping.
 *
 * SYSTEM_ADMIN is deliberately absent: it is cross-tenant and is never provisioned to a tenant
 * (spec §6.7), so it must not be selectable in a tenant's user-create form.
 */
export const ASSIGNABLE_ROLE = [
  'TENANT_ADMIN',
  'EXECUTIVE',
  'PROJECT_MANAGER',
  'PROCUREMENT_OFFICER',
  'PROC_MANAGER',
  'FINANCE',
  'SAFETY_OFFICER',
  'SITE_ENGINEER',
  'SITE_WORKER',
  'CRM_SALES_MANAGER',
  'VIEWER',
] as const;

export const planType = z.enum(PLAN_TYPE, { error: 'validation.invalidOption' });
export const assignableRole = z.enum(ASSIGNABLE_ROLE, { error: 'validation.invalidOption' });
