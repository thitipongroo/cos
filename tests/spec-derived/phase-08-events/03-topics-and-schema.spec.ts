/**
 * Phase 8 — topic naming, subject naming and schema evolution
 * (master:3056-3070, 3086-3105).
 */
import { read } from '../helpers';
import {
  topicForEvent,
  dlqTopicFor,
  subjectForEvent,
  tenantTopicPattern,
  PLATFORM_EVENTS_TOPIC,
  entityStateKeyField,
  ENTITY_STATE_TOPICS,
  CANONICAL_EVENT_TYPES,
} from '@cos/shared/kafka/topic-catalog';

const TENANT = 'tenant-abc';

describe('Phase 8 · topic naming (master:3086-3089)', () => {
  it('a domain event topic is {tenant_id}.{event_type}', () => {
    expect(topicForEvent('procurement.po.created.v1', TENANT)).toBe(
      'tenant-abc.procurement.po.created.v1',
    );
  });

  it('the major version is part of the topic name (master:3080)', () => {
    // ".v1 IS part of the event type AND the Kafka topic name" — a v2 must land on its own topic so
    // old consumers keep reading v1 rather than silently receiving a shape they cannot parse.
    expect(topicForEvent('procurement.po.created.v2', TENANT)).toMatch(/\.v2$/);
    expect(topicForEvent('procurement.po.created.v1', TENANT)).not.toBe(
      topicForEvent('procurement.po.created.v2', TENANT),
    );
  });

  it('platform events go to one shared, non-tenant topic (master:3089)', () => {
    expect(topicForEvent('platform.enterprise.db_provisioned.v1', TENANT)).toBe(
      PLATFORM_EVENTS_TOPIC,
    );
  });

  it('the consumer pattern matches any tenant for one event type (master:3101-3102)', () => {
    const pattern = tenantTopicPattern('procurement.po.created.v1');
    expect(pattern.test('tenant-abc.procurement.po.created.v1')).toBe(true);
    expect(pattern.test('tenant-xyz.procurement.po.created.v1')).toBe(true);
    // Must not match a different event, nor a v2 of the same one.
    expect(pattern.test('tenant-abc.procurement.po.approved.v1')).toBe(false);
    expect(pattern.test('tenant-abc.procurement.po.created.v2')).toBe(false);
  });
});

describe('Phase 8 · one DLQ per tenant, not per domain (master:3090-3092)', () => {
  it("every domain topic of a tenant lands in that tenant's single DLQ", () => {
    // Spelled out in master: "ONE per tenant, not per domain. The §7.3 guarantee is about tenants; a
    // DLQ per domain multiplied every tenant's topic count by ten."
    expect(dlqTopicFor('tenant-abc.procurement.po.created.v1')).toBe('tenant-abc.dlq');
    expect(dlqTopicFor('tenant-abc.site.report.created.v1')).toBe('tenant-abc.dlq');
  });

  it("one tenant's DLQ never receives another tenant's failures", () => {
    expect(dlqTopicFor('tenant-xyz.site.report.created.v1')).toBe('tenant-xyz.dlq');
    expect(dlqTopicFor('tenant-abc.site.report.created.v1')).not.toBe('tenant-xyz.dlq');
  });

  it('the originating domain stays recoverable from a header (master:3092)', () => {
    expect(read('packages/@cos/shared/src/kafka/dlq.ts')).toMatch(/original_topic/);
  });
});

describe('Phase 8 · Schema Registry (master:3056-3057)', () => {
  const client = read('packages/@cos/shared/src/kafka/schema-registry.client.ts');

  it('the subject is the canonical event type — RecordNameStrategy', () => {
    // NOT {topic}-value: topics carry a {tenant_id}. prefix, so TopicNameStrategy would register a
    // duplicate schema per tenant.
    expect(subjectForEvent('procurement.po.created.v1')).toBe('procurement.po.created.v1');
  });

  it('the subject carries no tenant prefix', () => {
    expect(subjectForEvent('procurement.po.created.v1')).not.toMatch(/tenant/);
  });

  it('compatibility is set to BACKWARD_TRANSITIVE (master:3057)', () => {
    // The registry defaults to BACKWARD; the stricter mode has to be set explicitly, or every
    // historical consumer is only guaranteed against the immediately preceding version.
    expect(client).toContain('BACKWARD_TRANSITIVE');
  });
});

describe('Phase 8 · schema evolution rules are documented where they are enforced (master:3063-3070)', () => {
  const client = read('packages/@cos/shared/src/kafka/schema-registry.client.ts');

  it('BACKWARD_TRANSITIVE is what mechanises the FORBIDDEN list', () => {
    // master lists rename / remove / retype / reorder-enum as forbidden. Those are precisely what
    // BACKWARD_TRANSITIVE rejects — the rule is enforced by the registry, not by a code review, so
    // what this asserts is that the mode is actually set rather than assumed.
    expect(client).toMatch(/compatibility/i);
    expect(client).toContain('BACKWARD_TRANSITIVE');
  });
});

/**
 * Log compaction and the entity key — master:3104.
 *
 * The line named "entity state topics (project.project.*, etc.)" and nothing anywhere defined the
 * term, so the requirement sat unimplemented: no topic was ever created with a cleanup policy. It
 * could not simply be switched on either — every message was keyed by `tenant_id`, and compacting a
 * tenant-keyed topic leaves ONE event per tenant and deletes the entire history behind it.
 */
describe('Phase 8 · entity state topics (master:3104)', () => {
  it('declares the project family, which is what master names', () => {
    // master:725 maps project.created -> [construction.project.created.v1], so "project.project.*"
    // is the canonical construction.project.* family.
    for (const event of [
      'construction.project.created.v1',
      'construction.project.updated.v1',
      'construction.project.status_changed.v1',
      'construction.project.archived.v1',
    ]) {
      expect(entityStateKeyField(event)).toBe('project_id');
    }
  });

  it('excludes risk events, which carry project_id but are not project state', () => {
    // Keying these by project would collapse every risk on a project into the last one raised.
    expect(entityStateKeyField('construction.project.risk_raised.v1')).toBeUndefined();
    expect(entityStateKeyField('construction.project.risk_status_changed.v1')).toBeUndefined();
  });

  it('excludes records of occurrences', () => {
    // Each is a separate fact with no newer version to replace it; compaction would delete history.
    for (const event of [
      'site.report.created.v1',
      'procurement.delivery.received.v1',
      'workforce.checkin.created.v1',
      'finance.payment.processed.v1',
    ]) {
      expect(entityStateKeyField(event)).toBeUndefined();
    }
  });

  it('every declared entity state topic is a real event type', () => {
    // A typo here is a topic that is never compacted and never keyed, silently.
    for (const event of Object.keys(ENTITY_STATE_TOPICS)) {
      expect(CANONICAL_EVENT_TYPES).toContain(event);
    }
  });
});
