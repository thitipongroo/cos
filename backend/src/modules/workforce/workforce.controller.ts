// Workforce Controller — Phase 22

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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { WorkforceService } from './workforce.service';
import { CreateWorkerDto } from './dto/create-worker.dto';
import { AllocateWorkerDto } from './dto/allocate-worker.dto';
import { RecordAttendanceDto } from './dto/attendance.dto';
import { SubmitTimesheetDto } from './dto/timesheet.dto';

@ApiTags('Workforce')
@ApiBearerAuth()
@Controller('api/v1/workers')
export class WorkerController {
  constructor(private readonly service: WorkforceService) {}

  @Post()
  @ApiOperation({ summary: 'Create worker' })
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateWorkerDto) {
    return this.service.createWorker(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List workers (tenant-scoped)' })
  list() {
    return this.service.listWorkers();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get worker detail' })
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getWorker(id);
  }

  @Post(':id/attendance')
  @ApiOperation({ summary: 'Record check-in / check-out' })
  @HttpCode(HttpStatus.CREATED)
  recordAttendance(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RecordAttendanceDto) {
    return this.service.recordAttendance(id, dto);
  }

  @Get(':id/attendance')
  @ApiOperation({ summary: 'Attendance history (date range)' })
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  getAttendance(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.service.getAttendanceHistory(id, from, to);
  }
}

@ApiTags('Workforce')
@ApiBearerAuth()
@Controller('api/v1/projects/:projectId/workforce')
export class ProjectWorkforceController {
  constructor(private readonly service: WorkforceService) {}

  @Post()
  @ApiOperation({ summary: 'Allocate worker to project' })
  @HttpCode(HttpStatus.CREATED)
  allocate(@Param('projectId', ParseUUIDPipe) projectId: string, @Body() dto: AllocateWorkerDto) {
    return this.service.allocateToProject(projectId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List project workforce' })
  list(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.service.getProjectWorkforce(projectId);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Manpower summary for analytics' })
  summary(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.service.getManpowerSummary(projectId);
  }
}

@ApiTags('Workforce')
@ApiBearerAuth()
@Controller('api/v1/timesheets')
export class TimesheetController {
  constructor(private readonly service: WorkforceService) {}

  @Post()
  @ApiOperation({ summary: 'Submit timesheet' })
  @HttpCode(HttpStatus.CREATED)
  submit(@Body() dto: SubmitTimesheetDto) {
    return this.service.submitTimesheet(dto);
  }

  @Patch(':id/approve')
  @ApiOperation({ summary: 'Approve timesheet (ROLE: SITE_ENGINEER)' })
  approve(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.approveTimesheet(id);
  }
}
