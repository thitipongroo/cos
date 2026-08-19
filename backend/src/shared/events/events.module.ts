// Global module for the event outbox (ADR-094).
//
// EventOutboxService replaces a KafkaProducer that twelve feature services each constructed for
// themselves, so it has to be reachable from all twelve — and from the next one, without that module
// having to remember to import anything. Global for the same reason as LastSeenModule.
//
// OutboxPollerService is registered here rather than started from main.ts (which is what the original
// @cos/shared comment envisaged) so that Nest owns its lifecycle: it starts on application bootstrap
// and, more importantly, stops on shutdown, letting the in-flight batch finish rather than being cut
// off when the pod is killed.

import { Global, Module } from '@nestjs/common';
import { EventOutboxService } from './event-outbox.service';
import { OutboxPollerService } from './outbox-poller.service';

@Global()
@Module({
  providers: [EventOutboxService, OutboxPollerService],
  exports: [EventOutboxService],
})
export class EventsModule {}
