// Procurement Service — Phase 5
// Business logic: vendor management, PR, RFQ lifecycle, quotation comparison,
//                 PO approval chain, delivery recording, invoice receipt.
// Financial precision: decimal.js ROUND_HALF_UP throughout (spec §FINANCIAL PRECISION SPEC).
// Emits typed Kafka events through the Phase 8 OUTBOX (QM-8): every event is written to
// platform.outbox_events in the same transaction as its business write (§35.13 ESC-13).
// Temporal workflows started via @temporalio/client — NestJS does NOT inject workflow state.

import {
  Injectable,
  Scope,
  Inject,
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
  ConflictException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import { randomUUID } from 'crypto';
import { Connection, Client } from '@temporalio/client';
import { Decimal, calculateLineTotal, sumDecimals } from '@cos/financial';
import { buildOutboxEvent } from '../../shared/outbox/outbox.types';
import { createLogger } from '@cos/logger';
import { ProcurementRepository } from './procurement.repository';
import { VendorScoring } from './vendor-scoring';
import type { ScoreCriteria, VendorGrade } from './vendor-scoring';
import { VENDOR_CATEGORIES, isVendorCategory } from './vendor-classification';
import type {
  VendorRow,
  VendorDirectoryRow,
  PurchaseRequestRow,
  RfqRow,
  QuotationRow,
  PurchaseOrderRow,
  PoLineItemRow,
  DeliveryRow,
  InvoiceRow,
} from './procurement.repository';
import type { CreateVendorDto } from './dto/create-vendor.dto';
import type { CreatePurchaseRequestDto } from './dto/create-purchase-request.dto';
import type { CreateRfqDto } from './dto/create-rfq.dto';
import type { SubmitQuotationDto } from './dto/submit-quotation.dto';
import type { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import type { RecordDeliveryDto } from './dto/record-delivery.dto';
import type { ReceiveInvoiceDto } from './dto/receive-invoice.dto';
import {
  publishRfqSignal,
  closeRfqSignal,
  awardRfqSignal,
  cancelRfqSignal,
} from './workflows/rfq.workflow';
import type { RfqWorkflowParams } from './workflows/rfq.workflow';
import {
  submitPoSignal,
  approvePoSignal,
  rejectPoSignal,
  acknowledgePoSignal,
  recordDeliverySignal,
  receiveInvoiceSignal,
  markPaidSignal,
  disputeInvoiceSignal,
} from './workflows/po.workflow';
import type { PoWorkflowParams } from './workflows/po.workflow';

// Quoting is over: the buyer may read an RFQ's quotations (product owner, 2026-11-20; plan CQ).
const QUOTATIONS_READABLE: ReadonlyArray<RfqRow['status']> = [
  'CLOSED',
  'EVALUATED',
  'AWARDED',
  'CANCELLED',
];

const logger = createLogger('procurement-service');

// Default approval thresholds in THB (tenant-configurable in Phase 14 admin UI)
const DEFAULT_PM_ONLY_MAX = 50_000;
const DEFAULT_PM_FINANCE_MAX = 500_000;
const PROCUREMENT_TASK_QUEUE = 'procurement';

/** Postgres returns a uuid lower-case; a request may send it upper-case (`@IsUUID` takes either). */
const sameUuid = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

@Injectable({ scope: Scope.REQUEST })
export class ProcurementService {
  private get tenantId(): string {
    return (this.request as { tenantId?: string }).tenantId ?? '';
  }
  private get userId(): string {
    return (this.request as { userId?: string }).userId ?? '';
  }
  private readonly correlationId: string;

  constructor(
    private readonly repo: ProcurementRepository,
    @Inject(REQUEST)
    private readonly request: Request & {
      tenantId?: string;
      user?: { user_id?: string; role?: string };
    },
  ) {
    this.correlationId = randomUUID();
  }

  // ── Vendors ────────────────────────────────────────────────────────────────

  async createVendor(dto: CreateVendorDto): Promise<VendorRow> {
    const vendor = await this.repo.createVendor({
      vendor_code: dto.vendor_code,
      vendor_name: dto.vendor_name,
      tax_id: dto.tax_id,
      contact_email: dto.contact_email,
      contact_phone: dto.contact_phone,
      address: dto.address,
      category: dto.category,
      verification_status: dto.verification_status,
    });

    logger.info(
      { vendor_id: vendor.vendor_id, tenant_id: this.tenantId, correlation_id: this.correlationId },
      'vendor.created',
    );
    return vendor;
  }

  async listVendors(active_only = true): Promise<VendorRow[]> {
    return this.repo.listVendors(active_only);
  }

  /**
   * The vendor directory — active vendors with their open-project count, optionally one category.
   *
   * A SEPARATE endpoint from `listVendors` rather than a flag on it: that one is the plain vendor
   * master read (used when creating a PO, filling a picker), and adding a per-row aggregate to it
   * would make every one of those callers pay for a count they do not display.
   *
   * An unknown `category` is rejected at the edge (400) instead of silently returning everything —
   * a filter that quietly ignores its own argument is worse than one that says the word is wrong.
   */
  async listVendorDirectory(category?: string): Promise<VendorDirectoryRow[]> {
    if (category !== undefined && !isVendorCategory(category)) {
      throw new BadRequestException(
        `Unknown vendor category '${category}'. Expected one of: ${VENDOR_CATEGORIES.join(', ')}`,
      );
    }
    return this.repo.listVendorDirectory(category ?? null);
  }

  async getVendor(vendor_id: string): Promise<VendorRow> {
    const vendor = await this.repo.findVendorById(vendor_id);
    if (!vendor) throw new NotFoundException(`Vendor ${vendor_id} not found`);
    return vendor;
  }

  async deactivateVendor(vendor_id: string): Promise<void> {
    await this.getVendor(vendor_id);
    await this.repo.deactivateVendor(vendor_id);
    logger.info({ vendor_id, tenant_id: this.tenantId }, 'vendor.deactivated');
  }

  // Vendor quotation history — all quotations the vendor has submitted (spec §14). Newest first.
  async getVendorQuotations(vendor_id: string): Promise<QuotationRow[]> {
    await this.getVendor(vendor_id); // 404 guard
    return this.repo.findQuotationsByVendor(vendor_id);
  }

  // ── Purchase Requests ──────────────────────────────────────────────────────

  /**
   * Raise a purchase request, at most once per `client_id`.
   *
   * `client_id` becomes the `pr_id` (mirrors CreateIssueDto's G-M11 handling and CreateIncidentDto's).
   * A material shortage is noticed on site, which is exactly where there is no signal, so this write
   * is queued offline and `/sync/push` replays it — including after a TIMEOUT, where the first
   * attempt may already have landed. Without an id from the client each replay filed another request
   * against the same shortage, and consumed another PR number doing it.
   */
  async createPurchaseRequest(dto: CreatePurchaseRequestDto): Promise<PurchaseRequestRow> {
    // The project is the tenant's own (fix/proc-rfq-pr-foreign-ids): project_id has no foreign key, so any UUID was
    // taken. Also reached from the app's offline /sync/push: there a 404 is permanent, and the device discards the
    // item and tells the user (SyncManager, DISCARD_NOTIFY_TYPES).
    // A replay of a request that already landed answers with that row first, before the project's state is read:
    // the project may have been closed since (plan CS), and refusing the replay would make the device discard — and
    // report as refused — a request the server holds (found by /doubt).
    if (dto.client_id) {
      const landed = await this.repo.findPurchaseRequestById(dto.client_id);
      if (landed) {
        logger.info({ pr_id: dto.client_id }, 'pr.created.duplicate_ignored');
        return landed;
      }
    }
    await this.assertProjectOpenForProcurement(dto.project_id);
    // A caller that supplies its own number keeps it (the web form does); everyone else gets the
    // tenant's next PR-<year>-<seq>, because a document number is not something to ask a site
    // engineer to invent on their phone. Allocation happens inside the insert transaction (see
    // createPurchaseRequest) — deriving it here first was a read-then-write race across two
    // transactions.
    const pr = await this.repo.createPurchaseRequest({
      pr_id: dto.client_id,
      project_id: dto.project_id,
      pr_number: dto.pr_number,
      requested_by: this.userId,
      required_date: dto.required_date,
      year: new Date().getFullYear(),
      items: dto.items,
    });

    if (pr === 'PR_NUMBER_TAKEN') {
      // Plan CX (product owner 2026-11-20): a number the caller chose (the web form does) that the tenant already
      // has — nothing written. The app's offline create sends none (the server allocates).
      throw new ConflictException({
        error: {
          code: 'COS-PROC-409',
          message: `PR number ${dto.pr_number} is already in use`,
          messageKey: 'procurement.pr.duplicateNumber',
        },
      });
    }
    if (!pr) {
      // Already raised. Read it back so a replay still answers with the row it asked for.
      const existing = dto.client_id
        ? await this.repo.findPurchaseRequestById(dto.client_id)
        : null;
      if (existing) {
        logger.info({ pr_id: dto.client_id }, 'pr.created.duplicate_ignored');
        return existing;
      }
      // The id conflicted but is invisible here, so it belongs to another tenant — RLS hides the row
      // while the primary key still rejects the insert.
      throw new ConflictException({
        error: {
          code: 'COS-PROC-409',
          message: 'client_id is already in use',
          messageKey: 'procurement.pr.duplicateId',
        },
      });
    }

    logger.info({ pr_id: pr.pr_id, tenant_id: this.tenantId }, 'pr.created');
    return pr;
  }

  // ── RFQ Lifecycle ──────────────────────────────────────────────────────────

  async createRfq(dto: CreateRfqDto): Promise<RfqRow> {
    // The deadline is in the future (product owner, 2026-11-20; plan CT): one already passed made the workflow close
    // the RFQ the moment it was published.
    // A form the validator takes but Date cannot read (ISO week or ordinal dates) would compare as NaN — false — and
    // pass; it is refused instead (found by /doubt).
    const deadlineAt = new Date(dto.deadline).getTime();
    if (!Number.isFinite(deadlineAt)) {
      throw new BadRequestException('RFQ deadline is not a date-time this server can read');
    }
    if (deadlineAt <= Date.now()) {
      throw new BadRequestException('RFQ deadline must be in the future');
    }
    // The ids it names are the tenant's own (fix/proc-rfq-pr-foreign-ids): project_id has no foreign key (any UUID was
    // taken) and pr_id's is checked without RLS (another tenant's purchase request was accepted; an unknown one failed
    // the INSERT unmapped, 500). No APPROVED rule; the purchase request must be the RFQ's own project's (plan CU,
    // product owner 2026-11-20, replacing the earlier "no same-project rule"), so PR → RFQ → PO stay in one project.
    await this.assertProjectOpenForProcurement(dto.project_id);
    if (dto.pr_id) {
      const pr = await this.repo.findPrById(dto.pr_id);
      if (!pr) throw new NotFoundException(`Purchase request ${dto.pr_id} not found`);
      if (!sameUuid(pr.project_id, dto.project_id)) {
        throw this.otherProject(
          `Purchase request ${dto.pr_id} belongs to another project`,
          'procurement.rfq.prOtherProject',
        );
      }
    }
    const rfq = await this.repo.createRfq({
      pr_id: dto.pr_id,
      project_id: dto.project_id,
      rfq_number: dto.rfq_number,
      deadline: dto.deadline,
      created_by: this.userId,
    });

    // Start Temporal RFQ workflow
    const workflowId = `rfq-${rfq.rfq_id}`;
    const client = await this.getTemporalClient();
    const deadlineMs = new Date(dto.deadline).getTime();

    const workflowParams: RfqWorkflowParams = {
      rfq_id: rfq.rfq_id,
      tenant_id: this.tenantId,
      correlation_id: this.correlationId,
      deadline_ms: deadlineMs,
    };

    await client.workflow.start('rfqWorkflow', {
      taskQueue: PROCUREMENT_TASK_QUEUE,
      workflowId,
      args: [workflowParams],
    });

    // Outbox (§35.13 ESC-13): the event is written in the same transaction as this UPDATE, which
    // is the last DB write of RFQ creation — ordering versus the workflow start is unchanged.
    await this.repo.setRfqWorkflowId(
      rfq.rfq_id,
      workflowId,
      buildOutboxEvent({
        eventType: 'procurement.rfq.created.v1',
        tenantId: this.tenantId,
        actorId: this.userId,
        correlationId: this.correlationId,
        payload: {
          rfq_id: rfq.rfq_id,
          pr_id: rfq.pr_id ?? null,
          project_id: rfq.project_id,
          rfq_number: rfq.rfq_number,
          deadline: rfq.deadline.toISOString(),
          created_by: this.userId,
        },
      }),
    );

    logger.info(
      { rfq_id: rfq.rfq_id, workflow_id: workflowId, tenant_id: this.tenantId },
      'rfq.created',
    );
    return rfq;
  }

  async publishRfq(rfq_id: string): Promise<void> {
    const rfq = await this.assertRfqStatus(rfq_id, 'DRAFT');
    // A DRAFT whose deadline has passed is not published (plan CT): it would close at once. No route edits a
    // deadline — cancel it and create another.
    if (new Date(rfq.deadline).getTime() <= Date.now()) {
      throw new UnprocessableEntityException(`RFQ ${rfq_id} deadline has passed — cannot publish`);
    }
    const handle = await this.getRfqWorkflowHandle(rfq);
    await handle.signal(publishRfqSignal, { actor_id: this.userId });
    logger.info({ rfq_id, actor_id: this.userId }, 'rfq.published');
  }

  async closeRfq(rfq_id: string): Promise<void> {
    const rfq = await this.assertRfqStatus(rfq_id, 'PUBLISHED');
    const handle = await this.getRfqWorkflowHandle(rfq);
    await handle.signal(closeRfqSignal, { actor_id: this.userId });
    logger.info({ rfq_id, actor_id: this.userId }, 'rfq.closed');
  }

  async cancelRfq(rfq_id: string): Promise<void> {
    const rfq = await this.repo.findRfqById(rfq_id);
    if (!rfq) throw new NotFoundException(`RFQ ${rfq_id} not found`);
    if (rfq.status === 'AWARDED' || rfq.status === 'CANCELLED') {
      throw new UnprocessableEntityException(
        `RFQ ${rfq_id} is already in terminal state: ${rfq.status}`,
      );
    }
    // An award once recorded is the decision (product owner, 2026-11-21; plan DJ): still EVALUATED while the workflow
    // catches up, or its signal failed — the cancel is refused, nothing signalled.
    if (rfq.awarded_quotation_id) {
      throw new ConflictException({
        error: {
          code: 'COS-PROC-409',
          message: `RFQ ${rfq_id} has been awarded — it cannot be cancelled`,
          messageKey: 'procurement.rfq.alreadyAwarded',
        },
      });
    }
    const handle = await this.getRfqWorkflowHandle(rfq);
    await handle.signal(cancelRfqSignal, { actor_id: this.userId });
    logger.info({ rfq_id, actor_id: this.userId }, 'rfq.cancelled');
  }

  async awardRfq(rfq_id: string, quotation_id: string): Promise<void> {
    const rfq = await this.assertRfqStatus(rfq_id, 'EVALUATED');
    const quotation = await this.repo.findQuotationsByRfq(rfq_id);
    const selected = quotation.find((q) => q.quotation_id === quotation_id);
    if (!selected)
      throw new NotFoundException(`Quotation ${quotation_id} not found in RFQ ${rfq_id}`);
    // The quotation's vendor must still be the tenant's ACTIVE vendor (product owner, 2026-11-20), as for a PO:
    // awarded to a deactivated vendor, the RFQ was left AWARDED with no PO possible. Refused before anything is
    // marked or signalled, so the RFQ stays EVALUATED and another quotation can be awarded.
    const vendor = await this.repo.findVendorById(selected.vendor_id);
    if (!vendor || !vendor.is_active) {
      throw new NotFoundException(`Vendor ${selected.vendor_id} not found`);
    }

    // One award per RFQ (product owner, 2026-11-20; plan CR): recorded and selected atomically. Another quotation
    // already awarded → 409, the first standing, nothing signalled; the RFQ moved on otherwise → its status 422
    // (plan DK). The same quotation again → re-signalled, so a
    // retry after a failed signal can move the RFQ on.
    if (!(await this.repo.recordAward(rfq_id, quotation_id))) {
      // Nothing recorded because the RFQ moved on between the check above and the write (a cancel landed) answers
      // with its status, as that check does — not "already awarded" (product owner, 2026-11-21; plan DK). AWARDED
      // in the meantime is the other award's workflow catching up: still "already awarded" (found by /doubt).
      const now = await this.repo.findRfqById(rfq_id);
      if (now && now.status !== 'EVALUATED' && now.status !== 'AWARDED') {
        throw new UnprocessableEntityException(
          `RFQ ${rfq_id} must be EVALUATED (current: ${now.status})`, // assertRfqStatus's text
        );
      }
      throw new ConflictException({
        error: {
          code: 'COS-PROC-409',
          message: 'This RFQ has already been awarded to another quotation',
          messageKey: 'procurement.rfq.alreadyAwarded',
        },
      });
    }

    const handle = await this.getRfqWorkflowHandle(rfq);
    await handle.signal(awardRfqSignal, { actor_id: this.userId, quotation_id });
    logger.info({ rfq_id, quotation_id, actor_id: this.userId }, 'rfq.awarded');
  }

  // ── Quotation Comparison ──────────────────────────────────────────────────

  async submitQuotation(rfq_id: string, dto: SubmitQuotationDto): Promise<QuotationRow> {
    const rfq = await this.repo.findRfqById(rfq_id);
    if (!rfq) throw new NotFoundException(`RFQ ${rfq_id} not found`);
    if (rfq.status !== 'PUBLISHED') {
      throw new UnprocessableEntityException(
        `RFQ ${rfq_id} is not PUBLISHED — cannot submit quotation`,
      );
    }
    // The deadline holds even while the workflow has not closed the RFQ yet (plan CT). The buyer may enter a bid
    // received on time later, so the quotation's own submitted_at is what is compared — at the deadline still counts.
    const submittedAt = new Date(dto.submitted_at).getTime();
    if (!Number.isFinite(submittedAt)) {
      throw new BadRequestException('submitted_at is not a date-time this server can read');
    }
    if (submittedAt > new Date(rfq.deadline).getTime()) {
      throw new UnprocessableEntityException(
        `Quotation submitted after the RFQ deadline (${new Date(rfq.deadline).toISOString()})`,
      );
    }
    // The tenant's ACTIVE vendor only (fix/proc-quotation-vendor-check). The id went straight to the INSERT: a
    // deactivated (soft-deleted) vendor was quoted for, compared and awardable; an unknown id failed the foreign key.
    // findVendorById is tenant-scoped, so another tenant's vendor is "not found" too — a foreign key is checked
    // without RLS and would have accepted it.
    const vendor = await this.repo.findVendorById(dto.vendor_id);
    if (!vendor || !vendor.is_active)
      throw new NotFoundException(`Vendor ${dto.vendor_id} not found`);

    const quotation = await this.repo.createQuotation({
      rfq_id,
      vendor_id: dto.vendor_id,
      total_amount: dto.total_amount,
      currency_code: dto.currency_code,
      validity_days: dto.validity_days,
      submitted_at: dto.submitted_at,
    });
    // One per vendor per RFQ, the first standing — no revision (product owner, 2026-11-20).
    if (!quotation) {
      throw new ConflictException({
        error: {
          code: 'COS-PROC-409',
          message: 'A quotation from this vendor already exists for this RFQ',
          messageKey: 'procurement.quotation.duplicate',
        },
      });
    }

    logger.info(
      { quotation_id: quotation.quotation_id, rfq_id, vendor_id: dto.vendor_id },
      'quotation.submitted',
    );
    return quotation;
  }

  /**
   * The quotations of an RFQ, cheapest first — read only (product owner, 2026-11-20; plan CQ).
   * Sealed while the RFQ is DRAFT or PUBLISHED (422); readable once quoting is over. The automatic selection
   * (`is_selected`) is made by the workflow's evaluation activity (`markQuotationsEvaluated`), not here: this
   * route used to make it and required CLOSED, which the workflow leaves at once, so it answered 422.
   */
  async compareQuotations(rfq_id: string): Promise<QuotationRow[]> {
    const rfq = await this.repo.findRfqById(rfq_id);
    if (!rfq) throw new NotFoundException(`RFQ ${rfq_id} not found`);
    if (!QUOTATIONS_READABLE.includes(rfq.status)) {
      throw new UnprocessableEntityException(
        `RFQ ${rfq_id} is ${rfq.status} — its quotations are sealed until it is CLOSED`,
      );
    }
    const quotations = await this.repo.findQuotationsByRfq(rfq_id);
    // Decimal-safe and stable: the repository's order (submitted_at, quotation_id) breaks a tie on price.
    return [...quotations].sort((a, b) =>
      new Decimal(a.total_amount).comparedTo(new Decimal(b.total_amount)),
    );
  }

  // ── Purchase Order Lifecycle ───────────────────────────────────────────────

  async createPurchaseOrder(dto: CreatePurchaseOrderDto): Promise<{
    po: PurchaseOrderRow;
    line_items: PoLineItemRow[];
  }> {
    // Calculate line totals and verify PO total
    const lineItems = dto.line_items.map((li) => {
      const qty = new Decimal(li.quantity);
      const price = new Decimal(li.unit_price);
      const total = calculateLineTotal(qty, price);
      return {
        boq_item_id: li.boq_item_id,
        description: li.description,
        quantity: qty.toFixed(4),
        unit: li.unit,
        unit_price: price.toFixed(4),
        line_total: total.toFixed(4),
      };
    });

    const computedTotal = sumDecimals(lineItems.map((li) => new Decimal(li.line_total)));
    const declaredTotal = new Decimal(dto.total_amount);

    if (!computedTotal.equals(declaredTotal)) {
      throw new UnprocessableEntityException(
        `PO total_amount ${declaredTotal.toFixed(4)} does not match sum of line_items (${computedTotal.toFixed(4)})`,
      );
    }

    // The ids it names are the tenant's own (fix/proc-po-foreign-ids) — checked after the body's own arithmetic,
    // before anything is written. They went straight to the INSERT: vendor_id and rfq_id have foreign keys, which are
    // checked without RLS — another tenant's row was accepted, an unknown id failed the INSERT unmapped (500) — and
    // project_id has none, so any UUID was taken. The vendor must also be ACTIVE (the vendor lists hide a deactivated
    // one). rfq_id: no AWARDED or awarded-vendor rule (product owner, 2026-11-20), but it must be the PO's own
    // project's RFQ (plan CU, product owner 2026-11-20).
    const vendor = await this.repo.findVendorById(dto.vendor_id);
    if (!vendor || !vendor.is_active) {
      throw new NotFoundException(`Vendor ${dto.vendor_id} not found`);
    }
    // The project first, as in createRfq: an unknown or closed project answers as such, whatever RFQ is named.
    await this.assertProjectOpenForProcurement(dto.project_id);
    if (dto.rfq_id) {
      const rfq = await this.repo.findRfqById(dto.rfq_id);
      if (!rfq) throw new NotFoundException(`RFQ ${dto.rfq_id} not found`);
      if (!sameUuid(rfq.project_id, dto.project_id)) {
        throw this.otherProject(
          `RFQ ${dto.rfq_id} belongs to another project`,
          'procurement.po.rfqOtherProject',
        );
      }
    }

    // One transaction for the header + every line: a partial write would leave a committed PO whose
    // total_amount contradicts the sum just validated above.
    const { po, line_items: createdLines } = await this.repo.createPurchaseOrderWithLineItems(
      {
        rfq_id: dto.rfq_id,
        vendor_id: dto.vendor_id,
        project_id: dto.project_id,
        po_number: dto.po_number,
        total_amount: computedTotal.toFixed(4),
        currency_code: dto.currency_code,
        delivery_date: dto.delivery_date,
        created_by: this.userId,
      },
      lineItems,
    );

    // Start Temporal PO workflow
    const workflowId = `po-${po.po_id}`;
    const client = await this.getTemporalClient();

    // Fetch approver IDs from tenant config — use placeholder UUIDs until tenant settings module exists
    const approvers = {
      pm_id: process.env['DEFAULT_PM_APPROVER_ID'] ?? '00000000-0000-0000-0000-000000000001',
      finance_id:
        process.env['DEFAULT_FINANCE_APPROVER_ID'] ?? '00000000-0000-0000-0000-000000000002',
      executive_id:
        process.env['DEFAULT_EXECUTIVE_APPROVER_ID'] ?? '00000000-0000-0000-0000-000000000003',
      tenant_admin_id:
        process.env['DEFAULT_TENANT_ADMIN_ID'] ?? '00000000-0000-0000-0000-000000000004',
    };

    const workflowParams: PoWorkflowParams = {
      po_id: po.po_id,
      project_id: po.project_id,
      vendor_id: po.vendor_id,
      tenant_id: this.tenantId,
      correlation_id: this.correlationId,
      total_amount_thb: po.total_amount, // Assuming THB; currency conversion would be done here in full implementation
      po_number: po.po_number,
      total_amount: po.total_amount,
      currency_code: po.currency_code,
      approval_thresholds: {
        pm_only_max: DEFAULT_PM_ONLY_MAX,
        pm_finance_max: DEFAULT_PM_FINANCE_MAX,
      },
      approvers,
    };

    await client.workflow.start('poWorkflow', {
      taskQueue: PROCUREMENT_TASK_QUEUE,
      workflowId,
      args: [workflowParams],
    });

    // Outbox (§35.13 ESC-13) — same transaction as the last DB write of PO creation.
    await this.repo.setPoWorkflowId(
      po.po_id,
      workflowId,
      buildOutboxEvent({
        eventType: 'procurement.po.created.v1',
        tenantId: this.tenantId,
        actorId: this.userId,
        correlationId: this.correlationId,
        payload: {
          po_id: po.po_id,
          project_id: po.project_id,
          vendor_id: po.vendor_id,
          po_number: po.po_number,
          total_amount: { amount: po.total_amount, currency_code: po.currency_code },
          delivery_date: dto.delivery_date,
          line_items: createdLines.map((li) => ({
            item_id: li.line_id,
            quantity: li.quantity,
            unit: li.unit,
            unit_price: li.unit_price,
            // Carried so Finance can attribute the cost to a budget line without reading
            // Procurement (TDD OQ-50). Null when the line was not ordered against a BOQ item.
            boq_item_id: li.boq_item_id,
          })),
        },
      }),
    );

    logger.info(
      { po_id: po.po_id, workflow_id: workflowId, tenant_id: this.tenantId },
      'po.created',
    );

    return { po, line_items: createdLines };
  }

  async submitPoForApproval(po_id: string): Promise<void> {
    const po = await this.assertPoStatus(po_id, 'DRAFT');
    const handle = await this.getPoWorkflowHandle(po);
    await handle.signal(submitPoSignal, { actor_id: this.userId });
    logger.info({ po_id, actor_id: this.userId }, 'po.submitted');
  }

  async approvePo(
    po_id: string,
    tier: 'PM' | 'FINANCE' | 'EXECUTIVE' | 'TENANT_ADMIN',
  ): Promise<void> {
    const po = await this.assertPoStatus(po_id, 'PENDING_APPROVAL');
    const handle = await this.getPoWorkflowHandle(po);
    await handle.signal(approvePoSignal, { approver_id: this.userId, tier });
    logger.info({ po_id, tier, approver_id: this.userId }, 'po.approved');
  }

  async rejectPo(po_id: string, reason: string): Promise<void> {
    const po = await this.assertPoStatus(po_id, 'PENDING_APPROVAL');
    const handle = await this.getPoWorkflowHandle(po);
    await handle.signal(rejectPoSignal, { approver_id: this.userId, reason });
    logger.info({ po_id, actor_id: this.userId }, 'po.rejected');
  }

  async acknowledgePo(po_id: string): Promise<void> {
    const po = await this.assertPoStatus(po_id, 'SENT');
    const handle = await this.getPoWorkflowHandle(po);
    await handle.signal(acknowledgePoSignal, { actor_id: this.userId });
    logger.info({ po_id, actor_id: this.userId }, 'po.acknowledged');
  }

  // ── Tenant-wide list methods (AIP-132 List) ─────────────────────────────────

  async listAllPurchaseRequests(params: {
    project_id?: string;
    status?: string;
    page: number;
    limit: number;
  }) {
    const { rows, total } = await this.repo.listPurchaseRequestsTenant(params);
    return { items: rows, total, page: params.page, limit: params.limit };
  }

  async listAllRfqs(params: { project_id?: string; status?: string; page: number; limit: number }) {
    const { rows, total } = await this.repo.listRfqsTenant(params);
    return { items: rows, total, page: params.page, limit: params.limit };
  }

  async listAllPurchaseOrders(params: {
    project_id?: string;
    status?: string;
    page: number;
    limit: number;
  }) {
    const { rows, total } = await this.repo.listPurchaseOrdersTenant(params);
    return { items: rows, total, page: params.page, limit: params.limit };
  }

  async listAllDeliveries(params: { po_id?: string; page: number; limit: number }) {
    const { rows, total } = await this.repo.listDeliveriesTenant(params);
    return { items: rows, total, page: params.page, limit: params.limit };
  }

  async listDeliveriesByPo(po_id: string): Promise<DeliveryRow[]> {
    return this.repo.findDeliveriesByPo(po_id);
  }

  async getPurchaseOrder(po_id: string): Promise<{
    po: PurchaseOrderRow;
    line_items: PoLineItemRow[];
  }> {
    const po = await this.repo.findPoById(po_id);
    if (!po) throw new NotFoundException(`Purchase order ${po_id} not found`);
    const line_items = await this.repo.findLineItemsByPo(po_id);
    return { po, line_items };
  }

  // ── Delivery Recording ────────────────────────────────────────────────────

  async recordDelivery(
    dto: RecordDeliveryDto,
  ): Promise<{ delivery: DeliveryRow; is_partial: boolean }> {
    const po_id = dto.po_id;
    const po = await this.repo.findPoById(po_id);
    if (!po) throw new NotFoundException(`Purchase order ${po_id} not found`);

    const allowed: PurchaseOrderRow['status'][] = ['ACKNOWLEDGED', 'PARTIALLY_DELIVERED'];
    if (!allowed.includes(po.status)) {
      throw new UnprocessableEntityException(
        `PO ${po_id} must be ACKNOWLEDGED or PARTIALLY_DELIVERED to record delivery (current: ${po.status})`,
      );
    }

    // Outbox (§35.13 ESC-13): the delivery rows, the derived `is_partial` flag and the event are
    // now all produced inside ONE transaction. `is_partial` depends on the rows just inserted, so
    // it is computed in the repository rather than re-queried afterwards.
    //
    // `delivery_id` carries dto.client_id so an offline replay lands on ON CONFLICT DO NOTHING
    // instead of double-counting goods received.
    const created = await this.repo.createDelivery(
      {
        delivery_id: dto.client_id,
        po_id,
        delivery_note: dto.delivery_note,
        delivered_at: dto.delivered_at,
        received_by: this.userId,
        notes: dto.notes,
        items: dto.items.map((i) => ({
          line_id: i.line_id,
          quantity_received: i.quantity_received,
        })),
      },
      (ctx) =>
        buildOutboxEvent({
          eventType: 'procurement.delivery.received.v1',
          tenantId: this.tenantId,
          actorId: this.userId,
          correlationId: this.correlationId,
          payload: {
            delivery_id: ctx.delivery.delivery_id,
            po_id,
            project_id: po.project_id,
            vendor_id: po.vendor_id,
            received_by: this.userId,
            received_at: dto.delivered_at,
            items_received: ctx.items.map((i) => ({
              item_id: i.line_id,
              quantity_received: i.quantity_received,
            })),
            partial: ctx.is_partial,
          },
        }),
    );

    // ALREADY RECORDED — a replay of a delivery queued at the gate. Return the existing row and run
    // none of what follows: the quantities are already counted, the Temporal workflow was already
    // signalled, and `procurement.delivery.received.v1` was already written to the outbox. Re-running
    // any of the three is how a partially-delivered PO gets closed on goods that arrived once.
    if (!created) {
      const existing = dto.client_id ? await this.repo.findDeliveryById(dto.client_id) : null;
      if (existing) {
        logger.info({ delivery_id: dto.client_id }, 'delivery.recorded.duplicate_ignored');
        const lines = await this.repo.findLineItemsByPo(po_id);
        const fulfilled = await Promise.all(
          lines.map(async (li) => {
            const delivered = new Decimal(await this.repo.sumDeliveredQuantity(li.line_id));
            return delivered.greaterThanOrEqualTo(new Decimal(li.quantity));
          }),
        );
        return { delivery: existing, is_partial: !fulfilled.every(Boolean) };
      }
      throw new ConflictException({
        error: {
          code: 'COS-PROC-409',
          message: 'client_id is already in use',
          messageKey: 'procurement.delivery.duplicateId',
        },
      });
    }

    const { delivery, is_partial } = created;

    // Signal Temporal workflow
    const handle = await this.getPoWorkflowHandle(po);
    await handle.signal(recordDeliverySignal, {
      delivery_id: delivery.delivery_id,
      is_partial,
    });

    logger.info(
      { delivery_id: delivery.delivery_id, po_id, is_partial, tenant_id: this.tenantId },
      'delivery.recorded',
    );

    return { delivery, is_partial };
  }

  // ── Invoice Receipt ────────────────────────────────────────────────────────

  // By design (product owner, 2026-11-20; docs/vendor-deactivated-invoices): the vendor is not checked
  // here, nor in approveInvoice or markInvoicePaid. A vendor deactivated after its PO was issued still has
  // that PO's invoices received, approved and paid on the buyer side — deactivation means "buy no more",
  // not "pay no debts". Creating new business with the vendor (a PO, contract, quotation or RFQ invitation)
  // is what checks is_active.
  async receiveInvoice(dto: ReceiveInvoiceDto): Promise<InvoiceRow> {
    const po_id = dto.po_id;
    const po = await this.assertPoStatus(po_id, 'FULLY_DELIVERED');

    // Outbox (§35.13 ESC-13) — written in the INSERT's transaction, from the inserted row.
    const invoice = await this.repo.createInvoice(
      {
        po_id,
        vendor_id: po.vendor_id,
        invoice_number: dto.invoice_number,
        amount: dto.amount,
        currency_code: dto.currency_code,
        invoice_date: dto.invoice_date,
        due_date: dto.due_date,
        file_id: dto.file_id,
      },
      (row) =>
        buildOutboxEvent({
          eventType: 'procurement.invoice.received.v1',
          tenantId: this.tenantId,
          actorId: this.userId,
          correlationId: this.correlationId,
          payload: {
            invoice_id: row.invoice_id,
            po_id,
            project_id: po.project_id,
            vendor_id: po.vendor_id,
            amount: { amount: row.amount, currency_code: row.currency_code },
            invoice_date: dto.invoice_date,
            due_date: dto.due_date,
          },
        }),
    );

    const handle = await this.getPoWorkflowHandle(po);
    await handle.signal(receiveInvoiceSignal, { invoice_id: invoice.invoice_id });

    logger.info(
      { invoice_id: invoice.invoice_id, po_id, tenant_id: this.tenantId },
      'invoice.received',
    );
    return invoice;
  }

  async approveInvoice(invoice_id: string): Promise<InvoiceRow> {
    const invoice = await this.repo.findInvoiceById(invoice_id);
    if (!invoice) {
      throw new NotFoundException(`Invoice ${invoice_id} not found`);
    }
    const po_id = invoice.po_id;
    if (invoice.status !== 'RECEIVED' && invoice.status !== 'VERIFIED') {
      throw new UnprocessableEntityException(
        `Invoice ${invoice_id} must be RECEIVED or VERIFIED to approve (current: ${invoice.status})`,
      );
    }

    // The PO is read BEFORE the status update so the event payload can be built for the same
    // transaction (§35.13 ESC-13); it is a read, so the order change is safe.
    const po = await this.repo.findPoById(po_id);

    await this.repo.updateInvoiceStatus(
      invoice_id,
      'APPROVED',
      buildOutboxEvent({
        eventType: 'procurement.vendor_invoice.approved.v1',
        tenantId: this.tenantId,
        actorId: this.userId,
        correlationId: this.correlationId,
        payload: {
          invoice_id,
          po_id,
          project_id: po?.project_id ?? '',
          vendor_id: invoice.vendor_id,
          amount: { amount: invoice.amount, currency_code: invoice.currency_code },
          approved_by: this.userId,
          approved_at: new Date().toISOString(),
          payment_due:
            invoice.due_date instanceof Date
              ? invoice.due_date.toISOString().slice(0, 10)
              : invoice.due_date,
        },
      }),
    );

    logger.info({ invoice_id, po_id, actor_id: this.userId }, 'invoice.approved');
    return { ...invoice, status: 'APPROVED' };
  }

  // G-W6 — invoice-level dispute (§20.7.4 verify/approve/dispute). Sets the vendor invoice record to
  // DISPUTED directly (mirrors approveInvoice); distinct from the PO-workflow disputeInvoice signal.
  async disputeVendorInvoice(invoice_id: string): Promise<InvoiceRow> {
    const invoice = await this.repo.findInvoiceById(invoice_id);
    if (!invoice) {
      throw new NotFoundException(`Invoice ${invoice_id} not found`);
    }
    if (invoice.status === 'PAID' || invoice.status === 'DISPUTED') {
      throw new UnprocessableEntityException(
        `Invoice ${invoice_id} cannot be disputed (current: ${invoice.status})`,
      );
    }
    await this.repo.updateInvoiceStatus(invoice_id, 'DISPUTED');
    logger.info({ invoice_id, actor_id: this.userId }, 'vendor-invoice.disputed');
    return { ...invoice, status: 'DISPUTED' };
  }

  // Invoice detail by id (unblocks mobile invoice detail — G-M14). No line items on invoices; returns
  // the invoice record. add-note remains a follow-up (no note column on procurement.invoices yet).
  async getVendorInvoice(invoice_id: string): Promise<InvoiceRow> {
    const invoice = await this.repo.findInvoiceById(invoice_id);
    if (!invoice) {
      throw new NotFoundException(`Invoice ${invoice_id} not found`);
    }
    return invoice;
  }

  // G-M14 — set/overwrite the invoice free-text note.
  async setInvoiceNote(invoice_id: string, note: string): Promise<InvoiceRow> {
    const invoice = await this.repo.findInvoiceById(invoice_id);
    if (!invoice) {
      throw new NotFoundException(`Invoice ${invoice_id} not found`);
    }
    await this.repo.updateInvoiceNote(invoice_id, note);
    logger.info({ invoice_id, actor_id: this.userId }, 'vendor-invoice.note-set');
    return { ...invoice, note };
  }

  // G-W5 — vendor score from the 3 decided criteria over available data (OTD grace-2d, quality =
  // 1−dispute-rate, price = min/quote per RFQ). Weights are equal (spec default 1/3), re-normalized
  // over whichever criteria have data; a vendor with no data yet grades null (N/A).
  async computeVendorScore(vendorId: string): Promise<{
    vendorId: string;
    grade: VendorGrade | null;
    totalScore: number | null;
    breakdown: ScoreCriteria[];
  }> {
    const [otd, disp, price] = await Promise.all([
      this.repo.vendorOtdStats(vendorId),
      this.repo.vendorDisputeStats(vendorId),
      this.repo.vendorPriceStats(vendorId),
    ]);

    const criteria: ScoreCriteria[] = [];
    if (otd.total > 0) {
      criteria.push({
        name: 'on_time_delivery',
        weight: 0,
        value: (100 * otd.on_time) / otd.total,
      });
    }
    if (disp.total > 0) {
      criteria.push({ name: 'quality', weight: 0, value: 100 * (1 - disp.disputed / disp.total) });
    }
    if (price.count > 0 && price.price_pct != null) {
      criteria.push({ name: 'price', weight: 0, value: price.price_pct });
    }

    if (criteria.length === 0) {
      return { vendorId, grade: null, totalScore: null, breakdown: [] };
    }

    const weight = 1 / criteria.length; // equal weights, re-normalized over available criteria
    const scored = new VendorScoring().score(
      vendorId,
      criteria.map((c) => ({ ...c, weight })),
    );
    return {
      vendorId,
      grade: scored.grade,
      totalScore: scored.totalScore,
      breakdown: scored.breakdown,
    };
  }

  async markInvoicePaid(po_id: string): Promise<void> {
    const po = await this.assertPoStatus(po_id, 'INVOICED');
    const handle = await this.getPoWorkflowHandle(po);
    await handle.signal(markPaidSignal, { actor_id: this.userId });
    logger.info({ po_id, actor_id: this.userId }, 'invoice.paid');
  }

  async disputeInvoice(po_id: string, reason: string): Promise<void> {
    const po = await this.assertPoStatus(po_id, 'INVOICED');
    const handle = await this.getPoWorkflowHandle(po);
    await handle.signal(disputeInvoiceSignal, { actor_id: this.userId, reason });
    logger.info({ po_id, actor_id: this.userId }, 'invoice.disputed');
  }

  async listInvoices(params: {
    po_id?: string;
    status?: string;
    project_id?: string;
    page: number;
    limit: number;
  }) {
    const { rows, total } = await this.repo.findInvoices(params);
    return { items: rows, total, page: params.page, limit: params.limit };
  }

  // ── Private Helpers ────────────────────────────────────────────────────────

  /** Plan CU: a PO's RFQ and an RFQ's purchase request must be the same project's — 422 `COS-PROC-422`. */
  private otherProject(message: string, messageKey: string): UnprocessableEntityException {
    return new UnprocessableEntityException({
      error: { code: 'COS-PROC-422', message, messageKey },
    });
  }

  /**
   * The project is the tenant's own (404 otherwise) and still takes new procurement: a CANCELLED or COMPLETED project
   * takes no new purchase request, RFQ or purchase order (product owner, 2026-11-20; plan CS) — 422 `COS-PROC-422`.
   * What is already open on it carries on. DRAFT, ACTIVE and ON_HOLD are open.
   */
  // The check and the write are separate transactions: a project closed in between can take one more — the same as
  // work already open on it, which carries on.
  private async assertProjectOpenForProcurement(project_id: string): Promise<void> {
    const status = await this.repo.projectStatus(project_id);
    if (status === null) throw new NotFoundException(`Project ${project_id} not found`);
    if (status === 'CANCELLED' || status === 'COMPLETED') {
      throw new UnprocessableEntityException({
        error: {
          code: 'COS-PROC-422',
          message: `Project ${project_id} is ${status} — no new procurement`,
          messageKey: 'procurement.project.closed',
        },
      });
    }
  }

  private async assertRfqStatus(rfq_id: string, expected: RfqRow['status']): Promise<RfqRow> {
    const rfq = await this.repo.findRfqById(rfq_id);
    if (!rfq) throw new NotFoundException(`RFQ ${rfq_id} not found`);
    if (rfq.status !== expected) {
      throw new UnprocessableEntityException(
        `RFQ ${rfq_id} must be ${expected} (current: ${rfq.status})`,
      );
    }
    return rfq;
  }

  private async assertPoStatus(
    po_id: string,
    expected: PurchaseOrderRow['status'],
  ): Promise<PurchaseOrderRow> {
    const po = await this.repo.findPoById(po_id);
    if (!po) throw new NotFoundException(`Purchase order ${po_id} not found`);
    if (po.status !== expected) {
      throw new UnprocessableEntityException(
        `PO ${po_id} must be ${expected} (current: ${po.status})`,
      );
    }
    return po;
  }

  private async getTemporalClient(): Promise<Client> {
    const connection = await Connection.connect({
      address: process.env['TEMPORAL_ADDRESS'] ?? 'localhost:7233',
    });
    return new Client({ connection });
  }

  private async getRfqWorkflowHandle(rfq: RfqRow) {
    if (!rfq.temporal_workflow_id) {
      throw new UnprocessableEntityException(`RFQ ${rfq.rfq_id} has no Temporal workflow`);
    }
    const client = await this.getTemporalClient();
    return client.workflow.getHandle(rfq.temporal_workflow_id);
  }

  private async getPoWorkflowHandle(po: PurchaseOrderRow) {
    if (!po.temporal_workflow_id) {
      throw new UnprocessableEntityException(`PO ${po.po_id} has no Temporal workflow`);
    }
    const client = await this.getTemporalClient();
    return client.workflow.getHandle(po.temporal_workflow_id);
  }
}
