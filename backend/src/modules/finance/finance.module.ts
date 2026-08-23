// Finance Module — Phase 7
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { FinanceController } from './finance.controller';
import { ContractSignPublicController } from './contract-sign-public.controller';
import { FinanceService } from './finance.service';
import { FinanceRepository } from './finance.repository';
import { FinanceConsumer } from './finance.consumer';
import { ContractSignLinkService } from './contract-sign-link.service';
import { ContractSignTokenGuard } from './contract-sign-token.guard';
import { WhtService } from './wht.service';
import { ExchangeRateService } from './exchange-rate.service';
import { LedgerReconciliationService } from './ledger-reconciliation.service';
import { CashflowRiskService } from './cashflow-risk.service';
import { TenantModule } from '../tenant/tenant.module';
import { FilesModule } from '../files/files.module';
import { CredentialsModule } from '../credentials/credentials.module';

@Module({
  imports: [TenantModule, ScheduleModule.forRoot(), FilesModule, CredentialsModule],
  controllers: [FinanceController, ContractSignPublicController],
  providers: [
    FinanceService,
    FinanceRepository,
    FinanceConsumer,
    ContractSignLinkService,
    ContractSignTokenGuard,
    WhtService,
    ExchangeRateService,
    // Read-only cross-schema sweep; its @Cron is discovered by the ScheduleModule.forRoot() above,
    // and the ScheduledJobLockService it leases against comes from the @Global SchedulingModule.
    LedgerReconciliationService,
    // Daily @Cron; grades the SAME buildForecast the pull endpoint uses so an alert cannot disagree
    // with the screen an operator opens to check it (TDD OQ-50).
    CashflowRiskService,
  ],
  exports: [
    FinanceService,
    WhtService,
    ExchangeRateService,
    LedgerReconciliationService,
    CashflowRiskService,
  ],
})
export class FinanceModule {}
