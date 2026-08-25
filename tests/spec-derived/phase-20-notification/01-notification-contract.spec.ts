/**
 * Phase 20 — Notification Service (master:5034-5138, spec §19).
 *
 * Centralised delivery: every other service emits an event, this service decides who hears about it
 * and on which channel. Most of the phase is checkable offline because the decisions are declarations
 * — a consumer group name, a channel adapter set, a routing table, a set of timeouts.
 *
 * Several items here are NEGATIVE by design. The spec does not merely prefer SSE over WebSocket or
 * Expo over direct FCM; it prohibits the alternatives, and for a stated reason (direct FCM misses
 * every iOS user). A prohibition nobody tests is a prohibition that gets undone by the next person
 * who reaches for the familiar library.
 */
import * as fs from 'fs';
import * as path from 'path';
import { exists, read, readYaml, abs } from '../helpers';

const svc = read('backend/src/modules/notification/notification.service.ts');
const consumer = read('backend/src/modules/notification/notification.consumer.ts');
const controller = read('backend/src/modules/notification/notification.controller.ts');
const escalation = read('backend/src/modules/notification/notification.escalation.service.ts');
const digest = read('backend/src/modules/notification/notification.digest.service.ts');
const schema = read('backend/prisma/migrations/20260605000003_notification_service/migration.sql');
const deliveryRules = read(
  'backend/prisma/migrations/20260723000003_notification_delivery_rules/migration.sql',
);
const backendPkg = read('backend/package.json');

/** Every .ts file under backend/src, so a "nothing else does X" claim covers the whole service. */
const backendSources = ((): string[] => {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ts')) out.push(full);
    }
  };
  walk(abs('backend/src'));
  return out;
})();

// ── 1. Kafka consumer ───────────────────────────────────────────────────────

describe('Phase 20 · Kafka consumer (master:5118)', () => {
  it('joins the shared-cluster group named for the service', () => {
    // §7.3 shared-cluster naming is {service}.shared. The name is the consumer's identity across
    // restarts and replicas — get it wrong and a second group re-reads the whole topic from its own
    // offset, delivering every notification twice.
    expect(consumer).toContain("groupId: 'notification.shared'");
  });

  it('subscribes to per-tenant topics by RegExp rather than a fixed topic list', () => {
    // Topics are {tenant_id}.{event_type}.v{N} (§7.3): a fixed list cannot see a tenant provisioned
    // after this consumer connected.
    const kafkaConsumer = read('packages/@cos/shared/src/kafka/consumer.ts');
    expect(kafkaConsumer).toContain('tenantTopicPattern');
    expect(kafkaConsumer).toMatch(/RegExp/);
  });

  it('rejects an event whose tenant_id header disagrees with its envelope', () => {
    // The header is the cheap check that runs before any tenant-scoped query. Mismatch goes to the
    // DLQ, not to a recipient in the wrong tenant.
    const kafkaConsumer = read('packages/@cos/shared/src/kafka/consumer.ts');
    expect(kafkaConsumer).toMatch(/headerTenantId !== event\.tenant_id/);
    expect(kafkaConsumer).toMatch(/DLQ/i);
  });
});

// ── 2-5. Channels ───────────────────────────────────────────────────────────

