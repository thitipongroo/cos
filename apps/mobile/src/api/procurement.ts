// Procurement API (mobile) — raising a material requisition from site, plus the two manager surfaces
// added 2026-08-10: the approvals queue and the vendor directory.
//
// SITE_ENGINEER holds RW on purchase requests (06-rbac-permission-matrix "Purchase requests"), which
// is why this file exists on the field app at all. The manager reads below are open to every role in
// the controller's READ_ROLES; what differs per role is which ACTIONS the screen offers, and that is
// decided in the screen from the RBAC matrix, not here.

import * as Crypto from 'expo-crypto';
import { get, post, mutate, type QueuedResult } from './client';

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
  // ONE CLIENT ID, used as the payload's `client_id`, the queue key, and (once it lands) the server's
  // pr_id — the pattern every other offline create in this app uses (ADR-051 / G-M11).
  //
  // It replaces `${projectId}:${firstItemDescription}` as the queue key. That composite was distinct
  // enough to keep two requests apart in the outbox, which is all it was for, but it was not an
  // identity the SERVER could recognise: every replay of the same queued request raised another
  // purchase request and consumed another PR number. `CreatePurchaseRequestDto` gained `client_id`
  // on 2026-08-19 and `createPurchaseRequest` is now idempotent on it.
  const clientId = Crypto.randomUUID();
  return mutate<PurchaseRequest>(
    'POST',
    '/procurement/purchase-requests',
    {
      client_id: clientId,
      project_id: params.projectId,
      required_date: params.requiredDate,
      items: params.items,
    },
    'purchase-request',
    clientId,
  );
}

// ── Vendor directory (mockup role_proc_manager/03_vendors) ───────────────────────────────────────

export type VendorCategory = 'MATERIALS' | 'LOGISTICS' | 'SERVICES' | 'EQUIPMENT';
export type VendorVerificationStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

export interface VendorDirectoryEntry {
  vendor_id: string;
  vendor_code: string;
  vendor_name: string;
  /** NULL on a vendor nobody has categorised — the column is nullable by design (QM-9). */
  category: VendorCategory | null;
  /** NULL = never submitted for review. NOT a performance rating. */
  verification_status: VendorVerificationStatus | null;
  /** DISTINCT projects with an open purchase order — see the endpoint's OpenAPI description. */
  active_project_count: number;
}

/** A vendor's scorecard. `total_score`/`grade` are NULL until the vendor has any history to score. */
export interface VendorScore {
  vendorId: string;
  totalScore: number | null;
  grade: 'A' | 'B' | 'C' | 'D' | 'F' | null;
}

export async function fetchVendorDirectory(
  category?: VendorCategory,
): Promise<VendorDirectoryEntry[]> {
  return get<VendorDirectoryEntry[]>(
    '/procurement/vendors/directory',
    category ? { category } : undefined,
  );
}

/**
 * One vendor's score. Deliberately a SEPARATE call per vendor: the endpoint computes from delivery,
 * dispute and quotation history, and the directory endpoint does not carry it (see its description).
 * The screen fetches these after the list lands, so a slow scorecard never delays the names.
 */
export async function fetchVendorScore(vendorId: string): Promise<VendorScore> {
  return get<VendorScore>(`/procurement/vendors/${encodeURIComponent(vendorId)}/score`);
}

// ── Approvals queue (mockup 06_project_manager/02_approvals) ─────────────────────────────────────

interface Paged<T> {
  items?: T[];
}

export interface PurchaseOrderRow {
  po_id: string;
  po_number: string;
  vendor_id: string;
  project_id: string;
  status: string;
  total_amount: string;
  currency_code: string;
  updated_at: string;
}

export interface RfqRow {
  rfq_id: string;
  rfq_number: string;
  project_id: string;
  status: string;
  /** Real column on procurement.rfqs — this is what makes an RFQ's urgency knowable. */
  deadline: string;
}

/**
 * The two things a manager is actually being asked to decide.
 *
 * PO `PENDING_APPROVAL` is the state the approval workflow parks in awaiting a tier signal, and RFQ
 * `EVALUATED` is "quotations compared, awaiting award" — the mockup's "Awaiting Award". Neither list
 * is invented: both statuses are in the CHECK constraints on their tables.
 *
 * Two requests rather than one merged endpoint, because there is no merged endpoint and inventing a
 * backend aggregate for a screen that can ask twice would be the larger change.
 */
export async function fetchPendingApprovals(): Promise<{
  pos: PurchaseOrderRow[];
  rfqs: RfqRow[];
}> {
  const [poRes, rfqRes] = await Promise.all([
    get<Paged<PurchaseOrderRow> | PurchaseOrderRow[]>('/procurement/purchase-orders', {
      status: 'PENDING_APPROVAL',
    }),
    get<Paged<RfqRow> | RfqRow[]>('/procurement/rfqs', { status: 'EVALUATED' }),
  ]);
  return {
    pos: Array.isArray(poRes) ? poRes : (poRes.items ?? []),
    rfqs: Array.isArray(rfqRes) ? rfqRes : (rfqRes.items ?? []),
  };
}

/**
 * Approve a purchase order for one tier.
 *
 * `tier` is WHICH APPROVAL THIS IS, not who is clicking: the workflow collects a signal per required
 * tier (≤ ฿50,000 → PM alone; ฿50,001–500,000 → PM + FINANCE; > ฿500,000 → + EXECUTIVE, spec §15.5).
 * The caller passes the tier its role holds.
 *
 * NOT queued offline. `mutate()` exists for field records that must survive no signal, but a PO
 * approval is a financial mutation, and spec §17.4 puts those in the online-required set — the sync
 * push endpoint has no case for them and would reject the item.
 */
export async function approvePurchaseOrder(
  poId: string,
  tier: 'PM' | 'FINANCE' | 'EXECUTIVE' | 'TENANT_ADMIN',
): Promise<void> {
  await post(`/procurement/purchase-orders/${encodeURIComponent(poId)}/approve`, { tier });
}
