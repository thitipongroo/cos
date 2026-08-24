// ContractSignPublicController — the external client-signing surface (ADR-058 CT-5). Separate from
// FinanceController because it is NOT behind JwtAuthGuard: the client authenticates solely with the
// single-use magic-link token (ContractSignTokenGuard), which sets the tenant context.

import { Body, Controller, Ip, Param, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { FinanceService } from './finance.service';
import { ContractSignTokenGuard } from './contract-sign-token.guard';
import { ClientSignDto } from './dto/ar-billing.dto';

@ApiTags('finance')
@Controller()
export class ContractSignPublicController {
  constructor(private readonly svc: FinanceService) {}

  // POST /api/v1/finance/contracts/sign/:token — external client signs via magic-link (no account)
  @Post('finance/contracts/sign/:token')
  @UseGuards(ContractSignTokenGuard)
  @ApiOperation({ summary: 'External client signs a contract via a single-use magic-link token' })
  @ApiParam({ name: 'token', description: 'Single-use contract-signing magic-link token' })
  signAsClient(@Param('token') token: string, @Body() dto: ClientSignDto, @Ip() ip: string) {
    return this.svc.signContractAsClient(token, dto, ip);
  }
}
