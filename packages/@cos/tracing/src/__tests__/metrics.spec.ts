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

    // AI
    expect(m.aiTokenUsageTotal).toBeDefined();
    expect(m.aiRequestDuration).toBeDefined();

    // Mobile sync
    expect(m.syncQueueDepth).toBeDefined();

    // File
    expect(m.fileUploadBytesTotal).toBeDefined();
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
});
