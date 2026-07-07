// Vendor Portal controllers (ADR-030).
//   VendorInvitationController — buyer side: a Procurement Officer issues an RFQ invitation
//     (internal Keycloak JWT + RBAC). Path under /procurement so normal TenantMiddleware applies.
//   VendorPortalController — vendor side: external users; tenant + vendor context is set by
//     VendorAuthMiddleware (Tier-1 magic-link token in path, or Tier-2 session + tenant header).

import {
  Controller,
  Get,
  Post,
  Param,
  ParseUUIDPipe,
  Body,
  Req,
  UnauthorizedException,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../identity/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { Roles } from '@cos/rbac';
import { CosRole } from '@cos/types';
import { VendorPortalService } from './vendor-portal.service';
import { VendorRequest } from './vendor-auth.middleware';
import { IssueInvitationDto, SubmitQuotationDto, SubmitInvoiceDto } from './dto/vendor-portal.dto';

const INVITE_ROLES = [
  CosRole.PROCUREMENT_OFFICER,
  CosRole.PROC_MANAGER,
  CosRole.TENANT_ADMIN,
] as const;

@ApiTags('Vendor Portal (buyer)')
@ApiBearerAuth()
@Controller('procurement/rfqs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VendorInvitationController {
  constructor(private readonly service: VendorPortalService) {}

  @Post(':rfqId/invitations')
  @Roles(...INVITE_ROLES)
  @ApiOperation({ summary: 'Issue an RFQ invitation to a vendor (returns the magic-link token)' })
  @ApiParam({ name: 'rfqId', format: 'uuid' })
  issueInvitation(@Param('rfqId', ParseUUIDPipe) rfqId: string, @Body() dto: IssueInvitationDto) {
    return this.service.issueInvitation({
      rfqId,
      vendorId: dto.vendor_id,
      email: dto.email,
      displayName: dto.display_name,
    });
  }
}

@ApiTags('Vendor Portal (vendor)')
@Controller('vendor')
export class VendorPortalController {
  constructor(private readonly service: VendorPortalService) {}

  // ── Tier 1: magic-link (no account) ──

  @Get('rfq/:token')
  @ApiOperation({ summary: 'Open an invited RFQ (Tier-1 magic-link)' })
  @ApiParam({ name: 'token', description: 'Invitation magic-link token' })
  openRfq(@Param('token') token: string, @Req() req: VendorRequest) {
    return this.service.openRfq(token, this.invitationId(req));
  }

  @Post('rfq/:token/quotation')
  @ApiOperation({ summary: 'Submit a quotation for an invited RFQ (Tier-1 magic-link)' })
  @ApiParam({ name: 'token', description: 'Invitation magic-link token' })
  submitQuotation(
    @Param('token') token: string,
    @Body() dto: SubmitQuotationDto,
    @Req() req: VendorRequest,
  ) {
    return this.service.submitQuotation(token, this.invitationId(req), dto);
  }

  // ── Tier 2: vendor session (Bearer + x-vendor-tenant-id) ──

  @Get('purchase-orders')
  @ApiOperation({ summary: 'Track status of POs on the linked trading relationship (Tier-2)' })
  listPurchaseOrders(@Req() req: VendorRequest) {
    return this.service.listPurchaseOrders(this.vendorId(req));
  }

  @Post('invoices')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Submit an invoice against one of the vendor's POs (Tier-2)" })
  submitInvoice(@Body() dto: SubmitInvoiceDto, @Req() req: VendorRequest) {
    return this.service.submitInvoice(this.vendorId(req), dto);
  }

  @Get('invoices')
  @ApiOperation({ summary: "List the vendor's own invoices (Tier-2)" })
  listInvoices(@Req() req: VendorRequest) {
    return this.service.listInvoices(this.vendorId(req));
  }

  @Get('quotations')
  @ApiOperation({ summary: "List the vendor's own submitted quotations (Tier-2)" })
  listQuotations(@Req() req: VendorRequest) {
    return this.service.listQuotations(this.vendorId(req));
  }

  @Get('rfqs')
  @ApiOperation({ summary: 'List RFQs this vendor was invited to (Tier-2, G-W3)' })
  listInvitedRfqs(@Req() req: VendorRequest) {
    return this.service.listInvitedRfqs(this.vendorIdentityId(req));
  }

  // VendorAuthMiddleware guarantees these are set; guard against misconfiguration.
  private invitationId(req: VendorRequest): string {
    if (!req.vendorInvitationId) {
      throw new UnauthorizedException('Missing vendor invitation context');
    }
    return req.vendorInvitationId;
  }

  private vendorId(req: VendorRequest): string {
    if (!req.vendorId) {
      throw new UnauthorizedException('Missing vendor session context');
    }
    return req.vendorId;
  }

  private vendorIdentityId(req: VendorRequest): string {
    if (!req.vendorIdentityId) {
      throw new UnauthorizedException('Missing vendor session context');
    }
    return req.vendorIdentityId;
  }
}
