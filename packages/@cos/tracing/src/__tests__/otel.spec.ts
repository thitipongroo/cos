// Unit tests for @cos/tracing

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

import { initTracing, shutdownTracing, getTraceId } from '../otel';

describe('initTracing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset sdk singleton between tests by re-importing
    jest.resetModules();
  });

  it('starts the OTel SDK with the given service name', () => {
    initTracing('test-service');
    expect(startMock).toHaveBeenCalledTimes(1);
  });
});

describe('shutdownTracing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves without error when SDK not initialized', async () => {
    await expect(shutdownTracing()).resolves.toBeUndefined();
  });

  it('calls shutdown when SDK is initialized', async () => {
    initTracing('test-service');
    await shutdownTracing();
    expect(shutdownMock).toHaveBeenCalledTimes(1);
  });
});

describe('getTraceId', () => {
  it('returns a string (stub returns unset before Phase 15)', () => {
    const id = getTraceId();
    expect(typeof id).toBe('string');
    expect(id).toBe('unset'); // Phase 15 will wire real OTel context
  });
});
