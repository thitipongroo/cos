// KafkaService — publishes file domain events via @cos/shared KafkaProducer.
// Canonical event names per spec §32.4 migration table:
//   file.document.uploaded.v1    (was: file.uploaded)
//   file.document.quarantined.v1 (was: file.quarantined)

import { KafkaProducer } from '@cos/shared';
import type { FileDocumentUploadedPayload, FileDocumentQuarantinedPayload } from '@cos/shared';

export class KafkaService {
  private readonly producer: KafkaProducer;
  private connected = false;

  constructor() {
    this.producer = new KafkaProducer();
  }

  async connect(): Promise<void> {
    if (!this.connected) {
      await this.producer.connect();
      this.connected = true;
    }
  }

  async publishFileUploaded(params: {
    tenantId: string;
    actorId: string;
    payload: FileDocumentUploadedPayload;
    traceId: string;
  }): Promise<void> {
    await this.producer.publish(
      {
        event_type: 'file.document.uploaded.v1',
        event_version: '1.0',
        tenant_id: params.tenantId,
        actor_id: params.actorId,
        occurred_at: new Date().toISOString(),
        correlation_id: params.traceId,
        trace_id: params.traceId,
        span_id: null,
        payload: params.payload,
      },
      { traceId: params.traceId },
    );
  }

  async publishFileQuarantined(params: {
    tenantId: string;
    actorId: string;
    payload: FileDocumentQuarantinedPayload;
    traceId: string;
  }): Promise<void> {
    await this.producer.publish(
      {
        event_type: 'file.document.quarantined.v1',
        event_version: '1.0',
        tenant_id: params.tenantId,
        actor_id: params.actorId,
        occurred_at: new Date().toISOString(),
        correlation_id: params.traceId,
        trace_id: params.traceId,
        span_id: null,
        payload: params.payload,
      },
      { traceId: params.traceId },
    );
  }

  async disconnect(): Promise<void> {
    await this.producer.disconnect();
    this.connected = false;
  }
}
