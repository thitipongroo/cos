// Procurement Controller — Phase 5
// Canonical path convention (spec §14 + ADR-022): the entire procurement module —
// vendors included — is served under /api/v1/procurement/* (ADR-022 override of §14's
// former separate /api/v1/vendors namespace). Tenant scoping is enforced server-side
// via RLS + JWT. RBAC per spec §06-rbac-permission-matrix.md.

import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  ParseUUIDPipe,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../identity/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { Roles } from '@cos/rbac';
import { CosRole } from '@cos/types';
import { ProcurementService } from './procurement.service';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { CreatePurchaseRequestDto } from './dto/create-purchase-request.dto';
import { CreateRfqDto } from './dto/create-rfq.dto';
import { SubmitQuotationDto } from './dto/submit-quotation.dto';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { RecordDeliveryDto } from './dto/record-delivery.dto';
import { ReceiveInvoiceDto } from './dto/receive-invoice.dto';

// Read access across procurement (spec §06): all office/management + procurement roles.
const READ_ROLES = [
  CosRole.EXECUTIVE,
  CosRole.PROJECT_MANAGER,
  CosRole.FINANCE,
  CosRole.PROCUREMENT_OFFICER,
  CosRole.PROC_MANAGER,
  CosRole.TENANT_ADMIN,
] as const;

function parsePage(page: string): number {
  return Math.max(1, parseInt(page, 10) || 1);
}
function parseLimit(limit: string): number {
  return Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
}

