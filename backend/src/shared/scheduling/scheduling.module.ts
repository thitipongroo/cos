// Global module for ScheduledJobLockService (ADR-095). The scheduled jobs it guards live in four different
// feature modules (notification ×2, finance, sync), and making each of them import a SchedulingModule
// would put an import in every module that ever grows a @Cron. Global matches how LastSeenModule
// solves the same shape of problem.

import { Global, Module } from '@nestjs/common';
import { ScheduledJobLockService } from './scheduled-job-lock.service';

@Global()
@Module({
  providers: [ScheduledJobLockService],
  exports: [ScheduledJobLockService],
})
export class SchedulingModule {}