describe('Phase 20 · channels (master:5044-5053)', () => {
  it('delivers in-app over SSE', () => {
    expect(controller).toContain("@Sse('notifications/stream')");
  });

  it('NEGATIVE — no WebSocket transport anywhere in the backend', () => {
    // master:5044-5045: "NOT WebSocket; spec §19.2 explicitly prohibits WebSocket for notifications
    // (unidirectional only)". Checking package.json alone would miss a hand-rolled `ws` server, so
    // the gateway decorators are checked too.
    expect(backendPkg).not.toMatch(/"socket\.io"|"@nestjs\/websockets"|"@nestjs\/platform-socket/);
    const gateways = backendSources.filter((f) =>
      /@WebSocketGateway|@nestjs\/websockets/.test(fs.readFileSync(f, 'utf8')),
    );
    expect(gateways).toEqual([]);
  });

  it('sends push through Expo', () => {
    expect(backendPkg).toContain('expo-server-sdk');
    expect(exists('backend/src/modules/notification/adapters/expo-push.adapter.ts')).toBe(true);
  });

  it('NEGATIVE — never talks to FCM directly', () => {
    // master:5046-5047: "NOT direct FCM; direct FCM misses all iOS users". This is the one
    // prohibition with a stated user-visible consequence, which is why it is asserted rather than
    // assumed.
    expect(backendPkg).not.toContain('firebase-admin');
    // Match an actual import, not a mention: expo-push.adapter.ts opens with the comment "NOT direct
    // firebase-admin FCM (spec §19.2)", and a bare substring scan flags the very file that honours
    // the rule.
    const fcmUsers = backendSources.filter((f) =>
      /(?:from\s+['"]firebase-admin|require\(\s*['"]firebase-admin)/.test(
        fs.readFileSync(f, 'utf8'),
      ),
    );
    expect(fcmUsers).toEqual([]);
  });

  it('has the SendGrid email adapter the MVP calls for', () => {
    expect(backendPkg).toContain('@sendgrid/mail');
    expect(exists('backend/src/modules/notification/adapters/sendgrid.adapter.ts')).toBe(true);
  });

  it('has the LINE Messaging adapter as a parallel channel', () => {
    expect(exists('backend/src/modules/notification/adapters/line-messaging.adapter.ts')).toBe(
      true,
    );
  });

  it('NEGATIVE — SMS is an enum value with no adapter behind it (master:5053)', () => {
    // "SMS: DELETED". The enum value survives for historical rows, so the meaningful assertion is
    // that nothing can send one: no adapter file, and no SMS branch in dispatch.
    const adapters = fs.readdirSync(abs('backend/src/modules/notification/adapters'));
    expect(adapters.filter((f) => /sms|twilio|nexmo/i.test(f))).toEqual([]);
    expect(svc).not.toMatch(/case 'SMS'|channel === 'SMS'/);
  });
});

// ── 6. Trigger routing ──────────────────────────────────────────────────────

describe('Phase 20 · trigger routing (master:5057-5062)', () => {
  // The six triggers the phase command names, with the audience it names for each. Keys must be the
  // canonical event types — the file's own comment records that 'purchase_order' instead of 'po'
  // once dropped notifications silently, because an unmatched key just logs and returns.
  const expected: Array<[string, string]> = [
    ['site.inspection.failed.v1', "['SITE_ENGINEER', 'PROJECT_MANAGER']"],
    ['site.issue.created.v1', "['SITE_ENGINEER', 'PROJECT_MANAGER']"],
    ['procurement.po.status_changed.v1', "'actor'"],
    ['finance.variance.alert.v1', "['FINANCE', 'TENANT_ADMIN']"],
    ['site.report.created.v1', "['PROJECT_MANAGER']"],
    ['procurement.invoice.received.v1', "['FINANCE']"],
  ];

  it.each(expected)('routes %s to the audience the spec names', (eventType, routing) => {
    expect(svc).toContain(`'${eventType}': ${routing}`);
  });
});

// ── 7. Entities ─────────────────────────────────────────────────────────────

describe('Phase 20 · entities (master:5065-5097)', () => {
  it('creates the three tables the spec lists', () => {
    for (const table of ['notification_templates', 'notifications', 'notification_preferences']) {
      expect(schema).toContain(`CREATE TABLE notifications.${table}`);
    }
  });

  it('indexes notifications on (tenant_id, recipient_id, status) as the spec requires', () => {
    expect(schema).toMatch(
      /CREATE INDEX \S+ ON notifications\.notifications \(tenant_id, recipient_id, status\)/,
    );
  });

  it('makes a preference unique per (user, event_type, channel)', () => {
    expect(schema).toContain('UNIQUE (user_id, event_type, channel)');
  });

  it('carries all five channel enum values including PUSH', () => {
    // The original migration created four; PUSH arrived with the delivery-rules migration. Both
    // files are read so the assertion describes the schema as it actually is today.
    expect(schema).toContain(
      `CREATE TYPE notifications."NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'LINE', 'SMS')`,
    );
    expect(deliveryRules).toContain(
      `ALTER TYPE notifications."NotificationChannel" ADD VALUE IF NOT EXISTS 'PUSH'`,
    );
  });

  it('defaults the quiet window to 22:00-07:00 (master:5093-5094)', () => {
    expect(deliveryRules).toContain("quiet_hours_start TIME NOT NULL DEFAULT '22:00'");
    expect(deliveryRules).toContain("quiet_hours_end   TIME NOT NULL DEFAULT '07:00'");
  });
});

// ── 8. Quiet hours and the critical override ────────────────────────────────

describe('Phase 20 · quiet hours and critical safety (master:5100-5101)', () => {
  it('suppresses push inside the quiet window', () => {
    expect(svc).toMatch(/suppressPush/);
    expect(svc).toMatch(/isInQuietHours/);
  });

  it('exempts critical safety events from quiet-hours suppression', () => {
    // The exemption is shared with §19.8's platform events, so it lives in isQuietHoursExempt —
    // asserted here through the helper's definition rather than the call site's spelling.
    expect(svc).toMatch(/!isQuietHoursExempt\(notif\.event_type\)\s*&&/);
    expect(svc).toMatch(/return CRITICAL_EVENT_TYPES\.has\(eventType\)/);
  });

  it('exempts critical safety events from a disabled channel preference', () => {
    // The other half of the same sentence — "cannot be disabled OR quieted". Enforcing only the
    // quiet-hours half leaves a Safety Officer who muted one channel silently uncovered, and takes
    // the §19.3 escalation with it: escalation fires on an unacknowledged notification, and one that
    // was never created can never be acknowledged.
    expect(svc).toMatch(/if \(!critical && disabledChannels\.has\(channel\)\) continue;/);
  });

  it('treats BOTH events §19.6 names as critical', () => {
    // §19.6 names SafetyIncidentReported and SafetyViolationDetected. Only the first had a canonical
    // type when Phase 20 was written, so this asserted a single-entry set. The second was minted in
    // Phase 23 (`safety.violation.detected.v1`), which is why the assertion is now on membership
    // rather than on the literal contents — pinning the exact array made a correct addition look
    // like a regression.
    const set = svc.slice(
      svc.indexOf('export const CRITICAL_EVENT_TYPES'),
      svc.indexOf(']);', svc.indexOf('export const CRITICAL_EVENT_TYPES')),
    );
    expect(set).toContain("'safety.incident.created.v1'");
    expect(set).toContain("'safety.violation.detected.v1'");
  });
});

// ── 9. Digest ───────────────────────────────────────────────────────────────

describe('Phase 20 · digest schedule (master:5102-5103)', () => {
  it('runs a daily digest at 18:00 and a weekly one on Monday 08:00, tenant-local', () => {
    // The cron fires hourly and the service picks the tenants whose local clock has reached the
    // hour — a single UTC cron cannot mean 18:00 in every tenant timezone at once.
    expect(digest).toContain("@Cron('0 * * * *'");
    expect(digest).toMatch(/18:00/);
    expect(digest).toMatch(/Monday 08:00/);
  });
});

// ── 10. Escalation ──────────────────────────────────────────────────────────

describe('Phase 20 · escalation matrix (master:5104-5107)', () => {
  const rules: Array<[string, string, string]> = [
    ['safety.incident.created.v1', '30 * 60', 'PROJECT_MANAGER'],
    ['finance.variance.alert.v1', '2 * 60 * 60', 'EXECUTIVE'],
    ['ai.risk_prediction.generated.v1', '24 * 60 * 60', 'PROJECT_MANAGER'],
  ];

  it.each(rules)('escalates %s after its timeout to the named role', (eventType, timeout, role) => {
    const block = escalation.slice(escalation.indexOf(`eventType: '${eventType}'`));
    expect(block).toContain(`timeoutSeconds: ${timeout}`);
    expect(block.slice(0, 300)).toContain(role);
  });

  it('is distinct from the §15.5 48-hour approval escalation', () => {
    // master:5104 calls this out explicitly. The approval timeout belongs to procurement; if it ever
    // migrated into this matrix, a stale PO would start paging the safety chain.
    expect(escalation).not.toMatch(/48 \* 60 \* 60/);
  });

  it('escalates a given notification at most once', () => {
    // The sweep runs every five minutes; without a marker every sweep after the timeout would
    // re-escalate the same unread notification.
    expect(escalation).toMatch(/escalated_at/);
  });
});

// ── 11. API surface ─────────────────────────────────────────────────────────

describe('Phase 20 · API surface (master:5110-5114)', () => {
  const routes: Array<[string, string]> = [
    ['@Get', "'notifications'"],
    ['@Patch', "'notifications/:id/read'"],
    ['@Patch', "'notifications/read-all'"],
    ['@Get', "'notifications/preferences'"],
    ['@Patch', "'notifications/preferences'"],
  ];

  it.each(routes)('exposes %s %s', (verb, route) => {
    expect(controller).toContain(`${verb}(${route})`);
  });
});

// ── 12. Single delivery path ────────────────────────────────────────────────

describe('Phase 20 · no service sends notifications directly (master:5041)', () => {
  it('confines every delivery SDK to the notification module', () => {
    // "No service should send notifications directly — route through this service only." The check
    // that matters is not whether the module exists but whether anything bypasses it: a module that
    // imports the SendGrid or Expo SDK is sending mail nobody can see in the notifications table,
    // and no preference, quiet window or escalation applies to it.
    const offenders = backendSources
      .filter((f) => !f.includes(path.join('modules', 'notification')))
      .filter((f) =>
        /(?:from\s+['"]|require\(\s*['"])(?:expo-server-sdk|@sendgrid\/mail|@line\/bot-sdk)/.test(
          fs.readFileSync(f, 'utf8'),
        ),
      )
      .map((f) => path.relative(abs('.'), f));
    expect(offenders).toEqual([]);
  });
});

// ── 13. OpenAPI ─────────────────────────────────────────────────────────────

describe('Phase 20 · OpenAPI (master:5128)', () => {
  it('documents every route the controller exposes', () => {
    const doc = readYaml<{ paths: Record<string, Record<string, unknown>> }>(
      'docs/api/notification.openapi.yaml',
    );
    // Controller routes, normalised to OpenAPI path syntax. @Sse is a GET as far as HTTP is
    // concerned, which is why the stream route is expected under `get`.
    const expectedPaths: Array<[string, string]> = [
      ['/notifications', 'get'],
      ['/notifications/{id}/read', 'patch'],
      ['/notifications/read-all', 'patch'],
      ['/notifications/preferences', 'get'],
      ['/notifications/preferences', 'patch'],
      ['/notifications/device-token', 'post'],
      ['/notifications/stream', 'get'],
    ];
    const missing = expectedPaths.filter(([p, m]) => !doc.paths[p] || !doc.paths[p][m]);
    expect(missing).toEqual([]);
  });
});

// ── §19.8 platform-level events ─────────────────────────────────────────────

describe('Phase 20 · platform-level events (§19.8)', () => {
  it('subscribes every event it routes', () => {
    // A routing entry is a decision about an audience. If the consumer never asks for the topic,
    // that decision is never reached — which is exactly what happened to both enterprise events:
    // present in EVENT_ROLE_MAP, absent from SUBSCRIBED_EVENT_TYPES.
    const routed = [...svc.matchAll(/^ {2}'([a-z][\w.]*\.v\d+)':/gm)].map((m) => m[1]);
    const subscribed = consumer.slice(
      consumer.indexOf('SUBSCRIBED_EVENT_TYPES'),
      consumer.indexOf('];', consumer.indexOf('SUBSCRIBED_EVENT_TYPES')),
    );
    expect(routed.length).toBeGreaterThan(0);
    expect(routed.filter((e) => !subscribed.includes(`'${e}'`))).toEqual([]);
  });

  it('exempts platform-level events from quiet-hours suppression', () => {
    // §19.8: "NOT subject to quiet-hours suppression — they represent operational platform state
    // that SYSTEM_ADMIN must act on."
    expect(svc).toContain("'platform.enterprise.contract_signed.v1',");
    expect(svc).toMatch(/function isQuietHoursExempt/);
    expect(svc).toMatch(/!isQuietHoursExempt\(notif\.event_type\)/);
  });

  it('resolves recipients by the envelope sentinel, not by the event name', () => {
    // platform.sync.exhausted.v1 is also `platform.`-prefixed but carries a real tenant UUID, so a
    // name-prefix test would misroute it to every SYSTEM_ADMIN on the installation.
    expect(svc).toMatch(/event\.tenant_id === PLATFORM_TENANT_SENTINEL/);
    expect(svc).toMatch(/findSystemAdmins\(\)/);
  });

  it('stores the notification under the recipient tenant', () => {
    expect(svc).toMatch(/tenant_id: r\.tenant_id \?\? event\.tenant_id/);
  });
});

// ── §19.8 human gate ────────────────────────────────────────────────────────

describe('Phase 20 · provisioning human gate (§19.8)', () => {
  const activities = read(
    'backend/src/modules/tenant/workflows/enterprise-provisioning.activities.ts',
  );
  const gateTemplates = read(
    'backend/prisma/migrations/20260825000001_provisioning_human_gate_templates/migration.sql',
  );

  it('goes through the Notification Service rather than raw SQL', () => {
    // §19.8: "sent directly by EnterpriseProvisioningWorkflow via the Notification Service — it is
    // NOT a Kafka event". The previous version wrote its own INSERT, which had drifted from the
    // schema in four ways at once (recipient_user_id / title / lowercase 'in_app' / tenant_id NULL)
    // and threw on every provisioning run. Nothing executed it, so nothing noticed.
    expect(activities).not.toContain('INSERT INTO notifications.notifications');
    expect(activities).toContain('notifySystemAdmins(PLATFORM_HUMAN_GATE_EVENT_TYPE');
  });

  it('is deliberately absent from the Kafka routing table', () => {
    // An EVENT_ROLE_MAP entry would claim a Kafka audience for a message no consumer subscribes to
    // — the exact shape that left both enterprise events unreachable.
    // Anchored on the declaration, not the first mention of the name: the doc comment above
    // PLATFORM_HUMAN_GATE_EVENT_TYPE says "no EVENT_ROLE_MAP entry", and a looser slice starts
    // there and swallows the very constant it is meant to exclude.
    const declaration = svc.indexOf('export const EVENT_ROLE_MAP: Record<');
    const roleMap = svc.slice(declaration, svc.indexOf('\n};', declaration));
    expect(roleMap).not.toContain('platform.enterprise.awaiting_approval');
  });

  it('is seeded on both channels §19.8 marks Yes', () => {
    // In-app Yes, Email Yes, Push "—". The service decides the channel set from the templates
    // table, so these two rows ARE the channel configuration.
    const rows = [
      ...gateTemplates.matchAll(/'platform\.enterprise\.awaiting_approval',\s*'(\w+)'/g),
    ];
    expect(rows.map((m) => m[1]).sort()).toEqual(['EMAIL', 'IN_APP']);
  });

  it('uses the subject and body wording §19.8 pins for the gate', () => {
    expect(gateTemplates).toContain('Data migration approval required');
    expect(gateTemplates).toContain(
      'Dedicated DB provisioned for {{tenant_name}}. Approve or abort data migration.',
    );
  });

  it('is exempt from quiet hours like the rest of §19.8', () => {
    expect(svc).toMatch(
      /PLATFORM_LEVEL_EVENT_TYPES = new Set<string>\(\[[^\]]*PLATFORM_HUMAN_GATE_EVENT_TYPE/s,
    );
  });
});

// ── 14. Sync-exhausted routing (deferred from Phase 10) ─────────────────────

describe('Phase 20 · platform.sync.exhausted.v1 routing (§17.2)', () => {
  it('routes each entity type to the audience §17.2 names', () => {
    // §17.2 gives four different answers for one event, so routing reads the payload. Material
    // consumption deliberately alerts nobody — the row goes to the review queue and stops there.
    const block = svc.slice(svc.indexOf("'platform.sync.exhausted.v1'"));
    expect(block).toMatch(/const base = \['TENANT_ADMIN'\]/);
    expect(block).toMatch(
      /if \(entityType === 'safety'\) return \[\.\.\.base, 'PROJECT_MANAGER', 'SAFETY_OFFICER'\]/,
    );
    expect(block).toMatch(/entityType === 'attendance' \|\| entityType === 'inspection'/);
    expect(block).toMatch(/material_consumption/);
  });

  it('is actually subscribed, not merely routed', () => {
    // A routing entry with no subscription is a table nobody reads. Phase 10 left the producer side
    // finished and this consumer side is where it lands.
    expect(consumer).toContain('platform.sync.exhausted.v1');
  });
});
