// Canonical event: platform.tenant.trial_started.v1
// Source: docs/specifications/07-multi-tenant-architecture.md §7.10 (Trial Tenant Lifecycle); ADR-109
// Emitted by: TenantService.createTrialTenant (SYSTEM_ADMIN, POST /admin/tenants/trial)
// — through the outbox, in the same transaction as the status change.
//
// Platform-scope: the envelope's tenant_id is the 'platform' sentinel and the tenant is named in the payload, so the
// event rides the shared platform.events topic for analytics and CRM (§7.10). It is not a tenant-scoped event.

import type { BaseEventEnvelope } from '@cos/types';

/** A free-trial tenant was opened (TRIAL). */
export interface TenantTrialStartedPayload {
  tenant_id: string; // UUID of the trial tenant
  tenant_code: string;
  plan_type: 'LITE' | 'STARTER' | 'PROFESSIONAL'; // The plan being trialled
  trial_started_at: string; // ISO 8601
  trial_ends_at: string; // ISO 8601 — trial_started_at + 30 days
  trial_source: string | null; // construction-os.io CTA the request came from
}

export type TenantTrialStartedEvent = BaseEventEnvelope<TenantTrialStartedPayload>;
