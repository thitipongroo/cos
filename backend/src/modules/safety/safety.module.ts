import { Module } from '@nestjs/common';
import { SafetyController } from './safety.controller';
import { SafetyService } from './safety.service';
import { SafetyRepository } from './safety.repository';
import { TenantModule } from '../tenant/tenant.module';
import { SiteOpsModule } from '../site-ops/site-ops.module';

@Module({
  imports: [TenantModule, SiteOpsModule],
  controllers: [SafetyController],
  providers: [SafetyService, SafetyRepository],
  exports: [SafetyService],
})
export class SafetyModule {}
