const startMock = jest.fn();
const shutdownMock = jest.fn().mockResolvedValue(undefined);

jest.mock('@opentelemetry/sdk-node', () => ({
  NodeSDK: jest.fn().mockImplementation(() => ({
    start: startMock,
    shutdown: shutdownMock,
  })),
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
  resourceFromAttributes: jest.fn().mockImplementation((attrs: Record<string, unknown>) => attrs),
}));

const mockGetSpan = jest.fn();
jest.mock('@opentelemetry/api', () => ({
  context: { active: jest.fn().mockReturnValue({}) },
  trace: { getSpan: mockGetSpan },
  metrics: {
    getMeter: jest.fn().mockReturnValue({
      createHistogram: jest.fn(),
      createCounter: jest.fn(),
      createObservableGauge: jest.fn(),
    }),
  },
  propagation: {
    inject: jest.fn(),
    extract: jest.fn().mockReturnValue({}),
  },
}));

import { initTracing, shutdownTracing, getTraceId, getSpanId } from '../otel';

describe('initTracing', () => {
  beforeEach(() => jest.clearAllMocks());

  it('starts the OTel SDK', () => {
    initTracing('test-service');
    expect(startMock).toHaveBeenCalledTimes(1);
  });

  it('accepts TracingOptions object', () => {
    initTracing({ serviceName: 'my-svc', serviceVersion: '1.2.3', prometheusPort: 9100 });
    expect(startMock).toHaveBeenCalledTimes(1);
  });
});

describe('shutdownTracing', () => {
  beforeEach(() => jest.clearAllMocks());

  it('resolves without error when SDK not initialized', async () => {
    await expect(shutdownTracing()).resolves.toBeUndefined();
  });

  it('calls SDK shutdown when initialized', async () => {
    initTracing('test-service');
    await shutdownTracing();
    expect(shutdownMock).toHaveBeenCalledTimes(1);
  });

  it('no-ops when SDK is already null (falsy branch of `if (sdk)`)', async () => {
    // First shutdown sets the module-level sdk back to null; the second call must
    // exercise the falsy branch deterministically (independent of cross-describe state).
    initTracing('test-service');
    await shutdownTracing(); // sdk -> null
    await expect(shutdownTracing()).resolves.toBeUndefined(); // sdk is null -> falsy branch
    expect(shutdownMock).toHaveBeenCalledTimes(1); // not invoked on the second call
  });
});

describe('getTraceId', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 32-zero string when no active span', () => {
    mockGetSpan.mockReturnValue(null);
    expect(getTraceId()).toBe('0'.repeat(32));
  });

  it('returns the traceId from the active span context', () => {
    const traceId = 'abcd1234abcd1234abcd1234abcd1234';
    mockGetSpan.mockReturnValue({
      spanContext: () => ({ traceId, spanId: '0000000000000001', traceFlags: 1 }),
    });
    expect(getTraceId()).toBe(traceId);
  });
});

describe('getSpanId', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 16-zero string when no active span', () => {
    mockGetSpan.mockReturnValue(null);
    expect(getSpanId()).toBe('0'.repeat(16));
  });

  it('returns the spanId from the active span context', () => {
    const spanId = 'abcd1234abcd1234';
    mockGetSpan.mockReturnValue({
      spanContext: () => ({ traceId: '0'.repeat(32), spanId, traceFlags: 1 }),
    });
    expect(getSpanId()).toBe(spanId);
  });
});
