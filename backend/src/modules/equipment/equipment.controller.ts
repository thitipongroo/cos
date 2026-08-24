// Equipment Controller — Phase 21
// OpenAPI annotations match spec §21 API list.

import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../identity/guards/jwt-auth.guard';
import { EquipmentService } from './equipment.service';
import { CreateEquipmentDto } from './dto/create-equipment.dto';
import { AssignEquipmentDto, ReturnEquipmentDto } from './dto/assign-equipment.dto';
import { UpdateEquipmentStatusDto } from './dto/update-status.dto';
import { LogMaintenanceDto } from './dto/log-maintenance.dto';
import { RecordUtilizationDto } from './dto/record-utilization.dto';
import { Roles } from '@cos/rbac';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { CosRole } from '@cos/types';

// 06-rbac-permission-matrix §Construction Modules, Equipment row:
//   Executive R | PM RW | Site Engineer R | Procurement R | Finance R | Safety — | CRM — | Tenant Admin FULL
//
// Both controllers carried the JWT guard alone and NOT ONE @Roles decorator, so every write was
// open to any authenticated user in the tenant — a SITE_WORKER or VIEWER could create equipment,
// flip its status, assign it to a project and log maintenance costs against it. @Roles alone would
// not have helped either: it is SetMetadata, inert unless RolesGuard reads it (the same pairing that
// was missing from all seven project controllers).
const EQUIPMENT_WRITE_ROLES = [CosRole.PROJECT_MANAGER, CosRole.TENANT_ADMIN] as const;

// Reads are gated too, rather than left as "any role": the matrix gives Safety and CRM/Sales no
// Equipment access at all, and an unrestricted read route would hand both of them the fleet.
const EQUIPMENT_READ_ROLES = [
  CosRole.EXECUTIVE,
  CosRole.PROJECT_MANAGER,
  CosRole.SITE_ENGINEER,
  CosRole.PROCUREMENT_OFFICER,
  CosRole.FINANCE,
  CosRole.TENANT_ADMIN,
] as const;

@ApiTags('Equipment')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('equipment')
export class EquipmentController {
  constructor(private readonly service: EquipmentService) {}

  @Post()
  @Roles(...EQUIPMENT_WRITE_ROLES)
  @ApiOperation({ summary: 'Create equipment' })
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateEquipmentDto) {
    return this.service.createEquipment(dto);
  }

  @Get()
  @Roles(...EQUIPMENT_READ_ROLES)
  @ApiOperation({ summary: 'List equipment (filterable by status, type)' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'type', required: false })
  list(@Query('status') status?: string, @Query('type') type?: string) {
    return this.service.listEquipment({ status, type });
  }

  @Get(':id')
  @Roles(...EQUIPMENT_READ_ROLES)
  @ApiOperation({ summary: 'Get equipment detail' })
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getEquipment(id);
  }

  @Patch(':id/status')
  @Roles(...EQUIPMENT_WRITE_ROLES)
  @ApiOperation({ summary: 'Update equipment status' })
  updateStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateEquipmentStatusDto) {
    return this.service.updateStatus(id, dto.status);
  }

  @Post(':id/assignments')
  @Roles(...EQUIPMENT_WRITE_ROLES)
  @ApiOperation({ summary: 'Assign equipment to project' })
  @HttpCode(HttpStatus.CREATED)
  assign(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignEquipmentDto) {
    return this.service.assignToProject(id, dto);
  }

  @Patch(':id/assignments/:aid/return')
  @Roles(...EQUIPMENT_WRITE_ROLES)
  @ApiOperation({ summary: 'Return equipment from project' })
  returnEquipment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('aid', ParseUUIDPipe) aid: string,
    @Body() dto: ReturnEquipmentDto,
  ) {
    return this.service.returnFromProject(id, aid, dto);
  }

  @Post(':id/maintenance')
  @Roles(...EQUIPMENT_WRITE_ROLES)
  @ApiOperation({ summary: 'Log maintenance record' })
  @HttpCode(HttpStatus.CREATED)
  logMaintenance(@Param('id', ParseUUIDPipe) id: string, @Body() dto: LogMaintenanceDto) {
    return this.service.logMaintenance(id, dto);
  }

  @Post(':id/utilization')
  @Roles(...EQUIPMENT_WRITE_ROLES)
  @ApiOperation({ summary: 'Record daily utilization' })
  @HttpCode(HttpStatus.CREATED)
  recordUtilization(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RecordUtilizationDto) {
    return this.service.recordUtilization(id, dto);
  }
}

@ApiTags('Equipment')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('projects/:projectId/equipment')
export class ProjectEquipmentController {
  constructor(private readonly service: EquipmentService) {}

  @Get()
  @Roles(...EQUIPMENT_READ_ROLES)
  @ApiOperation({ summary: 'Get equipment on project' })
  getByProject(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.service.getEquipmentByProject(projectId);
  }
}
