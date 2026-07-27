// AI module — token metering (§26) + the LLM gateway (§22.5 GW-001).
// Imports TenantModule for TenantPrismaService (ai.token_usage, tenant-scoped) + TenantService
// (plan-tier quota lookup). Exports the gateway + usage service so future AI features route through them.

import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { AiUsageService } from './ai-usage.service';
import { LlmGatewayService } from './llm-gateway.service';
import { AiController } from './ai.controller';

@Module({
  imports: [TenantModule],
  controllers: [AiController],
  providers: [AiUsageService, LlmGatewayService],
  exports: [AiUsageService, LlmGatewayService],
})
export class AiModule {}
