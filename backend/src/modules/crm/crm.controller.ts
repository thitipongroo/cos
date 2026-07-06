// CRM Controller — §14 CRM APIs + read endpoints for the UI (ADR-029).
// Canonical prefix /api/v1/crm/*. RBAC §21.6: read = EXECUTIVE + CRM_SALES_MANAGER; write = CRM_SALES_MANAGER.

import {
  Controller,
  Get,
  Post,
  Patch,
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
import { CrmService } from './crm.service';
import { CreateLeadDto, CreateOpportunityDto, CreateContactDto } from './dto/crm.dto';

const CRM_READ_ROLES = [
  CosRole.EXECUTIVE,
  CosRole.CRM_SALES_MANAGER,
  CosRole.TENANT_ADMIN,
] as const;
const CRM_WRITE_ROLES = [CosRole.CRM_SALES_MANAGER, CosRole.TENANT_ADMIN] as const;

@ApiTags('crm')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class CrmController {
  constructor(private readonly svc: CrmService) {}

  // ── Leads ───────────────────────────────────────────────────────────────────

  // POST /api/v1/crm/leads
  @Post('crm/leads')
  @Roles(...CRM_WRITE_ROLES)
  @ApiOperation({ summary: 'Create a lead' })
  createLead(@Body() dto: CreateLeadDto) {
    return this.svc.createLead(dto);
  }

  // GET /api/v1/crm/leads
  @Get('crm/leads')
  @Roles(...CRM_READ_ROLES)
  @ApiOperation({ summary: 'List leads (filterable by status)' })
  @ApiQuery({ name: 'status', required: false, type: String })
  listLeads(@Query('status') status?: string) {
    return this.svc.listLeads(status);
  }

  // ── Opportunities ─────────────────────────────────────────────────────────

  // POST /api/v1/crm/opportunities
  @Post('crm/opportunities')
  @Roles(...CRM_WRITE_ROLES)
  @ApiOperation({ summary: 'Create an opportunity from a lead (qualifies the lead)' })
  createOpportunity(@Body() dto: CreateOpportunityDto) {
    return this.svc.createOpportunity(dto);
  }

  // GET /api/v1/crm/opportunities
  @Get('crm/opportunities')
  @Roles(...CRM_READ_ROLES)
  @ApiOperation({ summary: 'List opportunities (filterable by status)' })
  @ApiQuery({ name: 'status', required: false, type: String })
  listOpportunities(@Query('status') status?: string) {
    return this.svc.listOpportunities(status);
  }

  // PATCH /api/v1/crm/opportunities/:opportunityId/convert
  @Patch('crm/opportunities/:opportunityId/convert')
  @Roles(...CRM_WRITE_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Convert a won opportunity to a Customer (finance.customers)' })
  @ApiParam({ name: 'opportunityId', type: 'string', format: 'uuid' })
  convert(@Param('opportunityId', ParseUUIDPipe) opportunityId: string) {
    return this.svc.convertOpportunity(opportunityId);
  }

  // ── Contacts ────────────────────────────────────────────────────────────────

  // POST /api/v1/crm/contacts
  @Post('crm/contacts')
  @Roles(...CRM_WRITE_ROLES)
  @ApiOperation({ summary: 'Create a contact under a lead' })
  createContact(@Body() dto: CreateContactDto) {
    return this.svc.createContact(dto);
  }

  // GET /api/v1/crm/contacts
  @Get('crm/contacts')
  @Roles(...CRM_READ_ROLES)
  @ApiOperation({ summary: 'List contacts (filterable by lead)' })
  @ApiQuery({ name: 'lead_id', required: false, type: String })
  listContacts(@Query('lead_id') leadId?: string) {
    return this.svc.listContacts(leadId);
  }

  // ── Customers ───────────────────────────────────────────────────────────────

  // GET /api/v1/crm/customers
  @Get('crm/customers')
  @Roles(...CRM_READ_ROLES)
  @ApiOperation({ summary: 'List customers (finance.customers)' })
  listCustomers() {
    return this.svc.listCustomers();
  }
}
