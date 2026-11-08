// Canonical event: platform.tenant.trial_expired.v1
// Source: docs/specifications/07-multi-tenant-architecture.md §7.10 (Trial Tenant Lifecycle); ADR-109
// Emitted by: TrialLifecycleService (daily job, actor 'system')
// — through the outbox, in the same transaction as the status change.
//
// Platform-scope: the envelope's tenant_id is the 'platform' sentinel and the tenant is named in the payload, so the
// event rides the shared platform.events topic for analytics and CRM (§7.10). It is not a tenant-scoped event.

import type { BaseEventEnvelope } from '@cos/types';

/** trial_ends_at passed without conversion: TRIAL -> EXPIRED (read-only). */
export interface TenantTrialExpiredPayload {
  tenant_id: string;
  tenant_code: string;
  plan_type: 'LITE' | 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';
  trial_ends_at: string; // ISO 8601
}

export type TenantTrialExpiredEvent = BaseEventEnvelope<TenantTrialExpiredPayload>;
