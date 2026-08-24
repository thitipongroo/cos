// Standalone NotificationService for contexts with no Nest DI container.
//
// A Temporal activity runs in the worker process, outside the Nest application, so it cannot inject
// NotificationService — the same constraint that made assignDedicatedDbActivity encrypt
// unconditionally rather than resolve FeatureFlagService. Building the graph by hand here keeps the
// wiring in ONE place instead of every activity assembling its own (or, as the §19.8 human gate did,
// bypassing the service entirely and writing raw SQL that drifted from the schema).
//
// SSE is included for completeness but reaches nobody from a worker process: the subscriber map
// lives in whichever process holds the HTTP connection. The inbox row and the email — the two
// channels §19.8 asks for — do not depend on it.

import { NotificationService } from './notification.service';
import { NotificationRepository } from './notification.repository';
import { NotificationPrismaService } from './notification-prisma.service';
import { NotificationSseService } from './notification.sse.service';
import { ExpoPushAdapter } from './adapters/expo-push.adapter';
import { SendGridAdapter } from './adapters/sendgrid.adapter';
import { LineMessagingAdapter } from './adapters/line-messaging.adapter';

export interface StandaloneNotifier {
  service: NotificationService;
  /** Releases the Prisma clients the repository and tenant-router opened. */
  dispose: () => Promise<void>;
}

export function createStandaloneNotifier(): StandaloneNotifier {
  const db = new NotificationPrismaService();
  const repo = new NotificationRepository(db);
  const sse = new NotificationSseService();
  const push = new ExpoPushAdapter();
  const email = new SendGridAdapter();
  const line = new LineMessagingAdapter();

  // Nest would call this lifecycle hook; constructed by hand, nothing does — and without it
  // sgMail never receives the API key, so every send would fail authentication instead of
  // logging the "not configured" skip the adapter intends.
  email.onModuleInit();

  return {
    service: new NotificationService(repo, sse, push, email, line),
    dispose: async (): Promise<void> => {
      await repo.onModuleDestroy();
      await db.onModuleDestroy();
    },
  };
}
