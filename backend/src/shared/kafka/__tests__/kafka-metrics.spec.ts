// Kafka metrics unit tests — Phase 13
// Tests: wrapProducer, wrapConsumerEachMessage, registerConsumerLagGauge, registerDlqDepthGauge

const mockAddCallback = jest.fn();
const mockMetrics = {
  kafkaConsumerLag: { addCallback: mockAddCallback },
  kafkaDlqDepth: { addCallback: mockAddCallback },
  kafkaProducedTotal: { add: jest.fn() },
  kafkaConsumedTotal: { add: jest.fn() },
};

jest.mock('@cos/tracing', () => ({
  createMetrics: jest.fn(() => mockMetrics),
  injectKafkaTraceContext: jest.fn((headers: Record<string, unknown>) => ({
    ...headers,
    traceparent: '00-abc-def-01',
  })),
}));

import {
  wrapProducer,
  wrapConsumerEachMessage,
  registerConsumerLagGauge,
  registerDlqDepthGauge,
} from '../kafka-metrics';

describe('wrapProducer', () => {
  it('injects trace context into message headers and counts produced messages', async () => {
    const originalSend = jest.fn().mockResolvedValue([{ baseOffset: '0', topicName: 't' }]);
    const producer = { send: originalSend } as never;

    const wrapped = wrapProducer(producer);
    await wrapped.send({
      topic: 'test-topic',
      messages: [{ value: 'hello' }, { value: 'world' }],
    });

    expect(originalSend).toHaveBeenCalledTimes(1);
    const sentRecord = originalSend.mock.calls[0][0];
    expect(sentRecord.messages[0].headers).toHaveProperty('traceparent');
    expect(mockMetrics.kafkaProducedTotal.add).toHaveBeenCalledWith(2, { topic: 'test-topic' });
  });

  it('handles empty messages array without throwing', async () => {
    const originalSend = jest.fn().mockResolvedValue([]);
    const producer = { send: originalSend } as never;

    const wrapped = wrapProducer(producer);
    await wrapped.send({ topic: 'test-topic', messages: [] });
    expect(mockMetrics.kafkaProducedTotal.add).toHaveBeenCalledWith(0, { topic: 'test-topic' });
  });

  it('falls back to empty array when messages is undefined', async () => {
    const originalSend = jest.fn().mockResolvedValue([]);
    const producer = { send: originalSend } as never;

    const wrapped = wrapProducer(producer);
    await wrapped.send({ topic: 'test-topic' } as never);
    expect(mockMetrics.kafkaProducedTotal.add).toHaveBeenCalledWith(0, { topic: 'test-topic' });
  });

  it('returns the producer with send overridden', () => {
    const originalSend = jest.fn();
    const producer = { send: originalSend } as never;
    const wrapped = wrapProducer(producer);
    expect(wrapped).toBe(producer);
    expect(wrapped.send).not.toBe(originalSend);
  });
});

describe('wrapConsumerEachMessage', () => {
  it('calls eachMessage and records consumed count', async () => {
    const eachMessage = jest.fn().mockResolvedValue(undefined);
    const wrapped = wrapConsumerEachMessage(eachMessage, 'my-group');

    const payload = {
      topic: 'orders',
      partition: 0,
      message: { value: Buffer.from('x') },
    } as never;
    await wrapped(payload);

    expect(eachMessage).toHaveBeenCalledWith(payload);
    expect(mockMetrics.kafkaConsumedTotal.add).toHaveBeenCalledWith(1, {
      topic: 'orders',
      consumer_group: 'my-group',
    });
  });
});

describe('registerConsumerLagGauge', () => {
  it('registers a callback that observes lag entries', async () => {
    mockAddCallback.mockClear();
    const fetchFn = jest.fn().mockResolvedValue([{ topic: 'orders', group: 'my-group', lag: 42 }]);

    registerConsumerLagGauge(fetchFn);

    expect(mockAddCallback).toHaveBeenCalledTimes(1);
    const registeredCb = mockAddCallback.mock.calls[0][0] as (result: {
      observe: jest.Mock;
    }) => Promise<void>;
    const observe = jest.fn();
    await registeredCb({ observe });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(observe).toHaveBeenCalledWith(42, { topic: 'orders', consumer_group: 'my-group' });
  });
});

describe('registerDlqDepthGauge', () => {
  it('registers a callback that observes DLQ depth entries', async () => {
    mockAddCallback.mockClear();
    const fetchFn = jest.fn().mockResolvedValue([{ topic: 'orders.dlq', depth: 7 }]);

    registerDlqDepthGauge(fetchFn);

    expect(mockAddCallback).toHaveBeenCalledTimes(1);
    const registeredCb = mockAddCallback.mock.calls[0][0] as (result: {
      observe: jest.Mock;
    }) => Promise<void>;
    const observe = jest.fn();
    await registeredCb({ observe });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(observe).toHaveBeenCalledWith(7, { topic: 'orders.dlq' });
  });
});
