/**
 * Phase 8 — Kafka and Schema Registry infrastructure (master:3082-3105, 3153-3156).
 */
import { exists, read, readYaml } from '../helpers';

const COMPOSE = 'docker-compose.yml';
const STATEFULSET = 'infrastructure/kubernetes/kafka/kafka-statefulset.yaml';
const REGISTRY = 'infrastructure/kubernetes/kafka/schema-registry-deployment.yaml';

interface ComposeFile {
  services?: Record<string, { image?: string; environment?: Record<string, unknown> }>;
}

const compose = readYaml<ComposeFile>(COMPOSE);
const kafkaService = compose.services?.['kafka'];
const kafkaEnv = (kafkaService?.environment ?? {}) as Record<string, unknown>;

/** Read a `- name: X` / `value: 'Y'` pair out of a k8s container env list. */
const k8sEnv = (yaml: string, name: string): string | undefined => {
  const m = yaml.match(new RegExp(`- name: ${name}\\s*\\n\\s*value: '?([^'\\n]+)'?`));
  return m?.[1]?.trim();
};

const statefulset = read(STATEFULSET);

describe('Phase 8 · docker compose (master:3153)', () => {
  it('runs Kafka and the Schema Registry', () => {
    expect(compose.services?.['kafka']).toBeDefined();
    expect(compose.services?.['schema-registry']).toBeDefined();
  });

  it('runs Kafka in KRaft mode', () => {
    // "Kafka (KRaft mode, no ZooKeeper)". KRaft is the mode; the observable evidence is the node
    // taking both roles and a controller quorum.
    expect(String(kafkaEnv['KAFKA_PROCESS_ROLES'] ?? '')).toContain('controller');
    expect(kafkaEnv['KAFKA_CONTROLLER_QUORUM_VOTERS']).toBeDefined();
  });

  it('runs no ZooKeeper anywhere', () => {
    // The whole point of KRaft. A stray zookeeper service would mean two coordination mechanisms.
    const services = Object.keys(compose.services ?? {});
    expect(services.filter((s) => /zookeeper/i.test(s))).toEqual([]);
    expect(read(COMPOSE)).not.toMatch(/KAFKA_ZOOKEEPER_CONNECT/);
  });

  it('uses the Confluent Schema Registry image (master:3052-3054)', () => {
    expect(compose.services?.['schema-registry']?.image ?? '').toMatch(/cp-schema-registry/);
  });
});

describe('Phase 8 · Kubernetes manifests (master:3154-3156)', () => {
  it('both manifests exist at the path master names', () => {
    expect(exists(STATEFULSET)).toBe(true);
    expect(exists(REGISTRY)).toBe(true);
  });

  it('the broker StatefulSet runs three replicas (master:3083)', () => {
    expect(statefulset).toMatch(/replicas:\s*3/);
  });

  it('replication factor is 3 and min ISR is 2 (master:3084-3085)', () => {
    expect(k8sEnv(statefulset, 'KAFKA_DEFAULT_REPLICATION_FACTOR')).toBe('3');
    expect(k8sEnv(statefulset, 'KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR')).toBe('3');
    // Min ISR 2 with RF 3 is what lets a broker be lost without either losing writes or
    // accepting them into a single replica.
    expect(k8sEnv(statefulset, 'KAFKA_MIN_INSYNC_REPLICAS')).toBe('2');
  });

  it('default retention is 7 days (master:3103)', () => {
    expect(k8sEnv(statefulset, 'KAFKA_LOG_RETENTION_HOURS')).toBe('168');
  });

  it('max message size is 1MB (master:3105)', () => {
    // "large payloads → store in S3, reference in event" — the cap is what forces that.
    expect(k8sEnv(statefulset, 'KAFKA_MESSAGE_MAX_BYTES')).toBe('1048576');
  });

  it('the production broker never creates a topic implicitly (master:3093-3095)', () => {
    expect(k8sEnv(statefulset, 'KAFKA_AUTO_CREATE_TOPICS_ENABLE')).toBe('false');
  });

  it('runs in KRaft mode too', () => {
    expect(statefulset).not.toMatch(/KAFKA_ZOOKEEPER_CONNECT/);
    expect(statefulset).toMatch(/KAFKA_PROCESS_ROLES/);
  });
});

describe('Phase 8 · the dev broker follows the same rules (master:3093-3095, 3103)', () => {
  it('retains for 7 days, as the spec states with no dev/prod split (master:3103)', () => {
    // "Default retention: 7 days" is written flat, unlike the broker count and replication factor
    // two lines above it, which both spell out "(production) / (development)". The dev broker sat at
    // 2160 hours — 90 days — from the file's first commit, with nothing recording why. Nothing
    // replays from the beginning either (every consumer passes fromBeginning: false), so the extra
    // 83 days bought disk and a dev environment that behaved unlike production for a consumer that
    // had been down a while.
    expect(String(kafkaEnv['KAFKA_LOG_RETENTION_HOURS'])).toBe('168');
  });

  it('auto.create.topics.enable is false on the compose broker as well', () => {
    // master:3093-3095 says explicitly: "producers use allowAutoTopicCreation:false AND
    // auto.create.topics.enable is false on EVERY REAL BROKER, so Kafka never creates a topic
    // implicitly." The compose broker is a real broker — the phrase separates real brokers from the
    // mocks used in unit tests, not production from development.
    //
    // It matters most in development, and this is the direction that bites: with auto-create on, a
    // wrong tenant prefix or a stale `.v1` silently produces into a brand-new topic that nobody
    // consumes. The bug looks like "the consumer never fired" and reproduces nowhere, because
    // production — where the setting is false — rejects the same publish outright.
    expect(String(kafkaEnv['KAFKA_AUTO_CREATE_TOPICS_ENABLE'])).toBe('false');
  });
});
