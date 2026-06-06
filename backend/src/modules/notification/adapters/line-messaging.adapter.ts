// LineMessagingAdapter — LINE push message delivery via LINE Messaging API.
// Tenant configures LINE Channel Access Token in tenant settings.
// MVP: uses LINE_CHANNEL_ACCESS_TOKEN env var; per-tenant token in Stage 2.

import { messagingApi } from '@line/bot-sdk';
import { Injectable } from '@nestjs/common';
import { createLogger } from '@cos/logger';

const logger = createLogger('line-messaging-adapter');

@Injectable()
export class LineMessagingAdapter {
  async send(params: { lineUserId: string; body: string }): Promise<void> {
    const channelAccessToken = process.env['LINE_CHANNEL_ACCESS_TOKEN'];
    if (!channelAccessToken) {
      logger.warn('LINE_CHANNEL_ACCESS_TOKEN not set — LINE delivery disabled');
      return;
    }

    const client = new messagingApi.MessagingApiClient({ channelAccessToken });
    await client.pushMessage({
      to: params.lineUserId,
      messages: [{ type: 'text', text: params.body }],
    });

    logger.info({ lineUserId: params.lineUserId }, 'LINE push message sent');
  }
}
