// Which notification types a role may configure, and how they group.
//
// TWO SPEC SECTIONS DECIDE THIS, ONE EACH:
//
//   - WHO SEES A TYPE — `19-notification-architecture.md` §19.4 "Role-to-Notification Routing", the
//     matrix of event × role. Authoritative: where §19.4 gives an event a row, that row is the
//     answer and nothing else narrows or widens it (PO decision 2026-08-14, choosing §19.4 as
//     written over a wider verbal mapping).
//   - HOW TYPES GROUP — §19.3 "Notification Types" and DESIGN.md §10.2, which agree: Immediate
//     (real-time) · Digest (scheduled) · Escalation (threshold-triggered). A DELIVERY-TIMING axis.
//     `mockup/mobile/02_shared/03_account_settings` drew a topical grouping instead — ความปลอดภัย /
//     งานประจำวัน / วัสดุและอุปกรณ์ — and four of the six real event types mapped to no group it drew.
//     The drawing decided what a group LOOKS like (see NotificationSettings.tsx); the spec decides
//     which groups there are. That drawing was WITHDRAWN on 2026-08-16 — it does not change either
//     half of this: the spec side never depended on it, and the style side is recorded in
//     NotificationSettings.tsx (ADR-085 — a withdrawn drawing does not un-make reviewed work).
//
// §19.4 HAS NO TENANT_ADMIN COLUMN. Its columns are Executive · PM · Site Engineer · Procurement ·
// Finance · Safety Officer · CRM/Sales. TENANT_ADMIN therefore configures none of these types here;
// its own panel is `/notification-preferences`, reached from that role's Settings tab.
//
// WHERE §19.4 IS SILENT, NOTHING IS HIDDEN. Two of the six have no §19.4 row:
// `site.report.created.v1` (§19.3 files the daily site summary under Digest, which §19.4 does not
// route) and `procurement.po.approval_requested.v1` (§19.4's nearest row, PurchaseApproved, is a
// DIFFERENT event — "a PO was approved", not "a PO needs your approval"). Rather than invent a row,
// they stay visible to every role: a preference a user cannot see is one they cannot turn off.
// Flagged `specSilent` so the gap is visible in code rather than implied by an absence.

import { CosRole } from '@cos/types';

/**
 * `'HH:MM:SS'` (what the preference API stores) → `'HH:MM'` (what a quiet-hours window shows).
 *
 * Lives here rather than in the component because `src/lib` is what the coverage gate measures — a
 * regex nobody exercises is where an off-by-one hides. Anything that does not start with HH:MM is
 * returned untouched: showing the stored value is more honest than showing nothing.
 */
export function toHhMm(value: string): string {
  const m = /^(\d{2}):(\d{2})/.exec(value);
  return m ? `${m[1]}:${m[2]}` : value;
}

/** §19.3 / DESIGN.md §10.2 delivery-timing groups, in the order those sections list them. */
export const NOTIFICATION_GROUPS = ['IMMEDIATE', 'DIGEST', 'ESCALATION'] as const;
export type NotificationGroup = (typeof NOTIFICATION_GROUPS)[number];

export interface NotificationType {
  /** Canonical event type — the key the preference API stores against. */
  eventType: string;
  labelKey: string;
  descKey: string;
  group: NotificationGroup;
  /** §19.4 routing. `null` = §19.4 has no row; shown to everyone rather than hidden on a guess. */
  roles: readonly CosRole[] | null;
  /** §19.6: "Critical safety notifications cannot be disabled." Rendered locked-on, never a switch. */
  locked?: boolean;
  /** True where `roles` is null — the spec is silent, not permissive by design. */
  specSilent?: boolean;
}

const { EXECUTIVE, PROJECT_MANAGER, SITE_ENGINEER, FINANCE, SAFETY_OFFICER } = CosRole;

/** The six types the preference API persists, each with its §19.4 row and §19.3 group. */
export const NOTIFICATION_TYPES: readonly NotificationType[] = [
  {
    // §19.4 SafetyIncidentReported — Executive In-app · PM Push · Site Engineer In-app · Safety Push
    eventType: 'safety.incident.created.v1',
    labelKey: 'notifications.preferences.events.safety.label',
    descKey: 'notifications.preferences.events.safety.desc',
    group: 'IMMEDIATE',
    roles: [EXECUTIVE, PROJECT_MANAGER, SITE_ENGINEER, SAFETY_OFFICER],
    locked: true,
  },
  {
    // §19.4 InspectionFailed — PM In-app · Site Engineer Push · Safety Officer In-app
    eventType: 'site.inspection.failed.v1',
    labelKey: 'notifications.preferences.events.inspectionFailed.label',
    descKey: 'notifications.preferences.events.inspectionFailed.desc',
    group: 'IMMEDIATE',
    roles: [PROJECT_MANAGER, SITE_ENGINEER, SAFETY_OFFICER],
  },
  {
    // §19.4 BudgetExceeded — Executive Push · PM Push · Finance Push
    eventType: 'finance.variance.alert.v1',
    labelKey: 'notifications.preferences.events.budgetVariance.label',
    descKey: 'notifications.preferences.events.budgetVariance.desc',
    group: 'IMMEDIATE',
    roles: [EXECUTIVE, PROJECT_MANAGER, FINANCE],
  },
  {
    // §19.4 RiskPredictionGenerated — Executive Push · PM Push
    eventType: 'ai.risk_prediction.generated.v1',
    labelKey: 'notifications.preferences.events.riskPrediction.label',
    descKey: 'notifications.preferences.events.riskPrediction.desc',
    group: 'IMMEDIATE',
    roles: [EXECUTIVE, PROJECT_MANAGER],
  },
  {
    // §19.4 is silent — its PurchaseApproved row is a different event (approved ≠ approval requested).
    eventType: 'procurement.po.approval_requested.v1',
    labelKey: 'notifications.preferences.events.poApproval.label',
    descKey: 'notifications.preferences.events.poApproval.desc',
    group: 'IMMEDIATE',
    roles: null,
    specSilent: true,
  },
  {
    // §19.3 files the daily site summary under Digest; §19.4 routes no such row.
    eventType: 'site.report.created.v1',
    labelKey: 'notifications.preferences.events.dailyReport.label',
    descKey: 'notifications.preferences.events.dailyReport.desc',
    group: 'DIGEST',
    roles: null,
    specSilent: true,
  },
];

/** The types `role` may configure, in display order. A session with no role configures none. */
export function notificationTypesFor(
  role: CosRole | null | undefined,
): readonly NotificationType[] {
  if (role == null) return [];
  return NOTIFICATION_TYPES.filter((type) => type.roles === null || type.roles.includes(role));
}

export interface NotificationSection {
  group: NotificationGroup;
  types: readonly NotificationType[];
}

/**
 * The role's types split into §19.3 groups, empty groups dropped.
 *
 * A heading with nothing under it is noise — and DESIGN.md §2.5 makes "a heading is stated once" a
 * rule, not a preference.
 */
export function notificationSectionsFor(
  role: CosRole | null | undefined,
): readonly NotificationSection[] {
  const types = notificationTypesFor(role);
  return NOTIFICATION_GROUPS.map((group) => ({
    group,
    types: types.filter((type) => type.group === group),
  })).filter((section) => section.types.length > 0);
}
