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
  ],
  exports: [FinanceService, WhtService, ExchangeRateService],
})
export class FinanceModule {}
