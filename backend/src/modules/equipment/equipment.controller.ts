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
import { LogMaintenanceDto } from './dto/log-maintenance.dto';
import { RecordUtilizationDto } from './dto/record-utilization.dto';

@ApiTags('Equipment')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('equipment')
export class EquipmentController {
  constructor(private readonly service: EquipmentService) {}

  @Post()
  @ApiOperation({ summary: 'Create equipment' })
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateEquipmentDto) {
    return this.service.createEquipment(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List equipment (filterable by status, type)' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'type', required: false })
  list(@Query('status') status?: string, @Query('type') type?: string) {
    return this.service.listEquipment({ status, type });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get equipment detail' })
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getEquipment(id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update equipment status' })
  updateStatus(@Param('id', ParseUUIDPipe) id: string, @Body('status') status: string) {
    return this.service.updateStatus(id, status);
  }

  @Post(':id/assignments')
  @ApiOperation({ summary: 'Assign equipment to project' })
  @HttpCode(HttpStatus.CREATED)
  assign(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignEquipmentDto) {
    return this.service.assignToProject(id, dto);
  }

  @Patch(':id/assignments/:aid/return')
  @ApiOperation({ summary: 'Return equipment from project' })
  returnEquipment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('aid', ParseUUIDPipe) aid: string,
    @Body() dto: ReturnEquipmentDto,
  ) {
    return this.service.returnFromProject(id, aid, dto);
  }

  @Post(':id/maintenance')
  @ApiOperation({ summary: 'Log maintenance record' })
  @HttpCode(HttpStatus.CREATED)
  logMaintenance(@Param('id', ParseUUIDPipe) id: string, @Body() dto: LogMaintenanceDto) {
    return this.service.logMaintenance(id, dto);
  }

  @Post(':id/utilization')
  @ApiOperation({ summary: 'Record daily utilization' })
  @HttpCode(HttpStatus.CREATED)
  recordUtilization(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RecordUtilizationDto) {
    return this.service.recordUtilization(id, dto);
  }
}

@ApiTags('Equipment')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/equipment')
export class ProjectEquipmentController {
  constructor(private readonly service: EquipmentService) {}

  @Get()
  @ApiOperation({ summary: 'Get equipment on project' })
  getByProject(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.service.getEquipmentByProject(projectId);
  }
}
