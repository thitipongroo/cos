import { Module } from '@nestjs/common';
import {
  WorkerController,
  ProjectWorkforceController,
  TimesheetController,
} from './workforce.controller';
import { WorkforceService } from './workforce.service';
import { WorkforceRepository } from './workforce.repository';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [TenantModule],
  controllers: [WorkerController, ProjectWorkforceController, TimesheetController],
  providers: [WorkforceService, WorkforceRepository],
  exports: [WorkforceService],
})
export class WorkforceModule {}
