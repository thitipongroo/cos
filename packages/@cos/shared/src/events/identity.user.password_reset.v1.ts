// identity.user.password_reset.v1 — Phase 2 Authentication
// Emitted when a user's password is reset. Carries no credential material of any kind: the event
// records THAT a reset happened and who performed it, never what it was reset to.
// Shape mirrors src/avro/identity.user.password_reset.v1.avsc.
import type { BaseEventEnvelope } from '@cos/types';

export interface UserPasswordResetPayload {
  tenant_id: string;
  user_id: string;
  /** The actor who performed the reset — the user themselves, or an administrator. */
  reset_by: string;
  /** How it was reset, e.g. self-service or admin-initiated. */
  method: string;
}

export type UserPasswordResetEvent = BaseEventEnvelope<UserPasswordResetPayload>;
