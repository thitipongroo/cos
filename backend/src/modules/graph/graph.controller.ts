// Graph Controller — Phase 13
// 5 graph API endpoints per spec §Phase 13 Graph APIs.
// All endpoints require JWT auth + tenant_id query param for isolation.
// Source: context/00_master_construction_os.md §Phase 13
import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../identity/guards/jwt-auth.guard';
import { GraphService } from './graph.service';

@ApiTags('graph')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class GraphController {
  constructor(private readonly svc: GraphService) {}

  // GET /api/v1/graph/projects/:projectId/vendors
  @Get('graph/projects/:projectId/vendors')
  @ApiOperation({ summary: 'All vendors supplying to a project' })
  @ApiParam({ name: 'projectId', type: 'string', format: 'uuid' })
  @ApiQuery({ name: 'tenantId', type: 'string', format: 'uuid' })
  getVendors(@Param('projectId') projectId: string, @Query('tenantId') tenantId: string) {
    return this.svc.getVendorsForProject(projectId, tenantId);
  }

  // GET /api/v1/graph/projects/:projectId/supply-chain
  @Get('graph/projects/:projectId/supply-chain')
  @ApiOperation({ summary: 'Material supply chain for a project' })
  @ApiParam({ name: 'projectId', type: 'string', format: 'uuid' })
  @ApiQuery({ name: 'tenantId', type: 'string', format: 'uuid' })
  getSupplyChain(@Param('projectId') projectId: string, @Query('tenantId') tenantId: string) {
    return this.svc.getSupplyChain(projectId, tenantId);
  }

  // GET /api/v1/graph/projects/:projectId/inspections
  @Get('graph/projects/:projectId/inspections')
  @ApiOperation({ summary: 'All inspections for a project (pass/fail summary)' })
  @ApiParam({ name: 'projectId', type: 'string', format: 'uuid' })
  @ApiQuery({ name: 'tenantId', type: 'string', format: 'uuid' })
  getInspections(@Param('projectId') projectId: string, @Query('tenantId') tenantId: string) {
    return this.svc.getInspectionsForProject(projectId, tenantId);
  }

  // GET /api/v1/graph/vendors/:vendorId/projects
  @Get('graph/vendors/:vendorId/projects')
  @ApiOperation({ summary: 'Vendor relationship map — projects sharing this vendor' })
  @ApiParam({ name: 'vendorId', type: 'string', format: 'uuid' })
  @ApiQuery({ name: 'tenantId', type: 'string', format: 'uuid' })
  getVendorProjects(@Param('vendorId') vendorId: string, @Query('tenantId') tenantId: string) {
    return this.svc.getProjectsForVendor(vendorId, tenantId);
  }

  // GET /api/v1/graph/vendors/:vendorId/invoices
  @Get('graph/vendors/:vendorId/invoices')
  @ApiOperation({ summary: 'All invoices submitted by a vendor' })
  @ApiParam({ name: 'vendorId', type: 'string', format: 'uuid' })
  @ApiQuery({ name: 'tenantId', type: 'string', format: 'uuid' })
  getVendorInvoices(@Param('vendorId') vendorId: string, @Query('tenantId') tenantId: string) {
    return this.svc.getInvoicesForVendor(vendorId, tenantId);
  }
}
