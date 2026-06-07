// Finance Module — Phase 7
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { FinanceRepository } from './finance.repository';
import { FinanceConsumer } from './finance.consumer';
import { WhtService } from './wht.service';
import { ExchangeRateService } from './exchange-rate.service';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [TenantModule, ScheduleModule.forRoot()],
  controllers: [FinanceController],
  providers: [FinanceService, FinanceRepository, FinanceConsumer, WhtService, ExchangeRateService],
  exports: [FinanceService, WhtService, ExchangeRateService],
})
export class FinanceModule {}
