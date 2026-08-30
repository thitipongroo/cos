// Canonical event: safety.compliance.failed.v1
// Source: 19-notification-architecture §19.6 (un-disableable), 16-enterprise-event-flow §16,
//         20-ux-flow §20.2 "Violation alerts". Catalogued at 32-implementation-specifications §32.4.
//
// Built 2026-08-22 (TDD OQ-35). Before that the name appeared in §19.6 and §16 and NOWHERE else — no
// producer, no consumer, no catalogue entry — so §19.6's "critical safety notifications cannot be
// disabled" referred to a set of unknown size.
//
// Two producers, both deterministic:
//   PERMIT_EXPIRED        — PermitExpiryService's hourly sweep, which also transitions the permit
//                           ACTIVE → EXPIRED (nothing did that before, so task completion gate #4
//                           never blocked on an expired permit).
//   CHECKLIST_ITEM_FAILED — SiteOpsService.submitInspection, on a FAILED safety checklist.
//
// PPE_NON_COMPLIANCE is deliberately absent: §22.6's SafetyVisionModel is the eventual third
// producer, and it is untrained (Phase 23 gates it on 10,000+ labelled site photos). Adding the
// symbol before anything can emit it would put a value in the contract that no consumer can ever see.

import { BaseEventEnvelope } from '@cos/types';

export type SafetyComplianceFailureType = 'PERMIT_EXPIRED' | 'CHECKLIST_ITEM_FAILED';

export interface SafetyComplianceFailedPayload {
  failure_type: SafetyComplianceFailureType;
  project_id: string;
  detected_by: 'PERMIT_EXPIRY_SWEEP' | 'CHECKLIST_SUBMISSION';
  detail: string;

  // PERMIT_EXPIRED only
  permit_id?: string | null;
  permit_number?: string | null;
  permit_type?: string | null;
  linked_task_id?: string | null;

  // CHECKLIST_ITEM_FAILED only
  inspection_id?: string | null;
  checklist_id?: string | null;
  failed_item_count?: number | null;
}

export type SafetyComplianceFailedEvent = BaseEventEnvelope<SafetyComplianceFailedPayload>;
