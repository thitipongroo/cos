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
  /**
   * The server's own count of rows matching the filter, not the length of this page.
   *
   * Declared 2026-09-08. `listAll*` in `procurement.service.ts` has always returned it beside
   * `items`; this type simply did not say so, and a chip counting `items.length` on a paged list
   * counts the page. OPTIONAL for QM-9 — an older deployment omits it and the caller falls back to
   * the rows it actually has.
   */
  total?: number;
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

/**
 * One vendor invoice (`GET /procurement/vendor-invoices`).
 *
 * `vendor_name` is LEFT-joined from `procurement.vendors` by the backend change of 2026-09-08. It
 * is optional on this type and nullable in it, for two different reasons: optional because an app
 * pointed at an older deployment parses the response either way (QM-9), nullable because the join
 * is tenant-scoped and a screen must render an em dash rather than a blank where a name should be.
 */
export interface VendorInvoice {
  invoice_id: string;
  po_id: string;
  vendor_id: string;
  invoice_number: string;
  amount: string;
  currency_code: string;
  invoice_date: string;
  due_date: string;
  status: 'RECEIVED' | 'VERIFIED' | 'APPROVED' | 'PAID' | 'DISPUTED';
  vendor_name?: string | null;
}

/** The largest page `parseLimit` in `procurement.controller.ts` will grant. */
const INVOICE_PAGE = 100;

/** What `GET /procurement/vendor-invoices` answers with. `total` counts the FILTER, not the page. */
export interface VendorInvoicePage {
  items: VendorInvoice[];
  total: number;
}

/**
 * Vendor invoices — one page, narrowed by status on the SERVER.
 *
 * WHY THE PAYMENT QUEUE READS THIS AT ALL. `finance.payments` names its invoice by `invoice_id` and
 * carries nothing a person can read, and finance may not query `procurement.*` — master §PHASE 7
 * line 3216, held by `tests/architecture/connectivity.spec.ts` and
 * `tests/conformance/finance/05-constraints.spec.ts`. A cross-schema join was written into
 * `GET /finance/payments` on 2026-09-08 and reverted the same day when those two suites caught it;
 * the join now lives here, and the screens match on `invoice_id`.
 *
 * ONE REQUEST PER PAGE, not one per row. The alternative — `GET /procurement/vendor-invoices/:id`
 * for each row drawn — is the N+1 fan-out the portfolio summary endpoint exists to avoid.
 *
 * `total` IS THE COUNT OF THE FILTER and comes from the server's own `COUNT(*)`, so a caller that
 * wants "how many are disputed" asks for `{ status: 'DISPUTED', limit: 1 }` and reads it, rather
 * than counting the rows it happened to receive.
 */
export async function listVendorInvoices(
  opts: { status?: string; limit?: number } = {},
): Promise<VendorInvoicePage> {
  const query: Record<string, string> = {
    page: '1',
    limit: String(opts.limit ?? INVOICE_PAGE),
  };
  if (opts.status !== undefined) query.status = opts.status;
  const res = await get<{ items?: VendorInvoice[]; total?: number } | VendorInvoice[]>(
    '/procurement/vendor-invoices',
    query,
  );
  const items = Array.isArray(res) ? res : (res.items ?? []);
  return { items, total: Array.isArray(res) ? items.length : (res.total ?? items.length) };
}

/**
 * `invoice_id` → the invoice, for the screens that draw a payment.
 *
 * Returns an EMPTY map when the request fails rather than throwing: a payment queue that cannot
 * name its vendors is still a payment queue, and the alternative is a screen that shows nothing
 * because a decorative lookup was offline.
 */
export async function invoiceIndex(): Promise<Map<string, VendorInvoice>> {
  try {
    const { items } = await listVendorInvoices();
    return new Map(items.map((row) => [row.invoice_id, row]));
  } catch {
    return new Map();
  }
}

