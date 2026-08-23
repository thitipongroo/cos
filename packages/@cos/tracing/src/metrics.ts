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

    // Workflows (Temporal) — spec §31.3
    workflowStartedTotal: meter.createCounter('workflow_started_total', {
      description: 'Total Temporal workflows started',
    }),
    workflowCompletedTotal: meter.createCounter('workflow_completed_total', {
      description: 'Total Temporal workflows completed',
    }),
    approvalPendingDuration: meter.createHistogram('approval_pending_duration_seconds', {
      description: 'Time a workflow spends waiting for approval',
      unit: 's',
    }),

    // LLM / AI service metrics — spec §31.3
    llmRequestDuration: meter.createHistogram('llm_request_duration_seconds', {
      description: 'LLM API call latency per provider',
      unit: 's',
    }),
    llmTokensConsumedTotal: meter.createCounter('llm_tokens_consumed_total', {
      description: 'Input + output tokens per tenant per provider',
    }),
    ragRetrievalDuration: meter.createHistogram('rag_retrieval_duration_seconds', {
      description: 'Vector search query latency',
      unit: 's',
    }),
    ocrPagesProcessedTotal: meter.createCounter('ocr_pages_processed_total', {
      description: 'OCR pages processed per tenant',
    }),

    // Notification Service — spec §31.3
    notificationDeliveryDuration: meter.createHistogram('notification_delivery_duration_seconds', {
      description: 'Time to deliver a notification per channel and type',
      unit: 's',
    }),
    notificationPendingTotal: meter.createObservableGauge('notification_pending_total', {
      description: 'Notifications pending delivery per type (polled every 30s)',
    }),

    // Identity Service — spec §31.3
    activeSessionsTotal: meter.createObservableGauge('active_sessions_total', {
      description: 'Active JWT sessions per tenant',
    }),

    // Storage telemetry — spec §31.3
    storageUsedBytes: meter.createObservableGauge('storage_used_bytes', {
      description: 'Storage consumed per tenant per storage type (postgresql|s3)',
    }),

    // Finance ledger reconciliation — TDD OQ-31. Labels: kind=missing|duplicate|orphan,
    // source=PURCHASE_ORDER|INVOICE. Reports the LAST completed sweep, not a live query, and
    // reports nothing at all until the first sweep — absent is "not yet compared", 0 is "compared
    // and clean". Alert on > 0: every unit is money a project budget is wrong about.
    financeLedgerDrift: meter.createObservableGauge('finance_ledger_drift', {
      description: 'Cost transactions that disagree with their procurement source — alert if > 0',
    }),

    // Synthetic tenant isolation probe — spec §31.3 + §30.6
    tenantIsolationCheckResult: meter.createObservableGauge('tenant_isolation_check_result', {
      description: 'Tenant isolation probe result: 1=pass, 0=fail',
    }),
  };
}

export type CosMetrics = ReturnType<typeof createMetrics>;
