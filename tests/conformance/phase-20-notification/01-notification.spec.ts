/**
 * Phase 20 — Notification Service. CONFORMANCE only.
 *
 * The tables, the channel enum, RLS, template rendering, preference suppression and the critical
 * safety exemption are all asserted against a real database by
 * backend/test/phase-20-notification/01-delivery.integration — including the platform
 * human gate, end to end through the activity. Those were dropped from here on 2026-08-25.
 *
 * Everything that remains is a prohibition or a cross-artifact agreement. This phase carries an
 * unusual number of the former: the spec does not merely PREFER SSE over WebSocket or Expo over
 * direct FCM, it forbids the alternatives, and for a stated reason (direct FCM misses every iOS
 * user). A prohibition nobody tests is one the next person undoes by reaching for the familiar
 * library, and every request keeps succeeding while they do.
 */
import * as fs from 'fs';
import * as path from 'path';
import { read, readYaml, abs } from '../helpers';

const svc = read('backend/src/modules/notification/notification.service.ts');
const consumer = read('backend/src/modules/notification/notification.consumer.ts');
const controller = read('backend/src/modules/notification/notification.controller.ts');
const escalation = read('backend/src/modules/notification/notification.escalation.service.ts');
const digest = read('backend/src/modules/notification/notification.digest.service.ts');
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

// ── Absence: the transports the spec forbids ───────────────────────────────

