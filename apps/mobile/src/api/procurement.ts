// Procurement API (mobile) — raising a material requisition from site.
//
// SITE_ENGINEER holds RW on purchase requests (06-rbac-permission-matrix "Purchase requests"), which
// is why this exists on the field app at all.

import { mutate, type QueuedResult } from './client';

export interface PurchaseRequestItem {
  description: string;
  quantity: number;
  unit: string;
}

export interface PurchaseRequest {
  pr_id: string;
  pr_number: string;
  project_id: string;
  status: string;
  required_date: string | null;
}

/**
 * Raise a purchase request. `pr_number` is intentionally not sent — the server allocates it.
 *
 * Queued via mutate() when offline: a material shortage is noticed on site, which is exactly where
 * there is no signal, and the request replays on reconnect (§17).
 */
export async function createPurchaseRequest(params: {
  projectId: string;
  requiredDate?: string;
  items: PurchaseRequestItem[];
}): Promise<PurchaseRequest | QueuedResult> {
  return mutate<PurchaseRequest>(
    'POST',
    '/procurement/purchase-requests',
    {
      project_id: params.projectId,
      required_date: params.requiredDate,
      items: params.items,
    },
    'purchase-request',
    // No server id yet — the queue key is the project, so two requests raised offline for the same
    // project stay distinct rows in the outbox rather than overwriting one another.
    `${params.projectId}:${params.items[0]?.description ?? ''}`,
  );
}
