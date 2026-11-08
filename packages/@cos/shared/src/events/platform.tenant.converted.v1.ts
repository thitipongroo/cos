// Canonical event: platform.tenant.converted.v1
// Source: docs/specifications/07-multi-tenant-architecture.md §7.10 (Trial Tenant Lifecycle); ADR-109
// Emitted by: TenantService.convertTenant (SYSTEM_ADMIN, PATCH /admin/tenants/{id}/convert)
// — through the outbox, in the same transaction as the status change.
//
// Platform-scope: the envelope's tenant_id is the 'platform' sentinel and the tenant is named in the payload, so the
// event rides the shared platform.events topic for analytics and CRM (§7.10). It is not a tenant-scoped event.

import type { BaseEventEnvelope } from '@cos/types';

/** A trial tenant became a paying customer: TRIAL / EXPIRED / PENDING_DELETION -> ACTIVE. */
export interface TenantConvertedPayload {
  tenant_id: string;
  tenant_code: string;
  from_status: 'TRIAL' | 'EXPIRED' | 'PENDING_DELETION'; // Status before conversion
  from_plan: 'LITE' | 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE'; // Plan trialled
  plan_type: 'LITE' | 'STARTER' | 'PROFESSIONAL'; // Plan paid for
  converted_at: string; // ISO 8601
}

export type TenantConvertedEvent = BaseEventEnvelope<TenantConvertedPayload>;