describe('the forbidden channels stay absent (master:5044-5053)', () => {
  it('has no WebSocket transport anywhere in the backend', () => {
    // master:5044-5045 — "NOT WebSocket; §19.2 explicitly prohibits WebSocket for notifications
    // (unidirectional only)". Checking package.json alone would miss a hand-rolled `ws` server, so
    // the gateway decorators are swept too.
    expect(controller).toContain("@Sse('notifications/stream')");
    expect(backendPkg).not.toMatch(/"socket\.io"|"@nestjs\/websockets"|"@nestjs\/platform-socket/);
    const gateways = backendSources.filter((f) =>
      /@WebSocketGateway|@nestjs\/websockets/.test(fs.readFileSync(f, 'utf8')),
    );
    expect(gateways).toEqual([]);
  });

  it('never talks to FCM directly', () => {
    // master:5046-5047 — "NOT direct FCM; direct FCM misses all iOS users". The one prohibition
    // with a stated user-visible consequence, and one that would look like a working push pipeline
    // to anyone testing on Android.
    //
    // Matched on an actual IMPORT: expo-push.adapter.ts opens with the comment "NOT direct
    // firebase-admin FCM (spec §19.2)", so a bare substring scan flags the very file that honours
    // the rule.
    expect(backendPkg).toContain('expo-server-sdk');
    expect(backendPkg).not.toContain('firebase-admin');
    const fcmUsers = backendSources.filter((f) =>
      /(?:from\s+['"]firebase-admin|require\(\s*['"]firebase-admin)/.test(
        fs.readFileSync(f, 'utf8'),
      ),
    );
    expect(fcmUsers).toEqual([]);
  });

  it('has no way to send an SMS, despite the enum value (master:5053)', () => {
    // "SMS: DELETED". The enum value survives for historical rows, so the meaningful assertion is
    // that nothing can send one: no adapter file, and no SMS branch in dispatch.
    const adapters = fs.readdirSync(abs('backend/src/modules/notification/adapters'));
    expect(adapters.filter((f) => /sms|twilio|nexmo/i.test(f))).toEqual([]);
    expect(svc).not.toMatch(/case 'SMS'|channel === 'SMS'/);
  });
});

// ── Absence: nothing bypasses the service ──────────────────────────────────

describe('no service sends notifications directly (master:5041)', () => {
  it('confines every delivery SDK to the notification module', () => {
    // "No service should send notifications directly — route through this service only." The check
    // that matters is not whether the module exists but whether anything goes around it: a module
    // that imports the SendGrid or Expo SDK is sending mail nobody can see in the notifications
    // table, with no preference, quiet window or escalation applied to it. Nothing at runtime
    // distinguishes that from a working feature.
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

// ── Cross-source: a routing entry nothing subscribes to is dead ────────────

describe('every routed event is also subscribed (master:5118)', () => {
  it('leaves no entry in the routing table without a subscription', () => {
    // A routing entry is a decision about an audience. If the consumer never asks for the topic,
    // that decision is never reached — which is exactly what happened to both enterprise events:
    // present in EVENT_ROLE_MAP, absent from SUBSCRIBED_EVENT_TYPES. Two constants in two files,
    // and the system reads as "no such events yet".
    const routed = [...svc.matchAll(/^ {2}'([a-z][\w.]*\.v\d+)':/gm)].map((m) => m[1]);
    const subscribed = consumer.slice(
      consumer.indexOf('SUBSCRIBED_EVENT_TYPES'),
      consumer.indexOf('];', consumer.indexOf('SUBSCRIBED_EVENT_TYPES')),
    );
    expect(routed.length).toBeGreaterThan(0);
    expect(routed.filter((e) => !subscribed.includes(`'${e}'`))).toEqual([]);
  });

  it('joins the shared-cluster group named for the service', () => {
    // §7.3 naming is {service}.shared. The name is the consumer's identity across restarts and
    // replicas — get it wrong and a second group re-reads the whole topic from its own offset,
    // delivering every notification twice.
    expect(consumer).toContain("groupId: 'notification.shared'");
  });

  it('subscribes by RegExp so a tenant provisioned later is still heard', () => {
    // Topics are {tenant_id}.{event_type}.v{N} (§7.3). A fixed list cannot see a tenant created
    // after this consumer connected, and the silence looks like an inactive tenant.
    const kafkaConsumer = read('packages/@cos/shared/src/kafka/consumer.ts');
    expect(kafkaConsumer).toContain('tenantTopicPattern');
    expect(kafkaConsumer).toMatch(/RegExp/);
    expect(kafkaConsumer).toMatch(/headerTenantId !== event\.tenant_id/);
    expect(kafkaConsumer).toMatch(/DLQ/i);
  });
});

// ── Absence: the human gate is NOT a Kafka event ───────────────────────────

describe('the §19.8 human gate stays off the routing table', () => {
  const activities = read(
    'backend/src/modules/tenant/workflows/enterprise-provisioning.activities.ts',
  );

  it('is deliberately absent from EVENT_ROLE_MAP', () => {
    // An entry would claim a Kafka audience for a message no consumer subscribes to — the exact
    // shape that left both enterprise events unreachable.
    //
    // Anchored on the DECLARATION, not the first mention of the name: the doc comment above
    // PLATFORM_HUMAN_GATE_EVENT_TYPE says "no EVENT_ROLE_MAP entry", and a looser slice starts
    // there and swallows the very constant it is meant to exclude.
    const declaration = svc.indexOf('export const EVENT_ROLE_MAP: Record<');
    const roleMap = svc.slice(declaration, svc.indexOf('\n};', declaration));
    expect(roleMap).not.toContain('platform.enterprise.awaiting_approval');
  });

  it('reaches the service instead of writing its own SQL', () => {
    // §19.8: "sent directly by EnterpriseProvisioningWorkflow via the Notification Service — it is
    // NOT a Kafka event". The previous version wrote its own INSERT, which had drifted from the
    // schema in four ways at once (recipient_user_id / title / lowercase 'in_app' / tenant_id NULL)
    // and threw on every provisioning run. Nothing executed it, so nothing noticed.
    expect(activities).not.toContain('INSERT INTO notifications.notifications');
    expect(activities).toContain('notifySystemAdmins(PLATFORM_HUMAN_GATE_EVENT_TYPE');
  });

  it('routes platform events by the envelope sentinel, not by the event name', () => {
    // platform.sync.exhausted.v1 is also `platform.`-prefixed but carries a real tenant UUID, so a
    // name-prefix test would misroute it to every SYSTEM_ADMIN on the installation — a cross-tenant
    // disclosure that would look like a working notification.
    expect(svc).toMatch(/event\.tenant_id === PLATFORM_TENANT_SENTINEL/);
    expect(svc).toMatch(/findSystemAdmins\(\)/);
    expect(svc).toMatch(/tenant_id: r\.tenant_id \?\? event\.tenant_id/);
  });
});

// ── Absence: the escalation matrix is not the approval clock ───────────────

describe('the escalation matrix stays its own thing (master:5104-5107)', () => {
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

  it('does NOT carry the §15.5 48-hour approval timeout', () => {
    // master:5104 calls this out explicitly. The approval clock belongs to procurement; if it ever
    // migrated into this matrix a stale PO would start paging the safety chain, and the page would
    // look entirely legitimate.
    expect(escalation).not.toMatch(/48 \* 60 \* 60/);
  });

  it('escalates a given notification at most once', () => {
    // The sweep runs every five minutes; without a marker every sweep after the timeout would
    // re-escalate the same unread notification, forever.
    expect(escalation).toMatch(/escalated_at/);
  });

  it('drives the digest off a tenant-local clock, not a single UTC cron', () => {
    // 18:00 daily and Monday 08:00 TENANT-LOCAL. One UTC cron cannot mean 18:00 in every timezone,
    // so the cron fires hourly and the service picks the tenants whose local hour has arrived.
    expect(digest).toContain("@Cron('0 * * * *'");
    expect(digest).toMatch(/18:00/);
    expect(digest).toMatch(/Monday 08:00/);
  });
});

// ── Cross-source: the contract document versus the controller ──────────────

describe('the OpenAPI document describes the routes that exist (master:5128)', () => {
  it('documents every route the controller exposes', () => {
    const doc = readYaml<{ openapi: string; paths: Record<string, Record<string, unknown>> }>(
      'docs/api/notification.openapi.yaml',
    );
    // Controller routes, normalised to OpenAPI path syntax. @Sse is a GET as far as HTTP is
    // concerned, which is why the stream route is expected under `get`.
    const expected: Array<[string, string]> = [
      ['/notifications', 'get'],
      ['/notifications/{id}/read', 'patch'],
      ['/notifications/read-all', 'patch'],
      ['/notifications/preferences', 'get'],
      ['/notifications/preferences', 'patch'],
      ['/notifications/device-token', 'post'],
      ['/notifications/stream', 'get'],
    ];
    expect(expected.filter(([p, m]) => !doc.paths[p] || !doc.paths[p][m])).toEqual([]);
  });
});
