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
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
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
  createVersion(@Param('projectId') projectId: string, @Body() dto: CreateBoqVersionDto) {
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
  listVersions(@Param('projectId') projectId: string) {
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
  getVersionDetail(@Param('projectId') projectId: string, @Param('versionId') versionId: string) {
    return this.boqService.getVersionDetail(projectId, versionId);
  }

  // POST /api/v1/projects/:projectId/boq/versions/:versionId/approve
  @Post('projects/:projectId/boq/versions/:versionId/approve')
  @Roles(CosRole.PROJECT_MANAGER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Approve a DRAFT BOQ version (sets previous APPROVED to SUPERSEDED)' })
  @ApiParam({ name: 'projectId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'versionId', type: 'string', format: 'uuid' })
  @HttpCode(HttpStatus.OK)
  approveVersion(@Param('projectId') projectId: string, @Param('versionId') versionId: string) {
    return this.boqService.approveVersion(projectId, versionId);
  }

  // POST /api/v1/boq/versions/:versionId/categories
  @Post('boq/versions/:versionId/categories')
  @Roles(CosRole.PROJECT_MANAGER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Add a category to a DRAFT BOQ version' })
  @ApiParam({ name: 'versionId', type: 'string', format: 'uuid' })
  addCategory(@Param('versionId') versionId: string, @Body() dto: AddBoqCategoryDto) {
    return this.boqService.addCategory(versionId, dto);
  }

  // POST /api/v1/boq/versions/:versionId/items
  @Post('boq/versions/:versionId/items')
  @Roles(CosRole.PROJECT_MANAGER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Add a line item to a DRAFT BOQ version' })
  @ApiParam({ name: 'versionId', type: 'string', format: 'uuid' })
  addItem(@Param('versionId') versionId: string, @Body() dto: AddBoqItemDto) {
    return this.boqService.addItem(versionId, dto);
  }

  // PATCH /api/v1/boq/items/:itemId
  @Patch('boq/items/:itemId')
  @Roles(CosRole.PROJECT_MANAGER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Update a BOQ line item (DRAFT version only)' })
  @ApiParam({ name: 'itemId', type: 'string', format: 'uuid' })
  updateItem(@Param('itemId') itemId: string, @Body() dto: UpdateBoqItemDto) {
    return this.boqService.updateItem(itemId, dto);
  }

  // DELETE /api/v1/boq/items/:itemId
  @Delete('boq/items/:itemId')
  @Roles(CosRole.PROJECT_MANAGER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Delete a BOQ line item (DRAFT version only)' })
  @ApiParam({ name: 'itemId', type: 'string', format: 'uuid' })
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteItem(@Param('itemId') itemId: string) {
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
  @ApiOperation({ summary: 'Export BOQ version as structured JSON' })
  @ApiParam({ name: 'versionId', type: 'string', format: 'uuid' })
  exportVersion(@Param('versionId') versionId: string) {
    // projectId derived from version — pass empty string, service resolves internally
    return this.boqService.exportVersion('', versionId);
  }
}
