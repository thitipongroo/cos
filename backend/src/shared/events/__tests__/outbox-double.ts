// Shared test double for EventOutboxService.
//
// Domain services no longer hold a KafkaProducer — they queue events through the outbox — so every
// service suite needs the same stand-in. One shared double rather than a per-suite object literal:
// the specs assert on what was queued, and two slightly different fakes would let one suite's
// assertions drift from what the service actually calls.

import type { EventOutboxService } from '../event-outbox.service';

export interface OutboxDouble {
  service: EventOutboxService;
  /** Every envelope handed to publish(), in order — this is what suites assert against. */
  published: Array<Record<string, unknown>>;
  publish: jest.Mock;
}

export function makeOutboxDouble(): OutboxDouble {
  const published: Array<Record<string, unknown>> = [];
  const publish = jest.fn(async (event: Record<string, unknown>) => {
    published.push(event);
    return 'outbox-event-id';
  });
  return { service: { publish } as unknown as EventOutboxService, published, publish };
}
