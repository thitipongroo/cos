// AI Controller — tenant-facing AI metering.
// Canonical path: /api/v1/ai/*. RBAC: usage is visible to TENANT_ADMIN (the platform usage dashboard,
// §26) and FINANCE (they own the AI cost line, §31.3 AIHighTokenUsage notifies both).
//
// NOTE: /ai/intent and /ai/transcribe (the mobile voice features) are NOT served here yet — they need
// the LLM gateway's provider adapter wired with OPENAI_API_KEY + the LLM01/LLM10 controls (§22) before
// they can go live. This controller currently exposes only the (safe, no-external-call) usage read.

import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../identity/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { Roles } from '@cos/rbac';
import { CosRole } from '@cos/types';
import { AiUsageService, type AiUsageSummary } from './ai-usage.service';

@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly usage: AiUsageService) {}

  // GET /api/v1/ai/usage — current-month token usage vs plan quota for the tenant (§26 metering).
  @Get('usage')
  @Roles(CosRole.TENANT_ADMIN, CosRole.FINANCE)
  @ApiOperation({ summary: 'AI token usage vs monthly quota for the current tenant (§26)' })
  async getUsage(): Promise<AiUsageSummary> {
    return this.usage.getUsage();
  }
}
