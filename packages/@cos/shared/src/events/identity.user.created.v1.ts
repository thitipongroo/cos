// Canonical event: identity.user.created.v1

import { BaseEventEnvelope } from '@cos/types';

export interface UserCreatedPayload {
  tenant_id: string; // UUID
  user_id: string; // UUID
  // @pdpa: email is PII — included for downstream provisioning only
  email: string;
  role: string; // CosRole value
}

export type UserCreatedEvent = BaseEventEnvelope<UserCreatedPayload>;
