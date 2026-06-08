import { getMeter } from './otel';

const SCOPE = '@cos/platform';

/**
 * Returns all metric instruments defined in Phase 15 spec.
 * Call after initTracing() so the global MeterProvider is set.
 * Each call returns instruments from the same global meter (idempotent via OTel SDK).
 */
export function createMetrics() {
  const meter = getMeter(SCOPE, '1.0.0');

  return {
    // HTTP
    httpRequestDuration: meter.createHistogram('http_request_duration_seconds', {
      description: 'HTTP request duration',
      unit: 's',
    }),
    httpRequestsTotal: meter.createCounter('http_requests_total', {
      description: 'Total HTTP requests',
    }),

    // Kafka producer/consumer
    kafkaProducedTotal: meter.createCounter('kafka_messages_produced_total', {
      description: 'Total Kafka messages produced',
    }),
    kafkaConsumedTotal: meter.createCounter('kafka_messages_consumed_total', {
      description: 'Total Kafka messages consumed',
    }),
    kafkaConsumerLag: meter.createObservableGauge('kafka_consumer_lag', {
      description: 'Kafka consumer lag per group',
    }),
    kafkaDlqDepth: meter.createObservableGauge('kafka_dlq_depth', {
      description: 'Kafka DLQ depth — alert if > 0 for 5 min',
    }),

    // Database
    dbQueryDuration: meter.createHistogram('db_query_duration_seconds', {
      description: 'Database query duration',
      unit: 's',
    }),

    // AI
    aiTokenUsageTotal: meter.createCounter('ai_token_usage_total', {
      description: 'Total AI tokens used',
    }),
    aiRequestDuration: meter.createHistogram('ai_request_duration_seconds', {
      description: 'AI provider request duration',
      unit: 's',
    }),

    // Mobile sync
    syncQueueDepth: meter.createObservableGauge('sync_queue_depth', {
      description: 'Mobile offline sync queue depth',
    }),

    // File service
    fileUploadBytesTotal: meter.createCounter('file_upload_bytes_total', {
      description: 'Total file upload bytes',
    }),
  };
}

export type CosMetrics = ReturnType<typeof createMetrics>;
