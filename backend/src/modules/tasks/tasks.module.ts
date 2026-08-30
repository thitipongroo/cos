import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { TasksRepository } from './tasks.repository';
import { TenantModule } from '../tenant/tenant.module';
import { TasksDelayConsumer } from './tasks.delay.consumer';

@Module({
  imports: [TenantModule],
  controllers: [TasksController],
  // TasksDelayConsumer is the §Phase 6 gate-6 half that was missing: it turns
  // construction.delay.detected.v1 into task.status = BLOCKED.
  providers: [TasksService, TasksRepository, TasksDelayConsumer],
  exports: [TasksService],
})
export class TasksModule {}
