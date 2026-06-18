// Procurement Service — Phase 5
// Business logic: vendor management, PR, RFQ lifecycle, quotation comparison,
//                 PO approval chain, delivery recording, invoice receipt.
// Financial precision: decimal.js ROUND_HALF_UP throughout (spec §FINANCIAL PRECISION SPEC).
// Emits typed Kafka events via @cos/shared KafkaProducer (QM-8).
// Temporal workflows started via @temporalio/client — NestJS does NOT inject workflow state.

import {
  Injectable,
  Scope,
  Inject,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import { randomUUID } from 'crypto';
import { Connection, Client } from '@temporalio/client';
import { Decimal, calculateLineTotal, sumDecimals } from '@cos/financial';
import { KafkaProducer } from '@cos/shared';
import { createLogger } from '@cos/logger';
import { ProcurementRepository } from './procurement.repository';
import type {
  VendorRow,
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

const logger = createLogger('procurement-service');

// Default approval thresholds in THB (tenant-configurable in Phase 14 admin UI)
const DEFAULT_PM_ONLY_MAX = 50_000;
const DEFAULT_PM_FINANCE_MAX = 500_000;
const PROCUREMENT_TASK_QUEUE = 'procurement';

@Injectable({ scope: Scope.REQUEST })
export class ProcurementService {
  private readonly tenantId: string;
  private readonly userId: string;
  private readonly correlationId: string;
  private readonly kafka: KafkaProducer;

  constructor(
    private readonly repo: ProcurementRepository,
    @Inject(REQUEST)
    request: Request & {
      tenantId?: string;
      user?: { user_id?: string; role?: string };
    },
  ) {
    this.tenantId = request.tenantId ?? '';
    this.userId = request.user?.user_id ?? '';
    this.correlationId = randomUUID();
    this.kafka = new KafkaProducer();
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

  // ── Purchase Requests ──────────────────────────────────────────────────────

  async createPurchaseRequest(dto: CreatePurchaseRequestDto): Promise<PurchaseRequestRow> {
    const pr = await this.repo.createPurchaseRequest({
      project_id: dto.project_id,
      pr_number: dto.pr_number,
      requested_by: this.userId,
      required_date: dto.required_date,
    });
    logger.info({ pr_id: pr.pr_id, tenant_id: this.tenantId }, 'pr.created');
    return pr;
  }

  // ── RFQ Lifecycle ──────────────────────────────────────────────────────────

  async createRfq(dto: CreateRfqDto): Promise<RfqRow> {
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

    await this.repo.setRfqWorkflowId(rfq.rfq_id, workflowId);

    await this.publishEvent('procurement.rfq.created.v1', {
      rfq_id: rfq.rfq_id,
      pr_id: rfq.pr_id ?? null,
      project_id: rfq.project_id,
      rfq_number: rfq.rfq_number,
      deadline: rfq.deadline.toISOString(),
      created_by: this.userId,
    });

    logger.info(
      { rfq_id: rfq.rfq_id, workflow_id: workflowId, tenant_id: this.tenantId },
      'rfq.created',
    );
    return rfq;
  }

  async publishRfq(rfq_id: string): Promise<void> {
    const rfq = await this.assertRfqStatus(rfq_id, 'DRAFT');
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

    await this.repo.markQuotationSelected(quotation_id, rfq_id);

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

    const quotation = await this.repo.createQuotation({
      rfq_id,
      vendor_id: dto.vendor_id,
      total_amount: dto.total_amount,
      currency_code: dto.currency_code,
      validity_days: dto.validity_days,
      submitted_at: dto.submitted_at,
    });

    logger.info(
      { quotation_id: quotation.quotation_id, rfq_id, vendor_id: dto.vendor_id },
      'quotation.submitted',
    );
    return quotation;
  }

  /**
   * Compare all quotations for an RFQ.
   * Returns them sorted by total_amount ASC (lowest price first).
   * Marks is_selected on the lowest-price quotation.
   * Used after RFQ is CLOSED, before signalling EVALUATED.
   */
  async compareQuotations(rfq_id: string): Promise<QuotationRow[]> {
    await this.assertRfqStatus(rfq_id, 'CLOSED');
    const quotations = await this.repo.findQuotationsByRfq(rfq_id);
    if (quotations.length === 0) {
      throw new UnprocessableEntityException(`RFQ ${rfq_id} has no quotations — cannot evaluate`);
    }

    // Sort by total_amount ASC (decimal-safe comparison)
    const sorted = [...quotations].sort((a, b) =>
      new Decimal(a.total_amount).comparedTo(new Decimal(b.total_amount)),
    );

    // Auto-select lowest price
    const lowest = sorted[0]!;
    await this.repo.markQuotationSelected(lowest.quotation_id, rfq_id);

    logger.info(
      { rfq_id, winner: lowest.quotation_id, total: lowest.total_amount },
      'quotations.evaluated',
    );

    return sorted.map((q) => ({
      ...q,
      is_selected: q.quotation_id === lowest.quotation_id,
    }));
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

    const po = await this.repo.createPurchaseOrder({
      rfq_id: dto.rfq_id,
      vendor_id: dto.vendor_id,
      project_id: dto.project_id,
      po_number: dto.po_number,
      total_amount: computedTotal.toFixed(4),
      currency_code: dto.currency_code,
      delivery_date: dto.delivery_date,
      created_by: this.userId,
    });

    const createdLines = await this.repo.createLineItems(po.po_id, lineItems);

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

    await this.repo.setPoWorkflowId(po.po_id, workflowId);

    await this.publishEvent('procurement.po.created.v1', {
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
      })),
    });

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

    const { delivery, items } = await this.repo.createDelivery({
      po_id,
      delivery_note: dto.delivery_note,
      delivered_at: dto.delivered_at,
      received_by: this.userId,
      notes: dto.notes,
      items: dto.items.map((i) => ({
        line_id: i.line_id,
        quantity_received: i.quantity_received,
      })),
    });

    // Determine partial vs. complete delivery
    const lineItems = await this.repo.findLineItemsByPo(po_id);
    const allFulfilled = await Promise.all(
      lineItems.map(async (li) => {
        const delivered = new Decimal(await this.repo.sumDeliveredQuantity(li.line_id));
        return delivered.greaterThanOrEqualTo(new Decimal(li.quantity));
      }),
    );
    const is_partial = !allFulfilled.every(Boolean);

    // Signal Temporal workflow
    const handle = await this.getPoWorkflowHandle(po);
    await handle.signal(recordDeliverySignal, {
      delivery_id: delivery.delivery_id,
      is_partial,
    });

    await this.publishEvent('procurement.delivery.received.v1', {
      delivery_id: delivery.delivery_id,
      po_id,
      project_id: po.project_id,
      vendor_id: po.vendor_id,
      received_by: this.userId,
      received_at: dto.delivered_at,
      items_received: items.map((i) => ({
        item_id: i.line_id,
        quantity_received: i.quantity_received,
      })),
      partial: is_partial,
    });

    logger.info(
      { delivery_id: delivery.delivery_id, po_id, is_partial, tenant_id: this.tenantId },
      'delivery.recorded',
    );

    return { delivery, is_partial };
  }

  // ── Invoice Receipt ────────────────────────────────────────────────────────

  async receiveInvoice(dto: ReceiveInvoiceDto): Promise<InvoiceRow> {
    const po_id = dto.po_id;
    const po = await this.assertPoStatus(po_id, 'FULLY_DELIVERED');

    const invoice = await this.repo.createInvoice({
      po_id,
      vendor_id: po.vendor_id,
      invoice_number: dto.invoice_number,
      amount: dto.amount,
      currency_code: dto.currency_code,
      invoice_date: dto.invoice_date,
      due_date: dto.due_date,
      file_id: dto.file_id,
    });

    const handle = await this.getPoWorkflowHandle(po);
    await handle.signal(receiveInvoiceSignal, { invoice_id: invoice.invoice_id });

    await this.publishEvent('procurement.invoice.received.v1', {
      invoice_id: invoice.invoice_id,
      po_id,
      project_id: po.project_id,
      vendor_id: po.vendor_id,
      amount: { amount: invoice.amount, currency_code: invoice.currency_code },
      invoice_date: dto.invoice_date,
      due_date: dto.due_date,
    });

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

    await this.repo.updateInvoiceStatus(invoice_id, 'APPROVED');

    const po = await this.repo.findPoById(po_id);

    await this.publishEvent('procurement.vendor_invoice.approved.v1', {
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
    });

    logger.info({ invoice_id, po_id, actor_id: this.userId }, 'invoice.approved');
    return { ...invoice, status: 'APPROVED' };
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

  async listInvoices(params: { po_id?: string; status?: string; page: number; limit: number }) {
    const { rows, total } = await this.repo.findInvoices(params);
    return { items: rows, total, page: params.page, limit: params.limit };
  }

  // ── Private Helpers ────────────────────────────────────────────────────────

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

  private async publishEvent<T>(eventType: string, payload: T): Promise<void> {
    try {
      await this.kafka.connect();
      await this.kafka.publish({
        event_type: eventType,
        event_version: '1.0',
        tenant_id: this.tenantId,
        actor_id: this.userId,
        occurred_at: new Date().toISOString(),
        correlation_id: this.correlationId,
        payload,
      });
    } catch (err) {
      logger.error(
        { event_type: eventType, err, correlation_id: this.correlationId },
        'kafka.publish.failed',
      );
    }
  }
}
