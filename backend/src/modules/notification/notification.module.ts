// Notification Module — Phase 20
import { Module } from '@nestjs/common';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { NotificationRepository } from './notification.repository';
import { NotificationPrismaService } from './notification-prisma.service';
import { NotificationSseService } from './notification.sse.service';
import { NotificationConsumer } from './notification.consumer';
import { NotificationEscalationService } from './notification.escalation.service';
import { NotificationDigestService } from './notification.digest.service';
import { ExpoPushAdapter } from './adapters/expo-push.adapter';
import { SendGridAdapter } from './adapters/sendgrid.adapter';
import { LineMessagingAdapter } from './adapters/line-messaging.adapter';

@Module({
  controllers: [NotificationController],
  providers: [
    NotificationPrismaService,
    NotificationRepository,
    NotificationSseService,
    ExpoPushAdapter,
    SendGridAdapter,
    LineMessagingAdapter,
    NotificationService,
    NotificationConsumer,
    NotificationEscalationService,
    NotificationDigestService,
  ],
  exports: [NotificationService],
})
export class NotificationModule {}
