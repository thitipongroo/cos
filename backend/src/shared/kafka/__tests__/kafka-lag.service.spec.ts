// Tests for KafkaLagService (TDD OQ-43).
//
// The defect: `KafkaDLQNonEmpty` and `KafkaConsumerLagCritical` are both severity `critical` and both
// page, and neither series had a producer. A Prometheus alert on an absent series never fires — it
// evaluates to no data, which reads exactly like "nothing is wrong".
//
// Verified against a live broker on 2026-08-22 (5 produced / 2 consumed → lag 3; 3 messages in a
// `.dlq` topic → depth 3). These tests cover the cases a live broker makes awkward to stage: a
// never-committed partition, a broker that is down, and the caching.

import { registerConsumerLagGauge, registerDlqDepthGauge } from '../kafka-metrics';
import { KafkaLagService } from '../kafka-lag.service';

const mockAdmin = {
  connect: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn().mockResolvedValue(undefined),
  listGroups: jest.fn(),
  fetchOffsets: jest.fn(),
  fetchTopicOffsets: jest.fn(),
  listTopics: jest.fn(),
};

jest.mock('kafkajs', () => ({
  Kafka: jest.fn().mockImplementation(() => ({ admin: () => mockAdmin })),
}));

jest.mock('../kafka-metrics', () => ({
  registerConsumerLagGauge: jest.fn(),
  registerDlqDepthGauge: jest.fn(),
}));

// KafkaLagService is imported at the top with the others. jest.mock calls are hoisted above the
// import block, so it still picks up the mocked kafkajs and kafka-metrics — the same pattern
// notification.consumer.spec.ts uses.

type Fetcher<T> = () => Promise<T>;

function lagFetcher(): Fetcher<Array<{ topic: string; group: string; lag: number }>> {
  return (registerConsumerLagGauge as jest.Mock).mock.calls[0]![0];
}
function dlqFetcher(): Fetcher<Array<{ topic: string; depth: number }>> {
  return (registerDlqDepthGauge as jest.Mock).mock.calls[0]![0];
}

