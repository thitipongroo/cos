// Canonical event: identity.tenant.deactivated.v1

import { BaseEventEnvelope } from '@cos/types';

export interface TenantDeactivatedPayload {
  tenant_id: string; // UUID
}

export type TenantDeactivatedEvent = BaseEventEnvelope<TenantDeactivatedPayload>;