/**
 * `po_id` → the purchase order, for the screens that draw an invoice.
 *
 * An invoice carries `po_id` and no readable reference, exactly as a payment carries `invoice_id`.
 * This is what turns it into "#PO-2026-882", and it is also where the invoice screen gets the two
 * figures the drawing puts beside that reference: the PO's `status` (its "ส่งมอบบางส่วน") and its
 * `total_amount` (its "Over PO +5.2%"). Both are real columns; neither needed drawing.
 *
 * Empty on failure, for the reason above.
 */
export async function poIndex(): Promise<Map<string, PurchaseOrderRow>> {
  try {
    const res = await get<Paged<PurchaseOrderRow> | PurchaseOrderRow[]>(
      '/procurement/purchase-orders',
      { page: '1', limit: String(INVOICE_PAGE) },
    );
    const rows = Array.isArray(res) ? res : (res.items ?? []);
    return new Map(rows.map((row) => [row.po_id, row]));
  } catch {
    return new Map();
  }
}

/**
 * Approve a vendor invoice — `RECEIVED`/`VERIFIED` → `APPROVED`.
 *
 * The server refuses any other starting status with a 422 (`procurement.service.ts`), so the screen
 * offers the button only from those two rather than letting a reader press something that cannot
 * work.
 *
 * NOT queued offline, for the same reason `approvePurchaseOrder` is not: §17.4 puts vendor invoices
 * in the online-required set, `SYNC_PUSHABLE_ENTITY_TYPES` has no case for them, and `post` throws
 * rather than promising a replay `/sync/push` would reject.
 */
export async function approveVendorInvoice(invoiceId: string): Promise<void> {
  await post(`/procurement/vendor-invoices/${encodeURIComponent(invoiceId)}/approve`, {});
}

/**
 * Raise a dispute — anything except `PAID` or already `DISPUTED` → `DISPUTED`.
 *
 * The endpoint takes NO body. The DTO with a `reason` belongs to the PO dispute, not this one —
 * read from the controller, not assumed. Online-only, as above.
 */
export async function disputeVendorInvoice(invoiceId: string): Promise<void> {
  await post(`/procurement/vendor-invoices/${encodeURIComponent(invoiceId)}/dispute`, {});
}

// ── PROCUREMENT_OFFICER screens (mockup/mobile/10_proc_officer) ──────────────────────────────────
//
// ONE PAGE OF 100 IS THE WHOLE TENANT HERE, and that is measured rather than hoped: the seeded
// tenant holds 45 RFQs, 42 purchase orders, 55 purchase requests and 32 deliveries, and the
// controller's `parseLimit` caps at 100 (`procurement.controller.ts:58`). Asking for 100 is
// therefore one request per list, not a page of one. If a tenant ever exceeds it the screens show
// the first 100 and the `total` beside them will not agree with the rows — which is visible, unlike
// a silently truncated list.

/** `procurement.purchase_requests`. The status set is declared in `procurement.rows.ts`. */
export interface PurchaseRequestRow {
  pr_id: string;
  pr_number: string;
  project_id: string;
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'PO_CREATED';
  required_date: string | null;
  created_at: string;
}

/** `procurement.deliveries`. NOTE WHAT IS ABSENT: there is no status column on this table. */
export interface DeliveryRow {
  delivery_id: string;
  po_id: string;
  delivery_note: string | null;
  delivered_at: string;
  notes: string | null;
}

