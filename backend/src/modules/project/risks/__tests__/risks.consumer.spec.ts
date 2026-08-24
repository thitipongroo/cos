// Unit tests — RisksConsumer (F4b feed). Subscription, DELAY_FORECAST routing, and skip paths.

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

const mockOn = jest.fn();
const mockConnect = jest.fn().mockResolvedValue(undefined);
const mockDisconnect = jest.fn().mockResolvedValue(undefined);

jest.mock('@cos/kafka', () => ({
  KafkaConsumer: jest.fn().mockImplementation(() => ({
    on: mockOn,
    connect: mockConnect,
    disconnect: mockDisconnect,
  })),
}));

jest.mock('@nestjs/core', () => {
  const actual = jest.requireActual<Record<string, unknown>>('@nestjs/core');
  return {
    ...actual,
    ContextIdFactory: { create: jest.fn().mockReturnValue({ id: 1 }) },
  };
});

import { RisksConsumer } from '../risks.consumer';
import type { RisksService } from '../risks.service';

const mockCreateSuggested = jest.fn().mockResolvedValue({ risk_id: 'risk-1' });
const mockSvc: Partial<RisksService> = { createSuggested: mockCreateSuggested };

const mockRegisterRequest = jest.fn();
const mockResolve = jest.fn().mockResolvedValue(mockSvc);
const mockModuleRef = { registerRequestByContextId: mockRegisterRequest, resolve: mockResolve };

const EVENT_TYPE = 'ai.risk_prediction.generated.v1';

function forecastEvent(overrides: Record<string, unknown> = {}) {
  return {
    event_type: EVENT_TYPE,
    tenant_id: 'tenant-001',
    actor_id: 'ai-gateway',
    payload: {
      project_id: 'proj-001',
      model_type: 'DELAY_FORECAST',
      prediction: JSON.stringify({ delay_risk_level: 'HIGH', risk_factors: ['rain'] }),
      confidence: '0.8700',
      ...overrides,
    },
  } as never;
}

let consumer: RisksConsumer;

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateSuggested.mockResolvedValue({ risk_id: 'risk-1' });
  consumer = new RisksConsumer(mockModuleRef as never);
});

describe('onModuleInit', () => {
  it('registers one handler and connects with the project-risks group', async () => {
    await consumer.onModuleInit();
    expect(mockOn).toHaveBeenCalledTimes(1);
    expect(mockConnect).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: 'project-risks.shared',
        eventTypes: [EVENT_TYPE],
        fromBeginning: false,
      }),
    );
  });

  it('the registered handler delegates to handle()', async () => {
    await consumer.onModuleInit();
    const handler = mockOn.mock.calls[0][1] as (e: unknown) => Promise<void>;
    await handler(forecastEvent());
    expect(mockCreateSuggested).toHaveBeenCalled();
  });
});

describe('handle()', () => {
  it('maps a DELAY_FORECAST to an AI-suggested risk under the event tenant', async () => {
    await consumer.handle(forecastEvent());
    expect(mockRegisterRequest).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-001' }),
      expect.anything(),
    );
    expect(mockCreateSuggested).toHaveBeenCalledWith(
      'proj-001',
      expect.objectContaining({
        title: 'AI delay-risk: HIGH',
        likelihood: 4,
        category: 'SCHEDULE',
      }),
    );
  });

  it('defaults a missing confidence to null (still creates the risk)', async () => {
    await consumer.handle(forecastEvent({ confidence: undefined }));
    expect(mockCreateSuggested).toHaveBeenCalledWith(
      'proj-001',
      expect.objectContaining({ likelihood: 4 }),
    );
  });

  it('ignores a non-DELAY_FORECAST prediction', async () => {
    await consumer.handle(forecastEvent({ model_type: 'COST_OVERRUN' }));
    expect(mockResolve).not.toHaveBeenCalled();
    expect(mockCreateSuggested).not.toHaveBeenCalled();
  });

  it('skips an unparseable prediction JSON', async () => {
    await consumer.handle(forecastEvent({ prediction: 'not-json{' }));
    expect(mockCreateSuggested).not.toHaveBeenCalled();
  });

  it('skips an unknown delay level (mapDelayForecast → null)', async () => {
    await consumer.handle(
      forecastEvent({
        prediction: JSON.stringify({ delay_risk_level: 'WEIRD', risk_factors: [] }),
      }),
    );
    expect(mockCreateSuggested).not.toHaveBeenCalled();
  });

  it('tolerates the project being gone (createSuggested → null)', async () => {
    mockCreateSuggested.mockResolvedValueOnce(null);
    await expect(consumer.handle(forecastEvent())).resolves.not.toThrow();
  });
});

describe('onModuleDestroy', () => {
  it('disconnects on teardown', async () => {
    await consumer.onModuleInit();
    await consumer.onModuleDestroy();
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });

  it('swallows disconnect errors', async () => {
    mockDisconnect.mockRejectedValueOnce(new Error('broker down'));
    await consumer.onModuleInit();
    await expect(consumer.onModuleDestroy()).resolves.not.toThrow();
  });
});
