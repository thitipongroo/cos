// ExpoPushAdapter — delivers push notifications via Expo Push API.
// Routes to APNs (iOS) + FCM (Android) through Expo infrastructure.
// NOT direct firebase-admin FCM (spec §19.2).

import Expo, { type ExpoPushMessage } from 'expo-server-sdk';
import { Injectable } from '@nestjs/common';
import { createLogger } from '@cos/logger';

const logger = createLogger('expo-push-adapter');
const expo = new Expo();

@Injectable()
export class ExpoPushAdapter {
  async send(params: {
    pushToken: string;
    title: string | null;
    body: string;
    notificationId: string;
  }): Promise<void> {
    if (!Expo.isExpoPushToken(params.pushToken)) {
      logger.warn({ pushToken: params.pushToken }, 'Invalid Expo push token — skipping');
      return;
    }

    const message: ExpoPushMessage = {
      to: params.pushToken,
      sound: 'default',
      title: params.title ?? undefined,
      body: params.body,
      data: { notification_id: params.notificationId },
    };

    const chunks = expo.chunkPushNotifications([message]);
    for (const chunk of chunks) {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      for (const ticket of tickets) {
        if (ticket.status === 'error') {
          logger.error(
            { details: ticket.details, notification_id: params.notificationId },
            'Expo push delivery error',
          );
        }
      }
    }
  }
}
