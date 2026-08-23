// platform.sync.exhausted.v1 — Phase 10 offline sync engine (spec §17.2)
//
// Emitted when a device has failed five times to deliver a queued mutation and has stopped
// retrying. The record still exists ON THE DEVICE — §17.2 requires it kept "until synced or
// admin-resolved" — so this event reports that delivery failed; it is not the record itself.
//
// It deliberately carries no payload BODY. The captured data goes to the review queue
// (platform.sync_exhausted_items), which a TENANT_ADMIN reads under RLS. Putting an incident's
// contents on the shared platform.events topic would spread one tenant's field data across a topic
// every tenant's consumers subscribe to.
import type { BaseEventEnvelope } from '@cos/types';

export interface SyncExhaustedPayload {
  /** The review-queue row this event reports — platform.sync_exhausted_items.item_id. */
  item_id: string;
  /** The queue's entity type, e.g. 'safety' — the same vocabulary /sync/push accepts. */
  entity_type: string;
  entity_id: string;
  operation: string;
  /** The device-generated id the mutation carried; unique per tenant. */
  client_id: string;
  retry_count: number;
  reported_by: string | null;
}

export type SyncExhaustedEvent = BaseEventEnvelope<SyncExhaustedPayload>;
