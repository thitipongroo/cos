import { Injectable, UnauthorizedException, InternalServerErrorException } from '@nestjs/common';
import { TenantService } from '../tenant/tenant.service';

@Injectable()
export class PlatformWebhookService {
  constructor(private readonly tenantService: TenantService) {}

  async handleEnterpriseContractSigned(
    tenantId: string,
    contractReference: string | undefined,
    signature: string,
    rawBody: Buffer | undefined,
  ): Promise<{ message: string; workflowId: string; tenantId: string }> {
    this.verifyHmacSignature(signature, rawBody);
    const result = await this.tenantService.markAsEnterpriseContracted(
      tenantId,
      contractReference,
      'system',
    );
    return {
      message: 'Webhook accepted',
      workflowId: result.workflowId,
      tenantId,
    };
  }

  private verifyHmacSignature(signature: string, rawBody: Buffer | undefined): void {
    const secret = process.env['PLATFORM_WEBHOOK_SECRET'];
    if (!secret) throw new InternalServerErrorException('Webhook secret not configured');
    if (!signature) throw new UnauthorizedException('Missing X-Webhook-Signature header');
    if (!rawBody)
      throw new InternalServerErrorException(
        'Raw body unavailable — check server rawBody configuration',
      );

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createHmac, timingSafeEqual } = require('crypto') as typeof import('crypto');
    const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
    const sigBuffer = Buffer.from(signature, 'utf8');
    const expectedBuffer = Buffer.from(expected, 'utf8');

    if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
  }
}
