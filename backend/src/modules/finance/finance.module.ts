// Finance Module — Phase 7
import { Module } from '@nestjs/common';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { FinanceRepository } from './finance.repository';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [TenantModule],
  controllers: [FinanceController],
  providers: [FinanceService, FinanceRepository],
  exports: [FinanceService],
})
export class FinanceModule {}
