// Procurement Controller — Phase 5
// RBAC per spec §06-rbac-permission-matrix.md:
//   Read access:  EXECUTIVE, PROJECT_MANAGER, FINANCE, PROCUREMENT_OFFICER, PROC_MANAGER, TENANT_ADMIN
//   Vendor CRUD:  PROCUREMENT_OFFICER, PROC_MANAGER, TENANT_ADMIN
//   RFQ publish:  PROCUREMENT_OFFICER, PROC_MANAGER
//   PO approval:  PROJECT_MANAGER (PM tier), FINANCE (FINANCE tier), EXECUTIVE, TENANT_ADMIN
//   Invoice pay:  FINANCE, TENANT_ADMIN

import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
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

@ApiTags('procurement')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class ProcurementController {
  constructor(private readonly svc: ProcurementService) {}

  // ── Vendors ─────────────────────────────────────────────────────────────────

  // POST /api/v1/vendors
  @Post('vendors')
  @Roles(CosRole.PROCUREMENT_OFFICER, CosRole.PROC_MANAGER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Create a new vendor' })
  createVendor(@Body() dto: CreateVendorDto) {
    return this.svc.createVendor(dto);
  }

  // GET /api/v1/vendors
  @Get('vendors')
  @Roles(
    CosRole.EXECUTIVE,
    CosRole.PROJECT_MANAGER,
    CosRole.FINANCE,
    CosRole.PROCUREMENT_OFFICER,
    CosRole.PROC_MANAGER,
    CosRole.TENANT_ADMIN,
  )
  @ApiOperation({ summary: 'List vendors' })
  @ApiQuery({ name: 'active_only', required: false, type: Boolean, description: 'Default: true' })
  listVendors(@Query('active_only') active_only?: string) {
    return this.svc.listVendors(active_only !== 'false');
  }

  // GET /api/v1/vendors/:vendorId
  @Get('vendors/:vendorId')
  @Roles(
    CosRole.EXECUTIVE,
    CosRole.PROJECT_MANAGER,
    CosRole.FINANCE,
    CosRole.PROCUREMENT_OFFICER,
    CosRole.PROC_MANAGER,
    CosRole.TENANT_ADMIN,
  )
  @ApiOperation({ summary: 'Get vendor by ID' })
  @ApiParam({ name: 'vendorId', type: 'string', format: 'uuid' })
  getVendor(@Param('vendorId') vendorId: string) {
    return this.svc.getVendor(vendorId);
  }

  // DELETE /api/v1/vendors/:vendorId
  @Delete('vendors/:vendorId')
  @Roles(CosRole.PROC_MANAGER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Deactivate vendor (soft delete)' })
  @ApiParam({ name: 'vendorId', type: 'string', format: 'uuid' })
  @HttpCode(HttpStatus.NO_CONTENT)
  deactivateVendor(@Param('vendorId') vendorId: string) {
    return this.svc.deactivateVendor(vendorId);
  }

  // ── Purchase Requests ────────────────────────────────────────────────────────

  // POST /api/v1/projects/:projectId/purchase-requests
  @Post('projects/:projectId/purchase-requests')
  @Roles(CosRole.PROCUREMENT_OFFICER, CosRole.PROC_MANAGER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Create a purchase request' })
  @ApiParam({ name: 'projectId', type: 'string', format: 'uuid' })
  createPurchaseRequest(
    @Param('projectId') _projectId: string,
    @Body() dto: CreatePurchaseRequestDto,
  ) {
    return this.svc.createPurchaseRequest(dto);
  }

  // GET /api/v1/projects/:projectId/purchase-requests
  @Get('projects/:projectId/purchase-requests')
  @Roles(
    CosRole.EXECUTIVE,
    CosRole.PROJECT_MANAGER,
    CosRole.FINANCE,
    CosRole.PROCUREMENT_OFFICER,
    CosRole.PROC_MANAGER,
    CosRole.TENANT_ADMIN,
  )
  @ApiOperation({ summary: 'List purchase requests for a project' })
  @ApiParam({ name: 'projectId', type: 'string', format: 'uuid' })
  listPurchaseRequests(@Param('projectId') projectId: string) {
    return this.svc.listPurchaseRequests(projectId);
  }

  // ── RFQs ─────────────────────────────────────────────────────────────────────

  // POST /api/v1/rfqs
  @Post('rfqs')
  @Roles(CosRole.PROCUREMENT_OFFICER, CosRole.PROC_MANAGER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Create an RFQ and start Temporal workflow' })
  createRfq(@Body() dto: CreateRfqDto) {
    return this.svc.createRfq(dto);
  }

  // GET /api/v1/projects/:projectId/rfqs
  @Get('projects/:projectId/rfqs')
  @Roles(
    CosRole.EXECUTIVE,
    CosRole.PROJECT_MANAGER,
    CosRole.FINANCE,
    CosRole.PROCUREMENT_OFFICER,
    CosRole.PROC_MANAGER,
    CosRole.TENANT_ADMIN,
  )
  @ApiOperation({ summary: 'List RFQs for a project' })
  @ApiParam({ name: 'projectId', type: 'string', format: 'uuid' })
  listRfqs(@Param('projectId') projectId: string) {
    return this.svc.listRfqs(projectId);
  }

  // POST /api/v1/rfqs/:rfqId/publish
  @Post('rfqs/:rfqId/publish')
  @Roles(CosRole.PROCUREMENT_OFFICER, CosRole.PROC_MANAGER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Publish RFQ (DRAFT → PUBLISHED)' })
  @ApiParam({ name: 'rfqId', type: 'string', format: 'uuid' })
  @HttpCode(HttpStatus.OK)
  publishRfq(@Param('rfqId') rfqId: string) {
    return this.svc.publishRfq(rfqId);
  }

  // POST /api/v1/rfqs/:rfqId/close
  @Post('rfqs/:rfqId/close')
  @Roles(CosRole.PROCUREMENT_OFFICER, CosRole.PROC_MANAGER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Manually close RFQ (PUBLISHED → CLOSED)' })
  @ApiParam({ name: 'rfqId', type: 'string', format: 'uuid' })
  @HttpCode(HttpStatus.OK)
  closeRfq(@Param('rfqId') rfqId: string) {
    return this.svc.closeRfq(rfqId);
  }

  // POST /api/v1/rfqs/:rfqId/cancel
  @Post('rfqs/:rfqId/cancel')
  @Roles(CosRole.PROCUREMENT_OFFICER, CosRole.PROC_MANAGER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Cancel RFQ' })
  @ApiParam({ name: 'rfqId', type: 'string', format: 'uuid' })
  @HttpCode(HttpStatus.OK)
  cancelRfq(@Param('rfqId') rfqId: string) {
    return this.svc.cancelRfq(rfqId);
  }

  // GET /api/v1/rfqs/:rfqId/quotations
  @Get('rfqs/:rfqId/quotations')
  @Roles(
    CosRole.EXECUTIVE,
    CosRole.PROJECT_MANAGER,
    CosRole.FINANCE,
    CosRole.PROCUREMENT_OFFICER,
    CosRole.PROC_MANAGER,
    CosRole.TENANT_ADMIN,
  )
  @ApiOperation({ summary: 'Compare quotations for an RFQ (sorted by price ASC)' })
  @ApiParam({ name: 'rfqId', type: 'string', format: 'uuid' })
  compareQuotations(@Param('rfqId') rfqId: string) {
    return this.svc.compareQuotations(rfqId);
  }

  // POST /api/v1/rfqs/:rfqId/quotations
  @Post('rfqs/:rfqId/quotations')
  @Roles(CosRole.PROCUREMENT_OFFICER, CosRole.PROC_MANAGER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Submit a vendor quotation for an RFQ' })
  @ApiParam({ name: 'rfqId', type: 'string', format: 'uuid' })
  submitQuotation(@Param('rfqId') rfqId: string, @Body() dto: SubmitQuotationDto) {
    return this.svc.submitQuotation(rfqId, dto);
  }

  // POST /api/v1/rfqs/:rfqId/award
  @Post('rfqs/:rfqId/award')
  @Roles(CosRole.PROCUREMENT_OFFICER, CosRole.PROC_MANAGER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Award RFQ to selected quotation (EVALUATED → AWARDED)' })
  @ApiParam({ name: 'rfqId', type: 'string', format: 'uuid' })
  @HttpCode(HttpStatus.OK)
  awardRfq(@Param('rfqId') rfqId: string, @Body() body: { quotation_id: string }) {
    return this.svc.awardRfq(rfqId, body.quotation_id);
  }

  // ── Purchase Orders ───────────────────────────────────────────────────────────

  // ── Tenant-wide list endpoints (AIP-132 List / AIP-159) ─────────────────────
  // Global procurement inboxes for §20.7.3; tenant-scoped via RLS + JWT.

  // GET /api/v1/purchase-requests
  @Get('purchase-requests')
  @Roles(
    CosRole.EXECUTIVE,
    CosRole.PROJECT_MANAGER,
    CosRole.FINANCE,
    CosRole.PROCUREMENT_OFFICER,
    CosRole.PROC_MANAGER,
    CosRole.TENANT_ADMIN,
  )
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
      page: Math.max(1, parseInt(page, 10) || 1),
      limit: Math.min(100, Math.max(1, parseInt(limit, 10) || 20)),
    });
  }

  // GET /api/v1/rfqs
  @Get('rfqs')
  @Roles(
    CosRole.EXECUTIVE,
    CosRole.PROJECT_MANAGER,
    CosRole.FINANCE,
    CosRole.PROCUREMENT_OFFICER,
    CosRole.PROC_MANAGER,
    CosRole.TENANT_ADMIN,
  )
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
      page: Math.max(1, parseInt(page, 10) || 1),
      limit: Math.min(100, Math.max(1, parseInt(limit, 10) || 20)),
    });
  }

  // GET /api/v1/purchase-orders
  @Get('purchase-orders')
  @Roles(
    CosRole.EXECUTIVE,
    CosRole.PROJECT_MANAGER,
    CosRole.FINANCE,
    CosRole.PROCUREMENT_OFFICER,
    CosRole.PROC_MANAGER,
    CosRole.TENANT_ADMIN,
  )
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
      page: Math.max(1, parseInt(page, 10) || 1),
      limit: Math.min(100, Math.max(1, parseInt(limit, 10) || 20)),
    });
  }

  // GET /api/v1/deliveries
  @Get('deliveries')
  @Roles(
    CosRole.EXECUTIVE,
    CosRole.PROJECT_MANAGER,
    CosRole.FINANCE,
    CosRole.PROCUREMENT_OFFICER,
    CosRole.PROC_MANAGER,
    CosRole.TENANT_ADMIN,
  )
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
      page: Math.max(1, parseInt(page, 10) || 1),
      limit: Math.min(100, Math.max(1, parseInt(limit, 10) || 20)),
    });
  }

  // GET /api/v1/purchase-orders/:poId/deliveries
  @Get('purchase-orders/:poId/deliveries')
  @Roles(
    CosRole.EXECUTIVE,
    CosRole.PROJECT_MANAGER,
    CosRole.FINANCE,
    CosRole.PROCUREMENT_OFFICER,
    CosRole.PROC_MANAGER,
    CosRole.TENANT_ADMIN,
  )
  @ApiOperation({ summary: 'List deliveries recorded against a purchase order' })
  @ApiParam({ name: 'poId', type: 'string', format: 'uuid' })
  listDeliveriesByPo(@Param('poId') poId: string) {
    return this.svc.listDeliveriesByPo(poId);
  }

  // POST /api/v1/purchase-orders
  @Post('purchase-orders')
  @Roles(CosRole.PROCUREMENT_OFFICER, CosRole.PROC_MANAGER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Create a purchase order and start Temporal workflow' })
  createPurchaseOrder(@Body() dto: CreatePurchaseOrderDto) {
    return this.svc.createPurchaseOrder(dto);
  }

  // GET /api/v1/projects/:projectId/purchase-orders
  @Get('projects/:projectId/purchase-orders')
  @Roles(
    CosRole.EXECUTIVE,
    CosRole.PROJECT_MANAGER,
    CosRole.FINANCE,
    CosRole.PROCUREMENT_OFFICER,
    CosRole.PROC_MANAGER,
    CosRole.TENANT_ADMIN,
  )
  @ApiOperation({ summary: 'List purchase orders for a project' })
  @ApiParam({ name: 'projectId', type: 'string', format: 'uuid' })
  listPurchaseOrders(@Param('projectId') projectId: string) {
    return this.svc.listPurchaseOrders(projectId);
  }

  // GET /api/v1/purchase-orders/:poId
  @Get('purchase-orders/:poId')
  @Roles(
    CosRole.EXECUTIVE,
    CosRole.PROJECT_MANAGER,
    CosRole.FINANCE,
    CosRole.PROCUREMENT_OFFICER,
    CosRole.PROC_MANAGER,
    CosRole.TENANT_ADMIN,
  )
  @ApiOperation({ summary: 'Get purchase order detail with line items' })
  @ApiParam({ name: 'poId', type: 'string', format: 'uuid' })
  getPurchaseOrder(@Param('poId') poId: string) {
    return this.svc.getPurchaseOrder(poId);
  }

  // POST /api/v1/purchase-orders/:poId/submit
  @Post('purchase-orders/:poId/submit')
  @Roles(CosRole.PROCUREMENT_OFFICER, CosRole.PROC_MANAGER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Submit PO for approval (DRAFT → PENDING_APPROVAL)' })
  @ApiParam({ name: 'poId', type: 'string', format: 'uuid' })
  @HttpCode(HttpStatus.OK)
  submitPoForApproval(@Param('poId') poId: string) {
    return this.svc.submitPoForApproval(poId);
  }

  // POST /api/v1/purchase-orders/:poId/approve
  @Post('purchase-orders/:poId/approve')
  @Roles(CosRole.PROJECT_MANAGER, CosRole.FINANCE, CosRole.EXECUTIVE, CosRole.TENANT_ADMIN)
  @ApiOperation({
    summary: 'Approve PO for a specific tier (PM / FINANCE / EXECUTIVE / TENANT_ADMIN)',
  })
  @ApiParam({ name: 'poId', type: 'string', format: 'uuid' })
  @HttpCode(HttpStatus.OK)
  approvePo(
    @Param('poId') poId: string,
    @Body() body: { tier: 'PM' | 'FINANCE' | 'EXECUTIVE' | 'TENANT_ADMIN' },
  ) {
    return this.svc.approvePo(poId, body.tier);
  }

  // POST /api/v1/purchase-orders/:poId/reject
  @Post('purchase-orders/:poId/reject')
  @Roles(CosRole.PROJECT_MANAGER, CosRole.FINANCE, CosRole.EXECUTIVE, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Reject PO — returns to DRAFT for revision' })
  @ApiParam({ name: 'poId', type: 'string', format: 'uuid' })
  @HttpCode(HttpStatus.OK)
  rejectPo(@Param('poId') poId: string, @Body() body: { reason: string }) {
    return this.svc.rejectPo(poId, body.reason);
  }

  // POST /api/v1/purchase-orders/:poId/acknowledge
  @Post('purchase-orders/:poId/acknowledge')
  @Roles(CosRole.PROCUREMENT_OFFICER, CosRole.PROC_MANAGER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Record vendor acknowledgement (SENT → ACKNOWLEDGED)' })
  @ApiParam({ name: 'poId', type: 'string', format: 'uuid' })
  @HttpCode(HttpStatus.OK)
  acknowledgePo(@Param('poId') poId: string) {
    return this.svc.acknowledgePo(poId);
  }

  // ── Deliveries ────────────────────────────────────────────────────────────────

  // POST /api/v1/purchase-orders/:poId/deliveries
  @Post('purchase-orders/:poId/deliveries')
  @Roles(CosRole.PROCUREMENT_OFFICER, CosRole.PROC_MANAGER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Record a delivery against a purchase order' })
  @ApiParam({ name: 'poId', type: 'string', format: 'uuid' })
  recordDelivery(@Param('poId') poId: string, @Body() dto: RecordDeliveryDto) {
    return this.svc.recordDelivery(poId, dto);
  }

  // ── Invoices ──────────────────────────────────────────────────────────────────

  // POST /api/v1/purchase-orders/:poId/invoices
  @Post('purchase-orders/:poId/invoices')
  @Roles(CosRole.PROCUREMENT_OFFICER, CosRole.PROC_MANAGER, CosRole.FINANCE, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Receive a vendor invoice against a fully-delivered PO' })
  @ApiParam({ name: 'poId', type: 'string', format: 'uuid' })
  receiveInvoice(@Param('poId') poId: string, @Body() dto: ReceiveInvoiceDto) {
    return this.svc.receiveInvoice(poId, dto);
  }

  // GET /api/v1/purchase-orders/:poId/invoices
  @Get('purchase-orders/:poId/invoices')
  @Roles(
    CosRole.EXECUTIVE,
    CosRole.PROJECT_MANAGER,
    CosRole.FINANCE,
    CosRole.PROCUREMENT_OFFICER,
    CosRole.PROC_MANAGER,
    CosRole.TENANT_ADMIN,
  )
  @ApiOperation({ summary: 'List invoices for a purchase order' })
  @ApiParam({ name: 'poId', type: 'string', format: 'uuid' })
  listInvoices(@Param('poId') poId: string) {
    return this.svc.listInvoicesByPo(poId);
  }

  // POST /api/v1/purchase-orders/:poId/invoices/:invoiceId/approve
  @Post('purchase-orders/:poId/invoices/:invoiceId/approve')
  @Roles(CosRole.FINANCE, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Approve vendor invoice (RECEIVED/VERIFIED → APPROVED)' })
  @ApiParam({ name: 'poId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'invoiceId', type: 'string', format: 'uuid' })
  @HttpCode(HttpStatus.OK)
  approveInvoice(@Param('poId') poId: string, @Param('invoiceId') invoiceId: string) {
    return this.svc.approveInvoice(poId, invoiceId);
  }

  // POST /api/v1/purchase-orders/:poId/mark-paid
  @Post('purchase-orders/:poId/mark-paid')
  @Roles(CosRole.FINANCE, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Mark PO invoice as paid (INVOICED → PAID)' })
  @ApiParam({ name: 'poId', type: 'string', format: 'uuid' })
  @HttpCode(HttpStatus.OK)
  markInvoicePaid(@Param('poId') poId: string) {
    return this.svc.markInvoicePaid(poId);
  }

  // POST /api/v1/purchase-orders/:poId/dispute
  @Post('purchase-orders/:poId/dispute')
  @Roles(CosRole.FINANCE, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Dispute invoice (INVOICED → DISPUTED)' })
  @ApiParam({ name: 'poId', type: 'string', format: 'uuid' })
  @HttpCode(HttpStatus.OK)
  disputeInvoice(@Param('poId') poId: string, @Body() body: { reason: string }) {
    return this.svc.disputeInvoice(poId, body.reason);
  }
}
