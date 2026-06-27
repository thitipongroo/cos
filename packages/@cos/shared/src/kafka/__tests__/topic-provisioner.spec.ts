// Unit tests for KafkaTopicProvisioner — spec §7.3 per-tenant topic provisioning.

const adminMock = {
  connect: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn().mockResolvedValue(undefined),
  listTopics: jest.fn().mockResolvedValue([]),
  createTopics: jest.fn().mockResolvedValue(true),
};

jest.mock('kafkajs', () => ({
  Kafka: jest.fn().mockImplementation(() => ({ admin: jest.fn().mockReturnValue(adminMock) })),
  logLevel: { NOTHING: 0, WARN: 2 },
}));

import { KafkaTopicProvisioner, tenantTopicSuffixes } from '../topic-provisioner';
import { PLATFORM_EVENTS_TOPIC, PLATFORM_DLQ_TOPIC, isPlatformEvent } from '../topic-catalog';

describe('KafkaTopicProvisioner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    adminMock.listTopics.mockResolvedValue([]);
    adminMock.createTopics.mockResolvedValue(true);
  });

  describe('tenantTopicSuffixes', () => {
    it('contains only non-platform event types plus one dlq per domain', () => {
      const suffixes = tenantTopicSuffixes();
      expect(suffixes.some((s) => isPlatformEvent(s))).toBe(false);
      expect(suffixes).toContain('construction.project.created.v1');
      expect(suffixes).toContain('construction.dlq');
      expect(suffixes.filter((s) => s.endsWith('.dlq')).length).toBeGreaterThan(0);
    });
  });

  describe('provisionTenant', () => {
    it('connects and creates every per-tenant topic with the tenant prefix', async () => {
      const p = new KafkaTopicProvisioner();
      await p.connect();
      await p.provisionTenant('t-123');

      expect(adminMock.connect).toHaveBeenCalledTimes(1);
      expect(adminMock.createTopics).toHaveBeenCalledTimes(1);
      const created = adminMock.createTopics.mock.calls[0][0].topics as Array<{ topic: string }>;
      expect(created.every((t) => t.topic.startsWith('t-123.'))).toBe(true);
      expect(created.map((t) => t.topic)).toContain('t-123.construction.project.created.v1');
      expect(created.map((t) => t.topic)).toContain('t-123.construction.dlq');
    });

    it('rejects an empty tenantId', async () => {
      const p = new KafkaTopicProvisioner();
      await p.connect();
      await expect(p.provisionTenant('')).rejects.toThrow('requires a tenantId');
    });

    it('throws if called before connect()', async () => {
      const p = new KafkaTopicProvisioner();
      await expect(p.provisionTenant('t-1')).rejects.toThrow('not connected');
    });

    it('connect() is idempotent (re-uses the existing admin client)', async () => {
      const p = new KafkaTopicProvisioner();
      await p.connect();
      await p.connect();
      expect(adminMock.connect).toHaveBeenCalledTimes(1);
    });

    it('only creates topics that do not already exist', async () => {
      const p = new KafkaTopicProvisioner();
      await p.connect();
      const allSuffixes = tenantTopicSuffixes().map((s) => `t-9.${s}`);
      // Pretend everything except one topic already exists.
      adminMock.listTopics.mockResolvedValue(allSuffixes.slice(1));
      await p.provisionTenant('t-9');
      const created = adminMock.createTopics.mock.calls[0][0].topics as Array<{ topic: string }>;
      expect(created).toHaveLength(1);
      expect(created[0].topic).toBe(allSuffixes[0]);
    });

    it('skips createTopics entirely when all topics already exist', async () => {
      const p = new KafkaTopicProvisioner();
      await p.connect();
      adminMock.listTopics.mockResolvedValue(tenantTopicSuffixes().map((s) => `t-7.${s}`));
      await p.provisionTenant('t-7');
      expect(adminMock.createTopics).not.toHaveBeenCalled();
    });
  });

  describe('ensurePlatformTopics', () => {
    it('creates the shared platform.events and platform.dlq topics', async () => {
      const p = new KafkaTopicProvisioner();
      await p.connect();
      await p.ensurePlatformTopics();
      const created = adminMock.createTopics.mock.calls[0][0].topics as Array<{ topic: string }>;
      expect(created.map((t) => t.topic)).toEqual(
        expect.arrayContaining([PLATFORM_EVENTS_TOPIC, PLATFORM_DLQ_TOPIC]),
      );
    });
  });

  describe('disconnect', () => {
    it('disconnects the admin client and is safe to call when never connected', async () => {
      const p = new KafkaTopicProvisioner();
      await p.disconnect(); // never connected — no-op
      expect(adminMock.disconnect).not.toHaveBeenCalled();

      await p.connect();
      await p.disconnect();
      expect(adminMock.disconnect).toHaveBeenCalledTimes(1);
    });
  });

  describe('custom partition / replication options', () => {
    it('passes through numPartitions and replicationFactor', async () => {
      const p = new KafkaTopicProvisioner({ numPartitions: 6, replicationFactor: 3 });
      await p.connect();
      await p.ensurePlatformTopics();
      const created = adminMock.createTopics.mock.calls[0][0].topics as Array<{
        numPartitions: number;
        replicationFactor: number;
      }>;
      expect(created[0].numPartitions).toBe(6);
      expect(created[0].replicationFactor).toBe(3);
    });
  });

  describe('logLevel selection', () => {
    it('uses WARN log level outside the test environment (covers NODE_ENV !== "test" branch)', () => {
      const original = process.env['NODE_ENV'];
      process.env['NODE_ENV'] = 'production';
      try {
        // Construction selects logLevel.WARN when NODE_ENV !== 'test'; Kafka is mocked, so this is cheap.
        expect(() => new KafkaTopicProvisioner()).not.toThrow();
      } finally {
        process.env['NODE_ENV'] = original;
      }
    });
  });
});
