import { Controller, Post, Body, Req, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PlatformWebhookService } from './platform-webhook.service';

export class EnterpriseContractSignedWebhookDto {
  @ApiProperty({ format: 'uuid', example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsUUID()
  tenant_id!: string;

  @ApiPropertyOptional({ example: 'CRM-CONTRACT-2026-00142', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  contract_reference?: string;
}

interface WebhookRequest {
  headers: Record<string, string | string[] | undefined>;
  rawBody?: Buffer;
}

@ApiTags('platform-webhooks')
@Controller('platform/webhooks')
export class PlatformWebhookController {
  constructor(private readonly webhookService: PlatformWebhookService) {}

  @Post('enterprise-contract-signed')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Receive enterprise contract-signed signal — starts provisioning workflow',
  })
  async enterpriseContractSigned(
    @Body() dto: EnterpriseContractSignedWebhookDto,
    @Req() req: WebhookRequest,
  ) {
    const signature = (req.headers['x-webhook-signature'] as string) ?? '';
    return this.webhookService.handleEnterpriseContractSigned(
      dto.tenant_id,
      dto.contract_reference,
      signature,
      req.rawBody,
    );
  }
}
