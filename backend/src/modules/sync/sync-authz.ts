// Role requirements for the offline-sync surface (§17.5; ADR-056).
//
// WHY THIS FILE EXISTS
// --------------------
// Sync is a second entry point into domain services that the REST controllers already gate with
// `@Roles(...)`. `SyncService.push()` calls SiteOpsService / SafetyService / WorkforceService /
// AnnotationService DIRECTLY, and none of those services carry a role check of their own — the
// authorization lives entirely in the controller decorator. So a controller that only mounted
// `JwtAuthGuard` handed every authenticated tenant user the write surface of every role, and
// `/sync/delta` returned incidents, attendance logs and site reports to callers whom the equivalent
// GET endpoints deny.
//
// Each entry below MIRRORS the roles the equivalent REST route enforces TODAY, so the two paths grant
// exactly the same thing. This file closes a bypass; it does not re-decide policy. Changing what a
// role may do belongs in the REST controller, and this file should follow it.
//
// The endpoint-level source of truth is 14-api-architecture.md (its per-route "Auth" column), which
// the controllers implement. 06-rbac-permission-matrix.md §6.4/§6.8 is module-level and coarser; where
// the two disagree, §14 is the one the code follows — see the note on `safety`.
//
// Keep in sync with:
//   site-ops.controller.ts, safety.controller.ts, tasks.controller.ts, workforce.controller.ts

import { CosRole } from '@cos/types';

// site-ops.controller.ts — POST /site/reports, /site/reports/sync, /site/issues, /site/*/materials
const FIELD_WRITE_ROLES = [
  CosRole.SITE_WORKER,
  CosRole.SITE_ENGINEER,
  CosRole.PROJECT_MANAGER,
  CosRole.TENANT_ADMIN,
] as const;

// site-ops.controller.ts — GET /site/reports
const SITE_REPORT_READ_ROLES = [
  CosRole.SITE_WORKER,
  CosRole.SITE_ENGINEER,
  CosRole.PROJECT_MANAGER,
  CosRole.EXECUTIVE,
  CosRole.TENANT_ADMIN,
] as const;

// site-ops.controller.ts — GET /site/issues
const ISSUE_READ_ROLES = [
  CosRole.SITE_WORKER,
  CosRole.SITE_ENGINEER,
  CosRole.PROJECT_MANAGER,
  CosRole.EXECUTIVE,
  CosRole.SAFETY_OFFICER,
  CosRole.TENANT_ADMIN,
] as const;

// tasks.controller.ts — TASK_READ_ROLES / TASK_WRITE_ROLES
const TASK_READ_ROLES = [
  CosRole.EXECUTIVE,
  CosRole.PROJECT_MANAGER,
  CosRole.SITE_ENGINEER,
  CosRole.SITE_WORKER,
  CosRole.TENANT_ADMIN,
] as const;
const TASK_WRITE_ROLES = FIELD_WRITE_ROLES;

// safety.controller.ts — SAFETY_READ_ROLES and POST /safety/incidents.
//
// SITE_WORKER is absent from both, and that is CORRECT per 14-api-architecture §Safety APIs:
//   POST /api/v1/safety/incidents  → "Site Engineer, Safety, Admin"
//   GET  /api/v1/safety/incidents  → "Exec, PM, SE, Safety, Admin"
// Neither lists Site Worker. The controller implements §14 exactly.
//
// UNRESOLVED SPEC CONFLICT: 06-rbac-permission-matrix §6.8 grants SITE_WORKER `RW` on the "Safety
// incidents" module, which contradicts both §14 rows above. This is a documentation conflict between
// two specs, NOT code drifting from spec — so it is not resolved in code. If §6.8 is the intended
// policy, the fix is to add SITE_WORKER to safety.controller.ts first; this file then follows.
const SAFETY_READ_ROLES = [
  CosRole.EXECUTIVE,
  CosRole.PROJECT_MANAGER,
  CosRole.SITE_ENGINEER,
  CosRole.SAFETY_OFFICER,
  CosRole.TENANT_ADMIN,
] as const;
const SAFETY_WRITE_ROLES = [
  CosRole.SITE_ENGINEER,
  CosRole.SAFETY_OFFICER,
  CosRole.TENANT_ADMIN,
] as const;