describe('KafkaLagService', () => {
  let svc: { onModuleInit(): void; onModuleDestroy(): Promise<void> };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-08-22T00:00:00Z'));
    svc = new KafkaLagService();
    svc.onModuleInit();
  });

  afterEach(async () => {
    await svc.onModuleDestroy();
    jest.useRealTimers();
  });

  it('registers BOTH gauges at bootstrap — the thing that was missing', () => {
    expect(registerConsumerLagGauge).toHaveBeenCalledTimes(1);
    expect(registerDlqDepthGauge).toHaveBeenCalledTimes(1);
  });

  describe('consumer lag', () => {
    it('sums lag across partitions of a topic', async () => {
      mockAdmin.listGroups.mockResolvedValue({ groups: [{ groupId: 'notification.shared' }] });
      mockAdmin.fetchOffsets.mockResolvedValue([
        {
          topic: 'construction.project.created.v1',
          partitions: [
            { partition: 0, offset: '10' },
            { partition: 1, offset: '20' },
          ],
        },
      ]);
      mockAdmin.fetchTopicOffsets.mockResolvedValue([
        { partition: 0, high: '15', low: '0' },
        { partition: 1, high: '100', low: '0' },
      ]);

      const result = await lagFetcher()();

      // (15 - 10) + (100 - 20)
      expect(result).toEqual([
        { topic: 'construction.project.created.v1', group: 'notification.shared', lag: 85 },
      ]);
    });

    it('ignores a partition the group has never committed to (offset -1)', async () => {
      // Counting an uncommitted partition as full lag would make a NEWLY CREATED consumer group look
      // catastrophically behind and page on-call for nothing — the alert threshold is 50,000.
      mockAdmin.listGroups.mockResolvedValue({ groups: [{ groupId: 'brand-new.shared' }] });
      mockAdmin.fetchOffsets.mockResolvedValue([
        {
          topic: 'busy.topic',
          partitions: [
            { partition: 0, offset: '-1' },
            { partition: 1, offset: '5' },
          ],
        },
      ]);
      mockAdmin.fetchTopicOffsets.mockResolvedValue([
        { partition: 0, high: '9000000', low: '0' },
        { partition: 1, high: '7', low: '0' },
      ]);

      const [entry] = await lagFetcher()();

      expect(entry!.lag).toBe(2); // only partition 1
    });

    it('never reports negative lag', async () => {
      mockAdmin.listGroups.mockResolvedValue({ groups: [{ groupId: 'g' }] });
      mockAdmin.fetchOffsets.mockResolvedValue([
        { topic: 't', partitions: [{ partition: 0, offset: '50' }] },
      ]);
      mockAdmin.fetchTopicOffsets.mockResolvedValue([{ partition: 0, high: '40', low: '0' }]);

      const [entry] = await lagFetcher()();

      expect(entry!.lag).toBe(0);
    });

    it('returns empty and does NOT throw when the broker is unreachable', async () => {
      // A gauge callback that rejects takes the whole scrape with it, losing every other metric in
      // the process — a monitoring fault becoming a monitoring outage.
      mockAdmin.listGroups.mockRejectedValue(new Error('broker down'));
      await expect(lagFetcher()()).resolves.toEqual([]);
    });
  });

  describe('dlq depth', () => {
    it('counts only *.dlq topics, as high minus low', async () => {
      mockAdmin.listTopics.mockResolvedValue([
        'construction.project.created.v1',
        'construction.project.created.v1.dlq',
        'platform.dlq',
      ]);
      mockAdmin.fetchTopicOffsets.mockImplementation(async (topic: string) =>
        topic === 'construction.project.created.v1.dlq'
          ? [
              { partition: 0, high: '7', low: '2' },
              { partition: 1, high: '3', low: '0' },
            ]
          : [{ partition: 0, high: '0', low: '0' }],
      );

      const result = await dlqFetcher()();

      // (7-2) + (3-0) = 8 — `high - low`, not `high`: records aged out by retention are gone, and
      // the alert asks how many are SITTING there.
      expect(result).toEqual([
        { topic: 'construction.project.created.v1.dlq', depth: 8 },
        { topic: 'platform.dlq', depth: 0 },
      ]);
    });

    it('returns empty and does NOT throw when listing fails', async () => {
      mockAdmin.listTopics.mockRejectedValue(new Error('broker down'));
      await expect(dlqFetcher()()).resolves.toEqual([]);
    });
  });

  it('caches within the TTL so one scrape does not cost two offset sweeps', async () => {
    mockAdmin.listTopics.mockResolvedValue(['a.dlq']);
    mockAdmin.fetchTopicOffsets.mockResolvedValue([{ partition: 0, high: '1', low: '0' }]);

    await dlqFetcher()();
    await dlqFetcher()();
    expect(mockAdmin.listTopics).toHaveBeenCalledTimes(1);

    jest.setSystemTime(new Date('2026-08-22T00:00:11Z')); // past the 10s TTL
    await dlqFetcher()();
    expect(mockAdmin.listTopics).toHaveBeenCalledTimes(2);
  });

  it('opens the admin connection lazily, not at bootstrap', async () => {
    // A broker that is slow to come up must delay a metric, not block application startup.
    expect(mockAdmin.connect).not.toHaveBeenCalled();

    mockAdmin.listTopics.mockResolvedValue([]);
    await dlqFetcher()();

    expect(mockAdmin.connect).toHaveBeenCalledTimes(1);
  });

  it('caches the CONSUMER LAG sweep too, and re-reads once the TTL passes', async () => {
    // The expensive one: a fetchOffsets plus a fetchTopicOffsets per topic per group, on every
    // scrape. Prometheus scrapes far more often than the lag meaningfully changes.
    mockAdmin.listGroups.mockResolvedValue({ groups: [{ groupId: 'g1' }] });
    mockAdmin.fetchOffsets.mockResolvedValue([
      { topic: 't1', partitions: [{ partition: 0, offset: '5' }] },
    ]);
    mockAdmin.fetchTopicOffsets.mockResolvedValue([{ partition: 0, high: '9', low: '0' }]);

    await expect(lagFetcher()()).resolves.toEqual([{ topic: 't1', group: 'g1', lag: 4 }]);
    await expect(lagFetcher()()).resolves.toEqual([{ topic: 't1', group: 'g1', lag: 4 }]);
    expect(mockAdmin.listGroups).toHaveBeenCalledTimes(1);

    jest.setSystemTime(new Date('2026-08-22T00:00:31Z')); // past the 10s TTL
    await lagFetcher()();
    expect(mockAdmin.listGroups).toHaveBeenCalledTimes(2);
  });

  it('treats a partition with no high-water mark as caught up, not as unbounded lag', async () => {
    // fetchTopicOffsets can come back without a partition the group has committed against — a
    // partition removed, or a racing metadata read. Falling back to the committed offset reports
    // zero for it; treating the missing value as 0 would report the whole offset as lag and page.
    mockAdmin.listGroups.mockResolvedValue({ groups: [{ groupId: 'g1' }] });
    mockAdmin.fetchOffsets.mockResolvedValue([
      { topic: 't1', partitions: [{ partition: 7, offset: '5' }] },
    ]);
    mockAdmin.fetchTopicOffsets.mockResolvedValue([{ partition: 0, high: '9', low: '0' }]);

    await expect(lagFetcher()()).resolves.toEqual([{ topic: 't1', group: 'g1', lag: 0 }]);
  });

  it('disconnects the admin client on shutdown, swallowing a failure', async () => {
    // Nest is tearing the app down. Throwing here aborts the rest of the shutdown to report a
    // broker connection we are dropping anyway.
    mockAdmin.listTopics.mockResolvedValue([]);
    await dlqFetcher()(); // opens the connection

    mockAdmin.disconnect.mockRejectedValueOnce(new Error('already closed'));
    await expect(svc.onModuleDestroy()).resolves.toBeUndefined();
    expect(mockAdmin.disconnect).toHaveBeenCalled();

    // Idempotent: a second shutdown has nothing to close and must not try.
    mockAdmin.disconnect.mockClear();
    await expect(svc.onModuleDestroy()).resolves.toBeUndefined();
    expect(mockAdmin.disconnect).not.toHaveBeenCalled();
  });
});
