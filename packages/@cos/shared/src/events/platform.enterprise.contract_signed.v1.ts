// Canonical event: platform.enterprise.contract_signed.v1
// Source: context/00_master_construction_os.md §Phase 2 Kafka events
// Triggered by: Admin Panel OR CRM webhook (Phase 25)

import type { BaseEventEnvelope } from '@cos/types';

export interface EnterpriseContractSignedPayload {
  tenant_id: string; // UUID
  tenant_name: string; // §19.8 notification content renders {tenant_name}
  tenant_code: string; // §19.8 notification content renders {tenant_code}
  contract_reference?: string | null; // External contract ID from CRM or contract system
}

export type EnterpriseContractSignedEvent = BaseEventEnvelope<EnterpriseContractSignedPayload>;
