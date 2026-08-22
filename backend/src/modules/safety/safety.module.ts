import { Module } from '@nestjs/common';
import { SafetyController } from './safety.controller';
import { SafetyService } from './safety.service';
import { SafetyRepository } from './safety.repository';
import { PermitExpiryService } from './permit-expiry.service';
import { TenantModule } from '../tenant/tenant.module';
import { SiteOpsModule } from '../site-ops/site-ops.module';

@Module({
  imports: [TenantModule, SiteOpsModule],
  controllers: [SafetyController],
  // PermitExpiryService's @Cron is discovered by the app-wide ScheduleModule.forRoot(); the lease it
  // takes comes from the @Global SchedulingModule, so no import is needed here.
  providers: [SafetyService, SafetyRepository, PermitExpiryService],
  exports: [SafetyService],
})
export class SafetyModule {}
