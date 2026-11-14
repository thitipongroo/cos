// Unit tests for KafkaConsumer's topic refresh. KafkaJS 2.2.4 resolves a RegExp subscription once,
// inside subscribe(), so topics created after startup — and topics are created on first publish —
// were never consumed until the process restarted. The consumer now subscribes by name, re-lists
// topics on an interval and subscribes the new matches itself, from the beginning. Crash restarts
// go through the same serial lane, so a refresh and a restart can never start two runners.

jest.mock('../dlq', () => ({
  DlqPublisher: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    publish: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('ioredis', () => ({
  Redis: jest.fn().mockImplementation(() => ({ set: jest.fn(), del: jest.fn() })),
}));

jest.mock('kafkajs', () => ({
  Kafka: jest.fn(),
  logLevel: { NOTHING: 0, ERROR: 1, WARN: 2, INFO: 4, DEBUG: 5 },
}));

jest.mock('../schema-registry.client', () => ({ decodeAvro: jest.fn() }));

import { KafkaConsumer, DEFAULT_TOPIC_REFRESH_MS, topicRefreshIntervalMs } from '../consumer';
import { PLATFORM_EVENTS_TOPIC } from '../topic-catalog';

const EVENT = 'site.report.created.v1';
const T1 = `tenant-1.${EVENT}`;
const T2 = `tenant-2.${EVENT}`;

type CrashListener = (event: { payload: { error: Error & { retryTime?: number } } }) => void;
type ConsumerConfig = {
  retry: { retries: number; restartOnFailure: (e: Error) => Promise<boolean> };
};

function setup(initialTopics: string[] = []) {
  let topics = [...initialTopics];
  let crashListener: CrashListener | null = null;
  const consumerMock = {
    connect: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn().mockResolvedValue(undefined),
    run: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    events: { CRASH: 'consumer.crash' },
    on: jest.fn((name: string, listener: CrashListener) => {
      if (name === 'consumer.crash') crashListener = listener;
    }),
  };
  const adminMock = {
    connect: jest.fn().mockResolvedValue(undefined),
    listTopics: jest.fn(async () => [...topics]),
    disconnect: jest.fn().mockResolvedValue(undefined),
  };
  const consumerFactory = jest.fn().mockReturnValue(consumerMock);
  const { Kafka } = jest.requireMock('kafkajs') as { Kafka: jest.Mock };
  Kafka.mockImplementation(() => ({
    consumer: consumerFactory,
    admin: jest.fn().mockReturnValue(adminMock),
  }));
  return {
    consumerMock,
    adminMock,
    setTopics: (next: string[]) => {
      topics = [...next];
    },
    /** What KafkaJS does on a crash: restartOnFailure (retriable errors only), then CRASH. */
    crash: async (retriable: boolean, retryTime?: number) => {
      const config = consumerFactory.mock.calls[0]![0] as ConsumerConfig;
      const error = Object.assign(new Error('crash'), retryTime ? { retryTime } : {});
      if (retriable) expect(await config.retry.restartOnFailure(error)).toBe(false);
      crashListener!({ payload: { error } });
    },
    config: () => consumerFactory.mock.calls[0]![0] as ConsumerConfig,
  };
}

async function tick(ms = DEFAULT_TOPIC_REFRESH_MS) {
  await jest.advanceTimersByTimeAsync(ms);
}

const order = (m: jest.Mock) => m.mock.invocationCallOrder.at(-1)!;

describe('topicRefreshIntervalMs', () => {
  it.each([
    [undefined, DEFAULT_TOPIC_REFRESH_MS],
    ['', DEFAULT_TOPIC_REFRESH_MS],
    ['abc', DEFAULT_TOPIC_REFRESH_MS],
    ['0', DEFAULT_TOPIC_REFRESH_MS],
    ['-5', DEFAULT_TOPIC_REFRESH_MS],
    ['1.5', DEFAULT_TOPIC_REFRESH_MS],
    ['5000', 5000],
    [' 7000 ', 7000],
  ])('%p → %p', (raw, expected) => {
    expect(topicRefreshIntervalMs(raw)).toBe(expected);
  });
});

describe('KafkaConsumer topic refresh', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    delete process.env['KAFKA_TOPIC_REFRESH_MS'];
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('connect() subscribes the existing matching topics by name, from the one listing', async () => {
    const { consumerMock, adminMock } = setup([T1, 'tenant-1.other.v1', 'tenant-1.dlq']);
    const consumer = new KafkaConsumer();
    await consumer.connect({ groupId: 'g', eventTypes: [EVENT] });

    expect(consumerMock.subscribe).toHaveBeenCalledTimes(1);
    expect(consumerMock.subscribe).toHaveBeenCalledWith({ topics: [T1], fromBeginning: false });
    expect(order(adminMock.listTopics)).toBeLessThan(order(consumerMock.subscribe));
    expect(order(consumerMock.subscribe)).toBeLessThan(order(consumerMock.run));
    await consumer.disconnect();
  });

  it('connect() with no matching topic yet runs without subscribing', async () => {
    const { consumerMock } = setup([]);
    const consumer = new KafkaConsumer();
    await consumer.connect({ groupId: 'g', eventTypes: [EVENT] });

    expect(consumerMock.subscribe).not.toHaveBeenCalled();
    expect(consumerMock.run).toHaveBeenCalledTimes(1);
    await consumer.disconnect();
  });

  it('subscribes a topic created after startup, from the beginning, and runs again', async () => {
    const { consumerMock, setTopics } = setup([]);
    const consumer = new KafkaConsumer();
    await consumer.connect({ groupId: 'g', eventTypes: [EVENT] });

    setTopics([T1, 'tenant-1.safety.incident.created.v1', 'platform.events']);
    await tick();

    expect(consumerMock.stop).toHaveBeenCalledTimes(1);
    expect(consumerMock.subscribe).toHaveBeenCalledTimes(1);
    expect(consumerMock.subscribe).toHaveBeenCalledWith({ topics: [T1], fromBeginning: true });
    expect(consumerMock.run).toHaveBeenCalledTimes(2);
    // The order matters: KafkaJS throws on subscribe() while running.
    expect(order(consumerMock.stop)).toBeLessThan(order(consumerMock.subscribe));
    expect(order(consumerMock.subscribe)).toBeLessThan(order(consumerMock.run));
    await consumer.disconnect();
  });

  it('picks up platform.events once it is created', async () => {
    const { consumerMock, setTopics } = setup([]);
    const consumer = new KafkaConsumer();
    await consumer.connect({
      groupId: 'g',
      eventTypes: ['platform.enterprise.contract_signed.v1'],
    });

    setTopics([PLATFORM_EVENTS_TOPIC, `tenant-1.${PLATFORM_EVENTS_TOPIC}`]);
    await tick();

    expect(consumerMock.subscribe).toHaveBeenCalledWith({
      topics: [PLATFORM_EVENTS_TOPIC],
      fromBeginning: true,
    });
    await consumer.disconnect();
  });

  it('does nothing when no new matching topic appeared', async () => {
    const { consumerMock, setTopics } = setup([T1]);
    const consumer = new KafkaConsumer();
    await consumer.connect({ groupId: 'g', eventTypes: [EVENT] });

    setTopics([T1, 'tenant-2.other.event.v1', `${T2}.extra`]);
    await tick();
    await tick();

    expect(consumerMock.stop).not.toHaveBeenCalled();
    expect(consumerMock.subscribe).toHaveBeenCalledTimes(1); // connect's
    expect(consumerMock.run).toHaveBeenCalledTimes(1);
    await consumer.disconnect();
  });

  it('subscribes each new topic once', async () => {
    const { consumerMock, setTopics } = setup([T1]);
    const consumer = new KafkaConsumer();
    await consumer.connect({ groupId: 'g', eventTypes: [EVENT] });

    setTopics([T1, T2]);
    await tick();
    await tick();

    expect(consumerMock.stop).toHaveBeenCalledTimes(1);
    expect(consumerMock.subscribe).toHaveBeenLastCalledWith({ topics: [T2], fromBeginning: true });
    await consumer.disconnect();
  });

  it('a failed listing is logged and the next tick still subscribes', async () => {
    const { consumerMock, adminMock, setTopics } = setup([]);
    const consumer = new KafkaConsumer();
    await consumer.connect({ groupId: 'g', eventTypes: [EVENT] });

    setTopics([T1]);
    adminMock.listTopics.mockRejectedValueOnce(new Error('broker unavailable'));
    await tick();
    expect(consumerMock.stop).not.toHaveBeenCalled();

    await tick();
    expect(consumerMock.subscribe).toHaveBeenLastCalledWith({ topics: [T1], fromBeginning: true });
    await consumer.disconnect();
  });

  it('a failed subscribe still resumes the consumer, and the topic is retried', async () => {
    const { consumerMock, setTopics } = setup([]);
    const consumer = new KafkaConsumer();
    await consumer.connect({ groupId: 'g', eventTypes: [EVENT] });

    setTopics([T1]);
    consumerMock.subscribe.mockRejectedValueOnce(new Error('metadata error'));
    await tick();
    expect(consumerMock.run).toHaveBeenCalledTimes(2); // resumed despite the failure

    await tick();
    expect(consumerMock.subscribe).toHaveBeenCalledTimes(2);
    expect(consumerMock.subscribe).toHaveBeenLastCalledWith({ topics: [T1], fromBeginning: true });
    await consumer.disconnect();
  });

  it('never runs two refreshes at once', async () => {
    const { consumerMock, adminMock, setTopics } = setup([]);
    const consumer = new KafkaConsumer();
    await consumer.connect({ groupId: 'g', eventTypes: [EVENT] });

    setTopics([T1]);
    let release!: () => void;
    consumerMock.stop.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    await tick(); // first refresh is now stuck in stop()
    const listingsWhileStuck = adminMock.listTopics.mock.calls.length;
    await tick();
    await tick();
    expect(adminMock.listTopics.mock.calls.length).toBe(listingsWhileStuck);

    release();
    await tick(0);
    expect(consumerMock.subscribe).toHaveBeenCalledTimes(1);
    expect(consumerMock.run).toHaveBeenCalledTimes(2);
    await consumer.disconnect();
  });

  it('honours KAFKA_TOPIC_REFRESH_MS', async () => {
    process.env['KAFKA_TOPIC_REFRESH_MS'] = '5000';
    const { consumerMock, setTopics } = setup([]);
    const consumer = new KafkaConsumer();
    await consumer.connect({ groupId: 'g', eventTypes: [EVENT] });

    setTopics([T1]);
    await tick(4_999);
    expect(consumerMock.stop).not.toHaveBeenCalled();
    await tick(1);
    expect(consumerMock.stop).toHaveBeenCalledTimes(1);
    await consumer.disconnect();
  });

  it('disconnect() stops refreshing and disconnects the admin client', async () => {
    const { consumerMock, adminMock, setTopics } = setup([]);
    const consumer = new KafkaConsumer();
    await consumer.connect({ groupId: 'g', eventTypes: [EVENT] });
    await consumer.disconnect();

    const listings = adminMock.listTopics.mock.calls.length;
    setTopics([T1]);
    await tick();
    await tick();

    expect(adminMock.listTopics.mock.calls.length).toBe(listings);
    expect(adminMock.disconnect).toHaveBeenCalledTimes(1);
    expect(consumerMock.stop).not.toHaveBeenCalled();
  });

  it('disconnect() during a refresh does not wait for it, and the refresh never runs again', async () => {
    const { consumerMock, setTopics } = setup([]);
    const consumer = new KafkaConsumer();
    await consumer.connect({ groupId: 'g', eventTypes: [EVENT] });

    setTopics([T1]);
    let release!: () => void;
    consumerMock.stop.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    await tick(); // refresh stuck in stop()
    await consumer.disconnect(); // resolves although the refresh is still in stop()
    expect(consumerMock.disconnect).toHaveBeenCalledTimes(1);

    release();
    await tick(0);
    expect(consumerMock.subscribe).not.toHaveBeenCalled();
    expect(consumerMock.run).toHaveBeenCalledTimes(1); // connect's only
  });

  it('a failing admin disconnect still disconnects the consumer', async () => {
    const { consumerMock, adminMock } = setup([]);
    const consumer = new KafkaConsumer();
    await consumer.connect({ groupId: 'g', eventTypes: [EVENT] });
    adminMock.disconnect.mockRejectedValueOnce(new Error('admin gone'));

    await consumer.disconnect();
    expect(consumerMock.disconnect).toHaveBeenCalledTimes(1);
  });

  it('connect() twice is refused', async () => {
    setup([]);
    const consumer = new KafkaConsumer();
    await consumer.connect({ groupId: 'g', eventTypes: [EVENT] });
    await expect(consumer.connect({ groupId: 'g', eventTypes: [EVENT] })).rejects.toThrow(
      /already connected/,
    );
    await consumer.disconnect();
  });

  it('a failed connect() closes what it opened', async () => {
    const { consumerMock, adminMock } = setup([]);
    adminMock.listTopics.mockRejectedValueOnce(new Error('no metadata'));
    const consumer = new KafkaConsumer();

    await expect(consumer.connect({ groupId: 'g', eventTypes: [EVENT] })).rejects.toThrow(
      'no metadata',
    );
    expect(adminMock.disconnect).toHaveBeenCalledTimes(1);
    expect(consumerMock.disconnect).toHaveBeenCalledTimes(1);
    expect(consumerMock.run).not.toHaveBeenCalled();
  });

  describe('crash restarts', () => {
    it('tells KafkaJS not to restart, keeping its default retries', async () => {
      const { config } = setup([]);
      const consumer = new KafkaConsumer();
      await consumer.connect({ groupId: 'g', eventTypes: [EVENT] });

      expect(config().retry.retries).toBe(5);
      expect(await config().retry.restartOnFailure(new Error('x'))).toBe(false);
      await consumer.disconnect();
    });

    it('a retriable crash restarts the consumer after KafkaJS’s delay', async () => {
      const { consumerMock, crash } = setup([T1]);
      const consumer = new KafkaConsumer();
      await consumer.connect({ groupId: 'g', eventTypes: [EVENT] });

      await crash(true, 1_000);
      await tick(999);
      expect(consumerMock.run).toHaveBeenCalledTimes(1);
      await tick(1);
      expect(consumerMock.stop).toHaveBeenCalledTimes(1);
      expect(consumerMock.run).toHaveBeenCalledTimes(2);
      expect(order(consumerMock.stop)).toBeLessThan(order(consumerMock.run));
      await consumer.disconnect();
    });

    it('defaults the restart delay to 300 ms', async () => {
      const { consumerMock, crash } = setup([T1]);
      const consumer = new KafkaConsumer();
      await consumer.connect({ groupId: 'g', eventTypes: [EVENT] });

      await crash(true);
      await tick(300);
      expect(consumerMock.run).toHaveBeenCalledTimes(2);
      await consumer.disconnect();
    });

    it('a crash that lands during a refresh: every run() is preceded by a stop()', async () => {
      const { consumerMock, setTopics, crash } = setup([]);
      const consumer = new KafkaConsumer();
      await consumer.connect({ groupId: 'g', eventTypes: [EVENT] });

      // The refresh is in stop() — KafkaJS's crash handler shares that stop — when the crash lands.
      setTopics([T1]);
      let release!: () => void;
      consumerMock.stop.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
      );
      await tick();
      await crash(true, 10);
      release();
      await tick(10);

      // connect, refresh, restart: three run()s, and the restart stopped the refresh's run first.
      expect(consumerMock.run).toHaveBeenCalledTimes(3);
      const runs = consumerMock.run.mock.invocationCallOrder;
      const stops = consumerMock.stop.mock.invocationCallOrder;
      expect(stops).toHaveLength(2);
      expect(stops[0]!).toBeLessThan(runs[1]!);
      expect(stops.at(-1)!).toBeLessThan(runs.at(-1)!);
      expect(stops.at(-1)!).toBeGreaterThan(runs.at(-2)!);
      await consumer.disconnect();
    });

    it('a non-retriable crash is not restarted, and the refresh leaves it down', async () => {
      const { consumerMock, adminMock, setTopics, crash } = setup([]);
      const consumer = new KafkaConsumer();
      await consumer.connect({ groupId: 'g', eventTypes: [EVENT] });

      await crash(false);
      setTopics([T1]);
      const listings = adminMock.listTopics.mock.calls.length;
      await tick();
      await tick();

      expect(consumerMock.run).toHaveBeenCalledTimes(1);
      expect(consumerMock.stop).not.toHaveBeenCalled();
      expect(adminMock.listTopics.mock.calls.length).toBe(listings);
      await consumer.disconnect();
    });

    it('disconnect() cancels a pending restart', async () => {
      const { consumerMock, crash } = setup([T1]);
      const consumer = new KafkaConsumer();
      await consumer.connect({ groupId: 'g', eventTypes: [EVENT] });

      await crash(true, 1_000);
      await consumer.disconnect();
      await tick(2_000);
      expect(consumerMock.run).toHaveBeenCalledTimes(1);
    });
  });
});
