// BOQ Controller — Phase 4
// 9 endpoints per spec. RBAC enforced via JwtAuthGuard + RolesGuard.
// Read access: EXECUTIVE, PROJECT_MANAGER, FINANCE, PROCUREMENT_OFFICER, TENANT_ADMIN
// Write access: PROJECT_MANAGER, TENANT_ADMIN (DRAFT mutations)
// Approve: TENANT_ADMIN (matches spec §6.2 TENANT_ADMIN full access; PM approves budgets per §6.4)

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  ParseUUIDPipe,
  Query,
  Body,
  Res,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../identity/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { Roles } from '@cos/rbac';
import { CosRole } from '@cos/types';
import { BoqService } from './boq.service';
import { CreateBoqVersionDto } from './dto/create-boq-version.dto';
import { AddBoqCategoryDto } from './dto/add-boq-category.dto';
import { AddBoqItemDto } from './dto/add-boq-item.dto';
import { UpdateBoqItemDto } from './dto/update-boq-item.dto';

@ApiTags('boq')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class BoqController {
  constructor(private readonly boqService: BoqService) {}

  // POST /api/v1/projects/:projectId/boq/versions
  @Post('projects/:projectId/boq/versions')
  @Roles(CosRole.PROJECT_MANAGER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Create a new BOQ version for a project' })
  @ApiParam({ name: 'projectId', type: 'string', format: 'uuid' })
  createVersion(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateBoqVersionDto,
  ) {
    return this.boqService.createVersion(projectId, dto);
  }

  // GET /api/v1/projects/:projectId/boq/versions
  @Get('projects/:projectId/boq/versions')
  @Roles(
    CosRole.EXECUTIVE,
    CosRole.PROJECT_MANAGER,
    CosRole.FINANCE,
    CosRole.PROCUREMENT_OFFICER,
    CosRole.TENANT_ADMIN,
    CosRole.SITE_ENGINEER,
  )
  @ApiOperation({ summary: 'List all BOQ versions for a project' })
  @ApiParam({ name: 'projectId', type: 'string', format: 'uuid' })
  listVersions(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.boqService.listVersions(projectId);
  }

  // GET /api/v1/projects/:projectId/boq/versions/:versionId
  @Get('projects/:projectId/boq/versions/:versionId')
  @Roles(
    CosRole.EXECUTIVE,
    CosRole.PROJECT_MANAGER,
    CosRole.FINANCE,
    CosRole.PROCUREMENT_OFFICER,
    CosRole.TENANT_ADMIN,
    CosRole.SITE_ENGINEER,
  )
  @ApiOperation({ summary: 'Get BOQ version detail with categories and items' })
  @ApiParam({ name: 'projectId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'versionId', type: 'string', format: 'uuid' })
  getVersionDetail(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
  ) {
    return this.boqService.getVersionDetail(projectId, versionId);
  }

  // POST /api/v1/projects/:projectId/boq/versions/:versionId/approve
  @Post('projects/:projectId/boq/versions/:versionId/approve')
  @Roles(CosRole.PROJECT_MANAGER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Approve a DRAFT BOQ version (sets previous APPROVED to SUPERSEDED)' })
  @ApiParam({ name: 'projectId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'versionId', type: 'string', format: 'uuid' })
  @HttpCode(HttpStatus.OK)
  approveVersion(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
  ) {
    return this.boqService.approveVersion(projectId, versionId);
  }

  // POST /api/v1/boq/versions/:versionId/categories
  @Post('boq/versions/:versionId/categories')
  @Roles(CosRole.PROJECT_MANAGER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Add a category to a DRAFT BOQ version' })
  @ApiParam({ name: 'versionId', type: 'string', format: 'uuid' })
  addCategory(
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Body() dto: AddBoqCategoryDto,
  ) {
    return this.boqService.addCategory(versionId, dto);
  }

  // POST /api/v1/boq/versions/:versionId/items
  @Post('boq/versions/:versionId/items')
  @Roles(CosRole.PROJECT_MANAGER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Add a line item to a DRAFT BOQ version' })
  @ApiParam({ name: 'versionId', type: 'string', format: 'uuid' })
  addItem(@Param('versionId', ParseUUIDPipe) versionId: string, @Body() dto: AddBoqItemDto) {
    return this.boqService.addItem(versionId, dto);
  }

  // PATCH /api/v1/boq/items/:itemId
  @Patch('boq/items/:itemId')
  @Roles(CosRole.PROJECT_MANAGER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Update a BOQ line item (DRAFT version only)' })
  @ApiParam({ name: 'itemId', type: 'string', format: 'uuid' })
  updateItem(@Param('itemId', ParseUUIDPipe) itemId: string, @Body() dto: UpdateBoqItemDto) {
    return this.boqService.updateItem(itemId, dto);
  }

  // DELETE /api/v1/boq/items/:itemId
  @Delete('boq/items/:itemId')
  @Roles(CosRole.PROJECT_MANAGER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Delete a BOQ line item (DRAFT version only)' })
  @ApiParam({ name: 'itemId', type: 'string', format: 'uuid' })
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteItem(@Param('itemId', ParseUUIDPipe) itemId: string) {
    return this.boqService.deleteItem(itemId);
  }

  // GET /api/v1/boq/versions/:versionId/export
  @Get('boq/versions/:versionId/export')
  @Roles(
    CosRole.EXECUTIVE,
    CosRole.PROJECT_MANAGER,
    CosRole.FINANCE,
    CosRole.PROCUREMENT_OFFICER,
    CosRole.TENANT_ADMIN,
  )
  @ApiOperation({
    summary: 'Export a BOQ version as structured JSON (default) or CSV (?format=csv)',
  })
  @ApiParam({ name: 'versionId', type: 'string', format: 'uuid' })
  @ApiQuery({ name: 'format', required: false, enum: ['json', 'csv'], description: 'default json' })
  async exportVersion(
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Res({ passthrough: true }) res: Response,
    @Query('format') format?: string,
  ) {
    if (format === 'csv') {
      const csv = await this.boqService.exportVersionCsv(versionId);
      res.header('Content-Type', 'text/csv; charset=utf-8');
      res.header('Content-Disposition', `attachment; filename="boq-${versionId}.csv"`);
      return csv;
    }
    return this.boqService.exportVersion(versionId);
  }
}
