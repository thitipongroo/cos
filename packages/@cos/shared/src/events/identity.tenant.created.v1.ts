// Canonical event: identity.tenant.created.v1
// Source: context/00_master_construction_os.md §Phase 2 Kafka events

import { BaseEventEnvelope } from '@cos/types';

export interface TenantCreatedPayload {
  tenant_id: string;      // UUID
  tenant_code: string;
  tenant_name: string;
  plan_type: 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';
}

export type TenantCreatedEvent = BaseEventEnvelope<TenantCreatedPayload>;
