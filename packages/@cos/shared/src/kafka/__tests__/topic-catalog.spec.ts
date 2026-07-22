// Unit tests for the per-tenant topic/subject derivation helpers — spec §7.3, §15.6/15.7, §32.4.

import { readdirSync } from 'fs';
import { join } from 'path';
import {
  EVENT_AVSC_MAP,
  CANONICAL_EVENT_TYPES,
  PLATFORM_EVENTS_TOPIC,
  PLATFORM_DLQ_TOPIC,
  isPlatformEvent,
  domainOf,
  topicForEvent,
  subjectForEvent,
  tenantTopicPattern,
  dlqTopicFor,
} from '../topic-catalog';

describe('topic-catalog', () => {
  describe('catalogue', () => {
    it('CANONICAL_EVENT_TYPES equals the keys of EVENT_AVSC_MAP', () => {
      expect(CANONICAL_EVENT_TYPES).toEqual(Object.keys(EVENT_AVSC_MAP));
      expect(CANONICAL_EVENT_TYPES.length).toBeGreaterThan(0);
    });

    it('every canonical event type follows {domain}.{entity}.{action}.v{N}', () => {
      for (const et of CANONICAL_EVENT_TYPES) {
        expect(et).toMatch(/^[a-z]+\.[a-z_]+\.[a-z_]+\.v\d+$/);
      }
    });

    // Regression guard for the Phase 21/22 class of bug: an event's Avro schema file and its emit
    // call exist, but the developer forgot the EVENT_AVSC_MAP entry — so KafkaProducer throws "No
    // Avro schema registered" at publish time and the event is silently dropped. Any .avsc file in
    // avro/ (except the shared base envelope) MUST be registered.
    it('has no orphaned event Avro schema (every avro/*.avsc is in EVENT_AVSC_MAP)', () => {
      const EXEMPT = new Set(['base-event-envelope.avsc']); // shared envelope, not an event type
      const mapped = new Set(Object.values(EVENT_AVSC_MAP));
      const orphans = readdirSync(join(__dirname, '..', '..', 'avro'))
        .filter((f) => f.endsWith('.avsc') && !EXEMPT.has(f))
        .filter((f) => !mapped.has(f));
      expect(orphans).toEqual([]);
    });
  });

  describe('isPlatformEvent', () => {
    it('is true only for platform.* event types', () => {
      expect(isPlatformEvent('platform.enterprise.db_provisioned.v1')).toBe(true);
      expect(isPlatformEvent('construction.project.created.v1')).toBe(false);
    });
  });

  describe('domainOf', () => {
    it('returns the first dotted segment', () => {
      expect(domainOf('construction.project.created.v1')).toBe('construction');
      expect(domainOf('tenant-1.finance.budget.exceeded.v1')).toBe('tenant-1');
    });

    it('returns empty string for an empty input', () => {
      expect(domainOf('')).toBe('');
    });
  });

  describe('topicForEvent', () => {
    it('prefixes domain events with the tenant_id (version retained)', () => {
      expect(topicForEvent('construction.project.created.v1', 'tenant-1')).toBe(
        'tenant-1.construction.project.created.v1',
      );
    });

    it('routes platform events to the shared platform.events topic', () => {
      expect(topicForEvent('platform.enterprise.db_provisioned.v1', 'tenant-1')).toBe(
        PLATFORM_EVENTS_TOPIC,
      );
    });
  });

  describe('subjectForEvent', () => {
    it('uses the canonical event type as the subject (RecordNameStrategy)', () => {
      expect(subjectForEvent('construction.project.created.v1')).toBe(
        'construction.project.created.v1',
      );
    });
  });

  describe('tenantTopicPattern', () => {
    const pattern = tenantTopicPattern('site.inspection.failed.v1');

    it('matches any tenant prefix for the event', () => {
      expect(pattern.test('0000-tenant.site.inspection.failed.v1')).toBe(true);
      expect(pattern.test('platform.site.inspection.failed.v1')).toBe(true);
    });

    it('does not match a different event or a missing tenant prefix', () => {
      expect(pattern.test('tenant.site.inspection.passed.v1')).toBe(false);
      expect(pattern.test('site.inspection.failed.v1')).toBe(false);
      expect(pattern.test('a.b.site.inspection.failed.v1')).toBe(false);
    });
  });

  describe('tenantTopicPattern escapes regex metacharacters', () => {
    // The event type is interpolated into `new RegExp`. Escaping only `.` left every other
    // metacharacter live, so an event type containing one matched a different set of topics than it
    // names — a shared-cluster consumer would silently subscribe to the wrong thing.
    // CodeQL js/incomplete-sanitization.
    it.each([
      ['a quantifier', 'a+b'],
      ['a wildcard', 'a*b'],
      ['an alternation', 'a|b'],
      ['a group', 'a(b)c'],
      ['a character class', 'a[bc]d'],
      ['a repetition range', 'a{1,2}b'],
      ['an anchor', 'a$b'],
      ['a backslash', 'a\\b'],
    ])('treats %s as a literal', (_label, eventType) => {
      const pattern = tenantTopicPattern(eventType);

      expect(pattern.test(`tenant-1.${eventType}`)).toBe(true);
    });

    it('does not let a quantifier widen the match', () => {
      // Unescaped, /^[^.]+\.a+b$/ would also match "tenant-1.aaab".
      const pattern = tenantTopicPattern('a+b');

      expect(pattern.test('tenant-1.aaab')).toBe(false);
      expect(pattern.test('tenant-1.a+b')).toBe(true);
    });

    it('does not let an alternation broaden the match', () => {
      const pattern = tenantTopicPattern('alpha|beta');

      expect(pattern.test('tenant-1.alpha')).toBe(false);
      expect(pattern.test('tenant-1.beta')).toBe(false);
      expect(pattern.test('tenant-1.alpha|beta')).toBe(true);
    });
  });

  describe('dlqTopicFor', () => {
    it('derives {tenant_id}.dlq from a per-tenant topic', () => {
      expect(dlqTopicFor('tenant-1.construction.project.created.v1')).toBe('tenant-1.dlq');
    });

    // One DLQ per tenant, not per tenant-and-domain: every domain of a tenant lands in the same
    // DLQ, which is what keeps the per-tenant topic count from being multiplied by the domain count.
    it('routes every domain of a tenant to that tenant single DLQ', () => {
      expect(dlqTopicFor('tenant-1.finance.payment.processed.v1')).toBe('tenant-1.dlq');
      expect(dlqTopicFor('tenant-1.site.issue.created.v1')).toBe('tenant-1.dlq');
    });

    // The §7.3 guarantee that survives the collapse.
    it('never routes one tenant failures into another tenant DLQ', () => {
      expect(dlqTopicFor('tenant-a.site.issue.created.v1')).toBe('tenant-a.dlq');
      expect(dlqTopicFor('tenant-b.site.issue.created.v1')).toBe('tenant-b.dlq');
    });

    it('maps the shared platform.events topic to platform.dlq', () => {
      expect(dlqTopicFor(PLATFORM_EVENTS_TOPIC)).toBe(PLATFORM_DLQ_TOPIC);
    });

    it('maps any platform.* topic to platform.dlq', () => {
      expect(dlqTopicFor('platform.enterprise.db_provisioned.v1')).toBe(PLATFORM_DLQ_TOPIC);
    });
  });
});