@ApiTags('procurement')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class ProcurementController {
  constructor(private readonly svc: ProcurementService) {}

  // ── Vendors (unified under /procurement/* — overrides §14 separate Vendor APIs; ADR-022) ───

  // POST /api/v1/procurement/vendors
  @Post('procurement/vendors')
  @Roles(CosRole.PROCUREMENT_OFFICER, CosRole.PROC_MANAGER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Create a new vendor' })
  createVendor(@Body() dto: CreateVendorDto) {
    return this.svc.createVendor(dto);
  }

  // GET /api/v1/procurement/vendors
  @Get('procurement/vendors')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'List vendors' })
  @ApiQuery({ name: 'active_only', required: false, type: Boolean, description: 'Default: true' })
  listVendors(@Query('active_only') active_only?: string) {
    return this.svc.listVendors(active_only !== 'false');
  }

  // GET /api/v1/procurement/vendors/:vendorId
  @Get('procurement/vendors/:vendorId')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Get vendor by ID' })
  @ApiParam({ name: 'vendorId', type: 'string', format: 'uuid' })
  getVendor(@Param('vendorId', ParseUUIDPipe) vendorId: string) {
    return this.svc.getVendor(vendorId);
  }

  // GET /api/v1/procurement/vendors/:vendorId/quotations  (vendor quotation history)
  @Get('procurement/vendors/:vendorId/quotations')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: "List a vendor's quotation history (all RFQs, newest first)" })
  @ApiParam({ name: 'vendorId', type: 'string', format: 'uuid' })
  getVendorQuotations(@Param('vendorId', ParseUUIDPipe) vendorId: string) {
    return this.svc.getVendorQuotations(vendorId);
  }

  // DELETE /api/v1/procurement/vendors/:vendorId
  @Delete('procurement/vendors/:vendorId')
  @Roles(CosRole.PROC_MANAGER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Deactivate vendor (soft delete)' })
  @ApiParam({ name: 'vendorId', type: 'string', format: 'uuid' })
  @HttpCode(HttpStatus.NO_CONTENT)
  deactivateVendor(@Param('vendorId', ParseUUIDPipe) vendorId: string) {
    return this.svc.deactivateVendor(vendorId);
  }

  // ── Purchase Requests ─────────────────────────────────────────────────────────

  // POST /api/v1/procurement/purchase-requests  (project_id in body)
  @Post('procurement/purchase-requests')
  @Roles(CosRole.PROCUREMENT_OFFICER, CosRole.PROC_MANAGER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Create a purchase request' })
  createPurchaseRequest(@Body() dto: CreatePurchaseRequestDto) {
    return this.svc.createPurchaseRequest(dto);
  }

  // GET /api/v1/procurement/purchase-requests  (tenant-wide, AIP-132; ?project_id= to scope)
  @Get('procurement/purchase-requests')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'List purchase requests across the tenant (filterable)' })
  @ApiQuery({ name: 'project_id', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  listAllPurchaseRequests(
    @Query('project_id') project_id?: string,
    @Query('status') status?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.svc.listAllPurchaseRequests({
      project_id,
      status,
      page: parsePage(page),
      limit: parseLimit(limit),
    });
  }

  // ── RFQs ──────────────────────────────────────────────────────────────────────

  // POST /api/v1/procurement/rfqs
  @Post('procurement/rfqs')
  @Roles(CosRole.PROCUREMENT_OFFICER, CosRole.PROC_MANAGER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Create an RFQ and start Temporal workflow' })
  createRfq(@Body() dto: CreateRfqDto) {
    return this.svc.createRfq(dto);
  }

  // GET /api/v1/procurement/rfqs  (tenant-wide, AIP-132; ?project_id= to scope)
  @Get('procurement/rfqs')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'List RFQs across the tenant (filterable)' })
  @ApiQuery({ name: 'project_id', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  listAllRfqs(
    @Query('project_id') project_id?: string,
    @Query('status') status?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.svc.listAllRfqs({
      project_id,
      status,
      page: parsePage(page),
      limit: parseLimit(limit),
    });
  }

  // POST /api/v1/procurement/rfqs/:rfqId/publish
  @Post('procurement/rfqs/:rfqId/publish')
  @Roles(CosRole.PROCUREMENT_OFFICER, CosRole.PROC_MANAGER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Publish RFQ (DRAFT → PUBLISHED)' })
  @ApiParam({ name: 'rfqId', type: 'string', format: 'uuid' })
  @HttpCode(HttpStatus.OK)
  publishRfq(@Param('rfqId', ParseUUIDPipe) rfqId: string) {
    return this.svc.publishRfq(rfqId);
  }

  // POST /api/v1/procurement/rfqs/:rfqId/close
  @Post('procurement/rfqs/:rfqId/close')
  @Roles(CosRole.PROCUREMENT_OFFICER, CosRole.PROC_MANAGER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Manually close RFQ (PUBLISHED → CLOSED)' })
  @ApiParam({ name: 'rfqId', type: 'string', format: 'uuid' })
  @HttpCode(HttpStatus.OK)
  closeRfq(@Param('rfqId', ParseUUIDPipe) rfqId: string) {
    return this.svc.closeRfq(rfqId);
  }

  // POST /api/v1/procurement/rfqs/:rfqId/cancel
  @Post('procurement/rfqs/:rfqId/cancel')
  @Roles(CosRole.PROCUREMENT_OFFICER, CosRole.PROC_MANAGER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Cancel RFQ' })
  @ApiParam({ name: 'rfqId', type: 'string', format: 'uuid' })
  @HttpCode(HttpStatus.OK)
  cancelRfq(@Param('rfqId', ParseUUIDPipe) rfqId: string) {
    return this.svc.cancelRfq(rfqId);
  }

  // GET /api/v1/procurement/rfqs/:rfqId/quotations
  @Get('procurement/rfqs/:rfqId/quotations')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Compare quotations for an RFQ (sorted by price ASC)' })
  @ApiParam({ name: 'rfqId', type: 'string', format: 'uuid' })
  compareQuotations(@Param('rfqId', ParseUUIDPipe) rfqId: string) {
    return this.svc.compareQuotations(rfqId);
  }

  // POST /api/v1/procurement/rfqs/:rfqId/quotations
  @Post('procurement/rfqs/:rfqId/quotations')
  @Roles(CosRole.PROCUREMENT_OFFICER, CosRole.PROC_MANAGER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Submit a vendor quotation for an RFQ' })
  @ApiParam({ name: 'rfqId', type: 'string', format: 'uuid' })
  submitQuotation(@Param('rfqId', ParseUUIDPipe) rfqId: string, @Body() dto: SubmitQuotationDto) {
    return this.svc.submitQuotation(rfqId, dto);
  }

  // POST /api/v1/procurement/rfqs/:rfqId/award
  @Post('procurement/rfqs/:rfqId/award')
  @Roles(CosRole.PROCUREMENT_OFFICER, CosRole.PROC_MANAGER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Award RFQ to selected quotation (EVALUATED → AWARDED)' })
  @ApiParam({ name: 'rfqId', type: 'string', format: 'uuid' })
  @HttpCode(HttpStatus.OK)
  awardRfq(@Param('rfqId', ParseUUIDPipe) rfqId: string, @Body() body: { quotation_id: string }) {
    return this.svc.awardRfq(rfqId, body.quotation_id);
  }

  // ── Purchase Orders ───────────────────────────────────────────────────────────

  // POST /api/v1/procurement/purchase-orders
  @Post('procurement/purchase-orders')
  @Roles(CosRole.PROCUREMENT_OFFICER, CosRole.PROC_MANAGER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Create a purchase order and start Temporal workflow' })
  createPurchaseOrder(@Body() dto: CreatePurchaseOrderDto) {
    return this.svc.createPurchaseOrder(dto);
  }

  // GET /api/v1/procurement/purchase-orders  (tenant-wide, AIP-132; ?project_id= to scope)
  @Get('procurement/purchase-orders')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'List purchase orders across the tenant (filterable)' })
  @ApiQuery({ name: 'project_id', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  listAllPurchaseOrders(
    @Query('project_id') project_id?: string,
    @Query('status') status?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.svc.listAllPurchaseOrders({
      project_id,
      status,
      page: parsePage(page),
      limit: parseLimit(limit),
    });
  }

  // GET /api/v1/procurement/purchase-orders/:poId
  @Get('procurement/purchase-orders/:poId')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Get purchase order detail with line items' })
  @ApiParam({ name: 'poId', type: 'string', format: 'uuid' })
  getPurchaseOrder(@Param('poId', ParseUUIDPipe) poId: string) {
    return this.svc.getPurchaseOrder(poId);
  }

  // GET /api/v1/procurement/purchase-orders/:poId/deliveries
  @Get('procurement/purchase-orders/:poId/deliveries')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'List deliveries recorded against a purchase order' })
  @ApiParam({ name: 'poId', type: 'string', format: 'uuid' })
  listDeliveriesByPo(@Param('poId', ParseUUIDPipe) poId: string) {
    return this.svc.listDeliveriesByPo(poId);
  }

  // POST /api/v1/procurement/purchase-orders/:poId/submit
  @Post('procurement/purchase-orders/:poId/submit')
  @Roles(CosRole.PROCUREMENT_OFFICER, CosRole.PROC_MANAGER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Submit PO for approval (DRAFT → PENDING_APPROVAL)' })
  @ApiParam({ name: 'poId', type: 'string', format: 'uuid' })
  @HttpCode(HttpStatus.OK)
  submitPoForApproval(@Param('poId', ParseUUIDPipe) poId: string) {
    return this.svc.submitPoForApproval(poId);
  }

  // POST /api/v1/procurement/purchase-orders/:poId/approve
  @Post('procurement/purchase-orders/:poId/approve')
  @Roles(CosRole.PROJECT_MANAGER, CosRole.FINANCE, CosRole.EXECUTIVE, CosRole.TENANT_ADMIN)
  @ApiOperation({
    summary: 'Approve PO for a specific tier (PM / FINANCE / EXECUTIVE / TENANT_ADMIN)',
  })
  @ApiParam({ name: 'poId', type: 'string', format: 'uuid' })
  @HttpCode(HttpStatus.OK)
  approvePo(
    @Param('poId', ParseUUIDPipe) poId: string,
    @Body() body: { tier: 'PM' | 'FINANCE' | 'EXECUTIVE' | 'TENANT_ADMIN' },
  ) {
    return this.svc.approvePo(poId, body.tier);
  }

  // POST /api/v1/procurement/purchase-orders/:poId/reject
  @Post('procurement/purchase-orders/:poId/reject')
  @Roles(CosRole.PROJECT_MANAGER, CosRole.FINANCE, CosRole.EXECUTIVE, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Reject PO — returns to DRAFT for revision' })
  @ApiParam({ name: 'poId', type: 'string', format: 'uuid' })
  @HttpCode(HttpStatus.OK)
  rejectPo(@Param('poId', ParseUUIDPipe) poId: string, @Body() body: { reason: string }) {
    return this.svc.rejectPo(poId, body.reason);
  }

  // POST /api/v1/procurement/purchase-orders/:poId/acknowledge
  @Post('procurement/purchase-orders/:poId/acknowledge')
  @Roles(CosRole.PROCUREMENT_OFFICER, CosRole.PROC_MANAGER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Record vendor acknowledgement (SENT → ACKNOWLEDGED)' })
  @ApiParam({ name: 'poId', type: 'string', format: 'uuid' })
  @HttpCode(HttpStatus.OK)
  acknowledgePo(@Param('poId', ParseUUIDPipe) poId: string) {
    return this.svc.acknowledgePo(poId);
  }

  // POST /api/v1/procurement/purchase-orders/:poId/mark-paid
  @Post('procurement/purchase-orders/:poId/mark-paid')
  @Roles(CosRole.FINANCE, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Mark PO invoice as paid (INVOICED → PAID)' })
  @ApiParam({ name: 'poId', type: 'string', format: 'uuid' })
  @HttpCode(HttpStatus.OK)
  markInvoicePaid(@Param('poId', ParseUUIDPipe) poId: string) {
    return this.svc.markInvoicePaid(poId);
  }

  // POST /api/v1/procurement/purchase-orders/:poId/dispute
  @Post('procurement/purchase-orders/:poId/dispute')
  @Roles(CosRole.FINANCE, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Dispute invoice (INVOICED → DISPUTED)' })
  @ApiParam({ name: 'poId', type: 'string', format: 'uuid' })
  @HttpCode(HttpStatus.OK)
  disputeInvoice(@Param('poId', ParseUUIDPipe) poId: string, @Body() body: { reason: string }) {
    return this.svc.disputeInvoice(poId, body.reason);
  }

  // ── Deliveries (spec §14: flat /api/v1/procurement/deliveries) ────────────────

  // POST /api/v1/procurement/deliveries  (po_id in body)
  @Post('procurement/deliveries')
  @Roles(CosRole.PROCUREMENT_OFFICER, CosRole.PROC_MANAGER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Record a delivery against a purchase order' })
  recordDelivery(@Body() dto: RecordDeliveryDto) {
    return this.svc.recordDelivery(dto);
  }

  // GET /api/v1/procurement/deliveries  (tenant-wide, AIP-132; ?po_id= to scope)
  @Get('procurement/deliveries')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'List deliveries across the tenant (filterable by PO)' })
  @ApiQuery({ name: 'po_id', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  listAllDeliveries(
    @Query('po_id') po_id?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.svc.listAllDeliveries({
      po_id,
      page: parsePage(page),
      limit: parseLimit(limit),
    });
  }

  // ── Vendor invoices (spec §14: flat /api/v1/procurement/vendor-invoices) ──────

  // POST /api/v1/procurement/vendor-invoices  (po_id in body)
  @Post('procurement/vendor-invoices')
  @Roles(CosRole.PROCUREMENT_OFFICER, CosRole.PROC_MANAGER, CosRole.FINANCE, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Receive a vendor invoice against a fully-delivered PO' })
  receiveInvoice(@Body() dto: ReceiveInvoiceDto) {
    return this.svc.receiveInvoice(dto);
  }

  // GET /api/v1/procurement/vendor-invoices  (tenant-wide AP queue, AIP-132; ?po_id= ?status=)
  @Get('procurement/vendor-invoices')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'List vendor invoices across the tenant (filterable by PO/status)' })
  @ApiQuery({ name: 'po_id', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  listInvoices(
    @Query('po_id') po_id?: string,
    @Query('status') status?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.svc.listInvoices({
      po_id,
      status,
      page: parsePage(page),
      limit: parseLimit(limit),
    });
  }

  // POST /api/v1/procurement/vendor-invoices/:invoiceId/approve
  @Post('procurement/vendor-invoices/:invoiceId/approve')
  @Roles(CosRole.FINANCE, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Approve vendor invoice (RECEIVED/VERIFIED → APPROVED)' })
  @ApiParam({ name: 'invoiceId', type: 'string', format: 'uuid' })
  @HttpCode(HttpStatus.OK)
  approveInvoice(@Param('invoiceId', ParseUUIDPipe) invoiceId: string) {
    return this.svc.approveInvoice(invoiceId);
  }
}
