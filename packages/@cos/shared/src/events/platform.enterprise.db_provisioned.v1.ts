// Canonical event: platform.enterprise.db_provisioned.v1
// Source: context/00_master_construction_os.md §Phase 2 Kafka events
// Emitted by: EnterpriseProvisioningWorkflow after verifyRoutingActivity passes (Phase 25)

import { BaseEventEnvelope } from '@cos/types';

export interface EnterpriseDbProvisionedPayload {
  tenant_id: string; // UUID
  tenant_name: string; // §19.8 notification content renders {tenant_name}
  tenant_code: string; // §19.8 notification content renders {tenant_code}
  rds_endpoint: string; // e.g. cos-tenant-acme-prod.xxx.rds.amazonaws.com
}

export type EnterpriseDbProvisionedEvent = BaseEventEnvelope<EnterpriseDbProvisionedPayload>;
