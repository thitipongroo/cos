// Canonical event: identity.user.role_changed.v1

import type { BaseEventEnvelope } from '@cos/types';

export interface UserRoleChangedPayload {
  tenant_id: string; // UUID
  user_id: string; // UUID
  old_role: string; // CosRole value
  new_role: string; // CosRole value
}

export type UserRoleChangedEvent = BaseEventEnvelope<UserRoleChangedPayload>;
