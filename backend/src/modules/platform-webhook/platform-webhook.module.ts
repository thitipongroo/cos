import { Module } from '@nestjs/common';
import { PlatformWebhookController } from './platform-webhook.controller';
import { PlatformWebhookService } from './platform-webhook.service';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [TenantModule],
  controllers: [PlatformWebhookController],
  providers: [PlatformWebhookService],
})
export class PlatformWebhookModule {}