// site-ops.controller.ts — POST /site/inspections
const INSPECTION_WRITE_ROLES = SAFETY_WRITE_ROLES;

// workforce.controller.ts — POST /workers/{id}/attendance (14-api-architecture §Workforce APIs:
// "PM, Site Engineer"; TENANT_ADMIN is FULL on Workforce attendance per the §6.4 matrix).
const ATTENDANCE_WRITE_ROLES = [
  CosRole.PROJECT_MANAGER,
  CosRole.SITE_ENGINEER,
  CosRole.TENANT_ADMIN,
] as const;

/**
 * Roles allowed to PUSH each entity type. An entity type absent from this map carries no role
 * requirement beyond authentication.
 *
 * `photo_annotation` used to be absent — authentication only, no role gate — because no spec stated a
 * write role for it and inferring one would have been inventing policy. 14-api-architecture §Files APIs
 * now states it outright (product-owner decision 2026-08-04): Site Worker, Site Engineer, PM, Tenant
 * Admin, i.e. the same FIELD_WRITE_ROLES as the other field-editable entities routed through
 * `/sync/push`. Reads stay unrestricted, matching the `GET /files/{id}/annotation` row, so
 * `writeNeverWiderThanRead` holds trivially and the pair is asserted below.
 */
export const PUSH_ROLES: Readonly<Record<string, readonly CosRole[]>> = Object.freeze({
  task: TASK_WRITE_ROLES,
  site_report: FIELD_WRITE_ROLES,
  issue: FIELD_WRITE_ROLES,
  attendance: ATTENDANCE_WRITE_ROLES,
  safety: SAFETY_WRITE_ROLES,
  material: FIELD_WRITE_ROLES,
  inspection: INSPECTION_WRITE_ROLES,
  photo_annotation: FIELD_WRITE_ROLES,
});

/**
 * Roles allowed to READ each entity type through `/sync/delta`.
 *
 * `attendance` is absent because 14-api-architecture §Workforce APIs marks
 * `GET /workers/{id}/attendance` as "Any role" — matching the REST path means no restriction.
 *
 * `material` has NO read route in the spec at all (§Site APIs defines only
 * `POST /site/reports/{id}/materials`), so there is nothing to mirror 1:1. It is bound to the
 * site-report read roles instead, which enforces the invariant that a child record is never more
 * visible than its parent: a material line cannot be pulled by a role that cannot pull the report it
 * belongs to. That bound is the tightest defensible one — deriving it from the parent rather than
 * inventing a role list — and `syncAuthzInvariants` below locks it so the two cannot drift apart.
 */
export const DELTA_ROLES: Readonly<Record<string, readonly CosRole[]>> = Object.freeze({
  task: TASK_READ_ROLES,
  site_report: SITE_REPORT_READ_ROLES,
  issue: ISSUE_READ_ROLES,
  safety: SAFETY_READ_ROLES,
  material: SITE_REPORT_READ_ROLES,
});

/**
 * Structural invariants this table must satisfy. Asserted by the unit tests rather than at runtime,
 * so a future edit that breaks one fails CI instead of shipping.
 *
 * They exist because `material` has no spec route of its own: without a check, someone could widen
 * its read roles independently and hand out material lines to a role that cannot read the parent
 * report — the exact drift the derivation above is meant to prevent.
 */
export const syncAuthzInvariants = {
  /** No entity may be readable by a role that cannot read the record it hangs off. */
  childNeverWiderThanParent: [{ child: 'material', parent: 'site_report' }] as const,
  /** Writing an entity must not be granted more widely than reading it. */
  writeNeverWiderThanRead: [
    'task',
    'site_report',
    'issue',
    'safety',
    'material',
    // Reads are unrestricted (no DELTA_ROLES entry, matching "Any role" on GET /files/{id}/annotation),
    // so this pair passes trivially today. It is listed anyway so that narrowing annotation READS later
    // cannot silently leave writes wider than reads.
    'photo_annotation',
  ] as const,
};