// THERE IS NO WAY TO COUNT AN RFQ'S QUOTATIONS FROM A LIST, and this is where that was found out.
//
// `GET /procurement/rfqs/:rfqId/quotations` reads like one — it is a `@Get`, its summary says
// "Compare quotations for an RFQ (sorted by price ASC)", and a `fetchRfqQuotations` was written
// against it on 2026-09-08 to put a real "3 quotes received" on every RFQ card.
//
// IT IS NOT A READ. `ProcurementService.compareQuotations` asserts the RFQ is `CLOSED`, throws 422
// if it holds no quotations, and then **marks the lowest one selected**
// (`markQuotationSelected`). It is a step of the award workflow wearing a GET.
//
// Calling it once per row would have thrown 422 for every RFQ not in `CLOSED` — which is why the
// first capture showed a column of zeros — and, on any RFQ that WAS closed, would have silently
// awarded it by rendering a list. Nothing was mutated: the seeded tenant holds no CLOSED RFQ, so
// all 45 calls threw. The function and its row type went the same day.
//
// What would make the count real: a read-only `GET` returning quotations for an RFQ, or a count on
// the RFQ list itself. Until then the card shows what it can prove.

function page<T>(res: Paged<T> | T[]): { items: T[]; total: number } {
  if (Array.isArray(res)) return { items: res, total: res.length };
  const items = res.items ?? [];
  return { items, total: typeof res.total === 'number' ? res.total : items.length };
}

const LIMIT = 100;

export async function listPurchaseRequests(status?: string): Promise<{
  items: PurchaseRequestRow[];
  total: number;
}> {
  return page(
    await get<Paged<PurchaseRequestRow> | PurchaseRequestRow[]>('/procurement/purchase-requests', {
      limit: String(LIMIT),
      ...(status === undefined ? {} : { status }),
    }),
  );
}

export async function listRfqs(status?: string): Promise<{ items: RfqRow[]; total: number }> {
  return page(
    await get<Paged<RfqRow> | RfqRow[]>('/procurement/rfqs', {
      limit: String(LIMIT),
      ...(status === undefined ? {} : { status }),
    }),
  );
}

export async function listPurchaseOrders(status?: string): Promise<{
  items: PurchaseOrderRow[];
  total: number;
}> {
  return page(
    await get<Paged<PurchaseOrderRow> | PurchaseOrderRow[]>('/procurement/purchase-orders', {
      limit: String(LIMIT),
      ...(status === undefined ? {} : { status }),
    }),
  );
}

export async function listDeliveries(): Promise<{ items: DeliveryRow[]; total: number }> {
  return page(
    await get<Paged<DeliveryRow> | DeliveryRow[]>('/procurement/deliveries', {
      limit: String(LIMIT),
    }),
  );
}

/**
 * `vendor_id` -> `vendor_name`, for the screens that list an order or a delivery.
 *
 * WHY THIS AND NOT A BACKEND JOIN. The FINANCE round added `vendor_name` to the vendor-invoice
 * query (ADR-100) because finance may not read procurement's tables at all. These screens ARE
 * procurement, and `GET /procurement/vendors/directory` already returns every active vendor with its
 * name — so one request builds the index and no schema surface is added for it.
 *
 * ONE REQUEST FOR THE WHOLE SCREEN, not one per row.
 */
export async function vendorIndex(): Promise<Map<string, string>> {
  const rows = await fetchVendorDirectory();
  return new Map(rows.map((v) => [v.vendor_id, v.vendor_name]));
}

/**
 * `project_id` -> `project_name`, for the screens that name the project on a card.
 *
 * `GET /projects`, NOT `GET /projects/mine`, and the difference is the whole point. `mine` reads
 * `projects.project_members`, and **the seeded procurement officer is a member of none** — verified
 * against the database, 0 rows — which is not a seeding gap: this role buys for the whole tenant and
 * is not staffed onto sites. Asking "which projects am I on" returned nothing and the first capture
 * came back with no project named anywhere.
 *
 * The tenant list carries no `@Roles` and is open to any authenticated caller
 * (`project.controller.ts` `@Get()`), which is the right question for a cross-project queue.
 */
export async function projectNameIndex(): Promise<Map<string, string>> {
  const res = await get<{ items?: Array<{ project_id: string; project_name: string }> }>(
    '/projects',
  );
  return new Map((res.items ?? []).map((p) => [p.project_id, p.project_name] as const));
}
