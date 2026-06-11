const mockCreateHistogram = jest.fn().mockReturnValue({ record: jest.fn() });
const mockCreateCounter = jest.fn().mockReturnValue({ add: jest.fn() });
const mockCreateObservableGauge = jest.fn().mockReturnValue({ addCallback: jest.fn() });
const mockGetMeter = jest.fn().mockReturnValue({
  createHistogram: mockCreateHistogram,
  createCounter: mockCreateCounter,
  createObservableGauge: mockCreateObservableGauge,
});

jest.mock('@opentelemetry/api', () => ({
  metrics: { getMeter: mockGetMeter },
  context: { active: jest.fn().mockReturnValue({}) },
  trace: { getSpan: jest.fn().mockReturnValue(null) },
  propagation: { inject: jest.fn(), extract: jest.fn() },
}));

jest.mock('@opentelemetry/sdk-node', () => ({
  NodeSDK: jest.fn().mockImplementation(() => ({ start: jest.fn(), shutdown: jest.fn() })),
}));
jest.mock('@opentelemetry/auto-instrumentations-node', () => ({
  getNodeAutoInstrumentations: jest.fn().mockReturnValue([]),
}));
jest.mock('@opentelemetry/exporter-trace-otlp-http', () => ({
  OTLPTraceExporter: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('@opentelemetry/exporter-prometheus', () => ({
  PrometheusExporter: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('@opentelemetry/resources', () => ({
  Resource: jest.fn().mockImplementation((a) => a),
}));

import { createMetrics } from '../metrics';

describe('createMetrics', () => {
  it('creates all required metric instruments from Phase 15 spec', () => {
    const m = createMetrics();

    // HTTP
    expect(m.httpRequestDuration).toBeDefined();
    expect(m.httpRequestsTotal).toBeDefined();

    // Kafka
    expect(m.kafkaProducedTotal).toBeDefined();
    expect(m.kafkaConsumedTotal).toBeDefined();
    expect(m.kafkaConsumerLag).toBeDefined();
    expect(m.kafkaDlqDepth).toBeDefined();

    // DB
    expect(m.dbQueryDuration).toBeDefined();

    // AI (backend-side)
    expect(m.aiTokenUsageTotal).toBeDefined();
    expect(m.aiRequestDuration).toBeDefined();

    // Mobile sync
    expect(m.syncQueueDepth).toBeDefined();

    // File
    expect(m.fileUploadBytesTotal).toBeDefined();

    // Workflows — spec §31.3
    expect(m.workflowStartedTotal).toBeDefined();
    expect(m.workflowCompletedTotal).toBeDefined();
    expect(m.approvalPendingDuration).toBeDefined();

    // LLM / AI service metrics — spec §31.3
    expect(m.llmRequestDuration).toBeDefined();
    expect(m.llmTokensConsumedTotal).toBeDefined();
    expect(m.ragRetrievalDuration).toBeDefined();
    expect(m.ocrPagesProcessedTotal).toBeDefined();

    // Notification Service — spec §31.3
    expect(m.notificationDeliveryDuration).toBeDefined();
    expect(m.notificationPendingTotal).toBeDefined();

    // Identity Service — spec §31.3
    expect(m.activeSessionsTotal).toBeDefined();

    // Storage telemetry — spec §31.3
    expect(m.storageUsedBytes).toBeDefined();

    // Synthetic tenant isolation probe — spec §31.3 + §30.6
    expect(m.tenantIsolationCheckResult).toBeDefined();
  });

  it('creates histogram for http_request_duration_seconds with unit s', () => {
    createMetrics();
    const histogramCalls = mockCreateHistogram.mock.calls;
    const durationCall = histogramCalls.find(([name]) => name === 'http_request_duration_seconds');
    expect(durationCall).toBeDefined();
    expect(durationCall![1]).toMatchObject({ unit: 's' });
  });

  it('creates histogram for db_query_duration_seconds with unit s', () => {
    createMetrics();
    const histogramCalls = mockCreateHistogram.mock.calls;
    const dbCall = histogramCalls.find(([name]) => name === 'db_query_duration_seconds');
    expect(dbCall).toBeDefined();
    expect(dbCall![1]).toMatchObject({ unit: 's' });
  });

  it('creates histogram for approval_pending_duration_seconds with unit s', () => {
    createMetrics();
    const call = mockCreateHistogram.mock.calls.find(
      ([name]) => name === 'approval_pending_duration_seconds',
    );
    expect(call).toBeDefined();
    expect(call![1]).toMatchObject({ unit: 's' });
  });

  it('creates histogram for llm_request_duration_seconds with unit s', () => {
    createMetrics();
    const call = mockCreateHistogram.mock.calls.find(
      ([name]) => name === 'llm_request_duration_seconds',
    );
    expect(call).toBeDefined();
    expect(call![1]).toMatchObject({ unit: 's' });
  });

  it('creates histogram for rag_retrieval_duration_seconds with unit s', () => {
    createMetrics();
    const call = mockCreateHistogram.mock.calls.find(
      ([name]) => name === 'rag_retrieval_duration_seconds',
    );
    expect(call).toBeDefined();
    expect(call![1]).toMatchObject({ unit: 's' });
  });

  it('creates histogram for notification_delivery_duration_seconds with unit s', () => {
    createMetrics();
    const call = mockCreateHistogram.mock.calls.find(
      ([name]) => name === 'notification_delivery_duration_seconds',
    );
    expect(call).toBeDefined();
    expect(call![1]).toMatchObject({ unit: 's' });
  });

  it('creates counter for workflow_started_total', () => {
    createMetrics();
    const call = mockCreateCounter.mock.calls.find(([name]) => name === 'workflow_started_total');
    expect(call).toBeDefined();
  });

  it('creates counter for workflow_completed_total', () => {
    createMetrics();
    const call = mockCreateCounter.mock.calls.find(([name]) => name === 'workflow_completed_total');
    expect(call).toBeDefined();
  });

  it('creates counter for llm_tokens_consumed_total', () => {
    createMetrics();
    const call = mockCreateCounter.mock.calls.find(
      ([name]) => name === 'llm_tokens_consumed_total',
    );
    expect(call).toBeDefined();
  });

  it('creates counter for ocr_pages_processed_total', () => {
    createMetrics();
    const call = mockCreateCounter.mock.calls.find(
      ([name]) => name === 'ocr_pages_processed_total',
    );
    expect(call).toBeDefined();
  });

  it('creates observable gauge for notification_pending_total', () => {
    createMetrics();
    const call = mockCreateObservableGauge.mock.calls.find(
      ([name]) => name === 'notification_pending_total',
    );
    expect(call).toBeDefined();
  });

  it('creates observable gauge for active_sessions_total', () => {
    createMetrics();
    const call = mockCreateObservableGauge.mock.calls.find(
      ([name]) => name === 'active_sessions_total',
    );
    expect(call).toBeDefined();
  });

  it('creates observable gauge for storage_used_bytes', () => {
    createMetrics();
    const call = mockCreateObservableGauge.mock.calls.find(
      ([name]) => name === 'storage_used_bytes',
    );
    expect(call).toBeDefined();
  });

  it('creates observable gauge for tenant_isolation_check_result', () => {
    createMetrics();
    const call = mockCreateObservableGauge.mock.calls.find(
      ([name]) => name === 'tenant_isolation_check_result',
    );
    expect(call).toBeDefined();
  });
});
