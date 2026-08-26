// Notification Service — Phase 20
// Orchestrates: template rendering (handlebars), preference filtering, channel dispatch.
// Singleton scope: tenant_id / user_id passed as explicit parameters.

import { Injectable } from '@nestjs/common';
import Handlebars from 'handlebars';
import { createLogger } from '@cos/logger';
import { NotificationRepository, type NotificationRow } from './notification.repository';
import { NotificationSseService } from './notification.sse.service';
import { ExpoPushAdapter } from './adapters/expo-push.adapter';
import { SendGridAdapter } from './adapters/sendgrid.adapter';
import { LineMessagingAdapter } from './adapters/line-messaging.adapter';

const logger = createLogger('notification-service');

/**
 * Run a fan-out where one failure must not stop the rest — and LOG every failure.
 *
 * Five call sites in this service used `Promise.allSettled` directly. The isolation is deliberate:
 * a Safety Officer must still be paged when a Project Manager's row fails to write. What was NOT
 * deliberate is that `allSettled` absorbs every rejection and returns, so a delivery that failed
 * left no error, no warning and no trace anywhere — the notification simply never existed, and the
 * only symptom was a person who was not told something.
 *
 * That cost real time on 2026-08-26: an end-to-end test wrote nothing, and locating the reason meant
 * instrumenting four layers by hand because the failure had already been swallowed. In production
 * nobody would have been instrumenting.
 *
 * Behaviour is unchanged — every task still runs, and this never throws. Only the silence is gone.
 */
async function settleAll(
  operation: string,
  context: Record<string, unknown>,
  tasks: ReadonlyArray<Promise<unknown>>,
): Promise<void> {
  const results = await Promise.allSettled(tasks);
  const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failures.length === 0) return;
  logger.error(
    { ...context, operation, failed: failures.length, of: results.length },
    'Fan-out had failures — the remaining recipients were still served',
  );
  // Each reason separately: one bad address and one broken template are different problems, and a
  // count alone sends whoever reads this looking in one place for both.
  for (const f of failures) {
    logger.error({ ...context, operation, err: f.reason }, 'Fan-out task failed');
  }
}

const CHANNELS = ['IN_APP', 'EMAIL', 'LINE'] as const;
type Channel = (typeof CHANNELS)[number];

// Critical safety notifications are NEVER disabled and NEVER quieted (§19.6 — "cannot be disabled
// or quieted — always delivered"). Both halves of that rule are enforced: notifyUser ignores a
// recipient's disabled preference rows for these events, and dispatch never suppresses their push
// inside the quiet window. Only the safety-incident event qualifies; every other event honours the
// recipient's preferences and quiet hours.
// §19.6 names TWO events here: SafetyIncidentReported and SafetyViolationDetected. Only the first has
// a canonical name — 'safety.incident.created.v1' (§32.4 / topic-catalog / .avsc). SafetyViolationDetected
// appears only as a business-event display name in 16-enterprise-event-flow §Safety and in the §19.6
// sentence itself: no canonical event type, no schema, no producer, no consumer. It is therefore
// deliberately NOT invented here: PO decision 2026-08-25 defers the producer to Phase 23, where
// SafetyVisionModel is built (see that phase's Generate list for the five halves it ships with).
// The guard in notification.service.spec.ts fails the build if a safety incident/violation event
// ever enters the catalogue without being added to this set.
export const CRITICAL_EVENT_TYPES = new Set<string>([
  'safety.incident.created.v1',
  'safety.violation.detected.v1',
]);

/**
 * Envelope tenant_id used by platform-level producers (§19.8). It is a sentinel, not a UUID, so it
 * can never be handed to a tenant-scoped query — findUsersByRole casts ::uuid and NotificationPrisma
 * rejects anything that is not a UUID. The event NAME is not the discriminator: platform.sync.
 * exhausted.v1 is also `platform.`-prefixed but carries a real tenant UUID, because it is a
 * tenant-scoped alert that merely travels on the shared topic.
 */
export const PLATFORM_TENANT_SENTINEL = 'platform';

/**
 * §19.8: platform-level notifications are "NOT subject to quiet-hours suppression — they represent
 * operational platform state that SYSTEM_ADMIN must act on". Note this exemption covers quiet hours
 * ONLY; §19.8 says nothing about preferences, so a SYSTEM_ADMIN who switches a channel off still
 * switches it off.
 */
/**
 * The §19.8 provisioning human gate. It is NOT a Kafka event — "sent directly by
 * EnterpriseProvisioningWorkflow via the Notification Service" — so it has no canonical event type,
 * no .avsc and no EVENT_ROLE_MAP entry. The string is still the templates table's key, which is how
 * its subject/body and its two channels come from data rather than from an INSERT literal.
 */
export const PLATFORM_HUMAN_GATE_EVENT_TYPE = 'platform.enterprise.awaiting_approval';

const PLATFORM_LEVEL_EVENT_TYPES = new Set<string>([
  'platform.enterprise.contract_signed.v1',
  'platform.enterprise.db_provisioned.v1',
  PLATFORM_HUMAN_GATE_EVENT_TYPE,
]);

/** Events that must reach the user regardless of the hour (§19.6 safety, §19.8 platform). */
function isQuietHoursExempt(eventType: string): boolean {
  return CRITICAL_EVENT_TYPES.has(eventType) || PLATFORM_LEVEL_EVENT_TYPES.has(eventType);
}

/** Minutes-since-midnight for a 'HH:MM[:SS]' string. */
function minutesOfDay(hms: string): number {
  const [h, m] = hms.split(':');
  return Number(h) * 60 + Number(m);
}

/**
 * True when `now` falls inside the [start, end) quiet window evaluated in `tz` (§19.6). Handles the
 * overnight-wrap default (22:00–07:00): quiet if the local time is at/after start OR before end.
 */
export function isWithinQuietHours(now: Date, tz: string, start: string, end: string): boolean {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  /* istanbul ignore next -- Intl always yields hour+minute for these options; fallback is defensive */
  const hh = parts.find((p) => p.type === 'hour')?.value ?? '00';
  /* istanbul ignore next -- defensive */
  const mm = parts.find((p) => p.type === 'minute')?.value ?? '00';
  const nowMin = Number(hh) * 60 + Number(mm);
  const startMin = minutesOfDay(start);
  const endMin = minutesOfDay(end);
  return startMin <= endMin
    ? nowMin >= startMin && nowMin < endMin // same-day window
    : nowMin >= startMin || nowMin < endMin; // overnight wrap
}

// Maps event_type → recipients. Three routing modes:
//   - string[]                 → notify all users holding any of these roles (findUsersByRole)
//   - 'actor'                  → notify the actor_id from the event envelope
//   - { payloadUserId: field } → notify the specific user id carried in payload[field]
// Event-type keys MUST match the canonical types emitted by producers (see @cos/shared
// EVENT_AVSC_MAP) and subscribed in notification.consumer — 'po'/'invoice', NOT
// 'purchase_order'/'vendor_invoice' (regression: mismatched keys silently drop notifications).
// For platform.* events, tenant_id='platform' and routing resolves all SYSTEM_ADMIN users globally.
/**
 * A routing rule that reads the payload to decide WHICH roles to tell.
 *
 * Needed for platform.sync.exhausted.v1, where §17.2 gives a different audience per entity type: a
 * lost safety incident alerts the PM and the Safety Officer, a lost attendance or inspection alerts
 * the PM, and a lost material log alerts nobody — it goes to the review queue and no further. One
 * static role list per event type cannot express that without over-notifying three of the four.
 */
type PayloadRoleSelector = { rolesFromPayload: (payload: Record<string, unknown>) => string[] };

// Exported so the integration suite can assert the routing table against the database rather than
// against a copy of itself: every event routed here needs a notification template, or notifyUser
// silently drops it at `if (!template) continue`.
export const EVENT_ROLE_MAP: Record<
  string,
  string[] | 'actor' | { payloadUserId: string } | PayloadRoleSelector
> = {
  'site.inspection.failed.v1': ['SITE_ENGINEER', 'PROJECT_MANAGER'],
  'site.issue.created.v1': ['SITE_ENGINEER', 'PROJECT_MANAGER'],
  'site.issue.escalated.v1': ['PROJECT_MANAGER'], // G-M12 — escalate raises the issue to the PM
  'site.conflict.flagged.v1': ['SITE_ENGINEER', 'PROJECT_MANAGER', 'TENANT_ADMIN'],
  'procurement.po.status_changed.v1': 'actor',
  'procurement.po.approval_requested.v1': { payloadUserId: 'approver_id' },
  'finance.variance.alert.v1': ['FINANCE', 'TENANT_ADMIN'],
  // §17.2 retry exhaustion. The review queue itself is TENANT_ADMIN's (master §Phase 10 "Tenant
  // admin review queue"), so they are told for every type; the operational alert is per entity.
  'platform.sync.exhausted.v1': {
    rolesFromPayload: (payload): string[] => {
      const entityType = String(payload['entity_type'] ?? '');
      const base = ['TENANT_ADMIN'];
      if (entityType === 'safety') return [...base, 'PROJECT_MANAGER', 'SAFETY_OFFICER'];
      if (entityType === 'attendance' || entityType === 'inspection') {
        return [...base, 'PROJECT_MANAGER'];
      }
      // material_consumption: review queue only — §17.2 asks for no alert.
      return base;
    },
  },
  'site.report.created.v1': ['PROJECT_MANAGER'],
  'procurement.invoice.received.v1': ['FINANCE'],
  // §19.4 routing — safety incident (Exec/PM/Site Engineer/Safety Officer) + AI risk (Exec/PM)
  'safety.incident.created.v1': ['EXECUTIVE', 'PROJECT_MANAGER', 'SITE_ENGINEER', 'SAFETY_OFFICER'],
  // Same audience as an incident: a detected violation is the thing that precedes one.
  'safety.violation.detected.v1': [
    'EXECUTIVE',
    'PROJECT_MANAGER',
    'SITE_ENGINEER',
    'SAFETY_OFFICER',
  ],
  'ai.risk_prediction.generated.v1': ['EXECUTIVE', 'PROJECT_MANAGER'],
  // Phase 25 — platform-level events (tenant_id='platform', routed to all SYSTEM_ADMINs)
  'platform.enterprise.contract_signed.v1': ['SYSTEM_ADMIN'],
  'platform.enterprise.db_provisioned.v1': ['SYSTEM_ADMIN'],
  // Phase 9 — file quarantine alert routed to SYSTEM_ADMIN for the affected tenant
  'file.document.quarantined.v1': ['SYSTEM_ADMIN'],
};

@Injectable()
export class NotificationService {
  constructor(
    private readonly repo: NotificationRepository,
    private readonly sse: NotificationSseService,
    private readonly push: ExpoPushAdapter,
    private readonly email: SendGridAdapter,
    private readonly line: LineMessagingAdapter,
  ) {}

  // ── Event dispatch ─────────────────────────────────────────────────────────

  async handleEvent(event: {
    event_type: string;
    tenant_id: string;
    actor_id: string;
    payload: Record<string, unknown>;
  }): Promise<void> {
    const routing = EVENT_ROLE_MAP[event.event_type];
    if (!routing) {
      logger.warn({ event_type: event.event_type }, 'No routing config for event type');
      return;
    }

    // Recipients may live in a different tenant from the event: a platform-level event is addressed
    // to every SYSTEM_ADMIN on the installation, and each of them belongs to a tenant of their own.
    // The row is stored under the RECIPIENT's tenant so it lands in an inbox the existing
    // tenant-scoped query and RLS policy can already reach.
    let recipients: Array<{ user_id: string; email: string; tenant_id?: string }>;
    if (event.tenant_id === PLATFORM_TENANT_SENTINEL) {
      recipients = await this.repo.findSystemAdmins();
    } else if (routing === 'actor') {
      recipients = [{ user_id: event.actor_id, email: '' }];
    } else if (Array.isArray(routing)) {
      recipients = await this.repo.findUsersByRole(event.tenant_id, routing);
    } else if ('rolesFromPayload' in routing) {
      const roles = routing.rolesFromPayload(event.payload);
      recipients = roles.length ? await this.repo.findUsersByRole(event.tenant_id, roles) : [];
    } else {
      // Payload-targeted: notify the specific user named in the payload (e.g. approver_id).
      const targetId = event.payload[routing.payloadUserId];
      recipients =
        typeof targetId === 'string' && targetId ? [{ user_id: targetId, email: '' }] : [];
    }

    await settleAll(
      'handleEvent',
      { event_type: event.event_type, tenant_id: event.tenant_id },
      recipients.map((r) =>
        this.notifyUser({
          tenant_id: r.tenant_id ?? event.tenant_id,
          user_id: r.user_id,
          email: r.email,
          event_type: event.event_type,
          payload: event.payload,
        }),
      ),
    );
  }

  /**
   * Deliver a platform-level notification that did not arrive over Kafka (§19.8 human gate).
   *
   * Recipients are every active SYSTEM_ADMIN, exactly as the platform branch of handleEvent resolves
   * them, and the row is stored under each admin's own tenant. Kept off EVENT_ROLE_MAP on purpose:
   * an entry there would claim a Kafka audience for a message no consumer subscribes to, which is
   * the shape that left both enterprise events unreachable in the first place.
   */
  async notifySystemAdmins(eventType: string, payload: Record<string, unknown>): Promise<void> {
    const recipients = await this.repo.findSystemAdmins();
    await settleAll(
      'notifySystemAdmins',
      { event_type: eventType },
      recipients.map((r) =>
        this.notifyUser({
          tenant_id: r.tenant_id,
          user_id: r.user_id,
          email: r.email,
          event_type: eventType,
          payload,
        }),
      ),
    );
  }

  // ── Per-user notification ──────────────────────────────────────────────────

  private async notifyUser(params: {
    tenant_id: string;
    user_id: string;
    email: string;
    event_type: string;
    payload: Record<string, unknown>;
  }): Promise<void> {
    // Two queries for the whole channel set, not two per channel. This loop previously ran
    // isChannelEnabled + findTemplate for each of IN_APP/EMAIL/LINE, and each call opens its own
    // db.run transaction — six transactions per recipient before any notification was written,
    // multiplied by every recipient of the event.
    const [disabledChannels, templatesByChannel] = await Promise.all([
      this.repo.findDisabledChannels(params.tenant_id, params.user_id, params.event_type, CHANNELS),
      this.repo.findTemplatesByChannel(params.tenant_id, params.event_type, CHANNELS),
    ]);

    // §19.6: a critical safety event is delivered on every channel regardless of what the recipient
    // has switched off. Without this, a user who mutes one channel to cut noise silently stops
    // receiving incident alerts — and the §19.7 escalation chain never fires either, because it is
    // driven by an acknowledgement that can only come from a notification the user never got.
    const critical = CRITICAL_EVENT_TYPES.has(params.event_type);

    for (const channel of CHANNELS) {
      // Absent preference row = enabled, matching isChannelEnabled's `?? true` default.
      if (!critical && disabledChannels.has(channel)) continue;

      const template = templatesByChannel.get(channel);
      if (!template) continue;

      const subject = template.subject_template
        ? this.render(template.subject_template, params.payload)
        : null;
      const body = this.render(template.body_template, params.payload);

      const notif = await this.repo.createNotification({
        tenant_id: params.tenant_id,
        recipient_id: params.user_id,
        channel,
        event_type: params.event_type,
        subject,
        body,
      });

      await this.dispatch(channel, notif, params.user_id, params.email);
    }
  }

  // ── Channel dispatch ───────────────────────────────────────────────────────

  private async dispatch(
    channel: Channel,
    notif: NotificationRow,
    userId: string,
    email: string,
  ): Promise<void> {
    try {
      if (channel === 'IN_APP') {
        // In-app SSE is always delivered (the user sees it when the app is open); only the PUSH alert
        // is subject to quiet hours (§19.6). Critical safety pushes are never suppressed.
        this.sse.push(userId, notif);
        const suppressPush =
          !isQuietHoursExempt(notif.event_type) &&
          (await this.isInQuietHours(notif.tenant_id, userId));
        if (!suppressPush) {
          const tokens = await this.repo.findDeviceTokens(notif.tenant_id, userId);
          await settleAll(
            'pushToDevices',
            { notification_id: notif.notification_id, tenant_id: notif.tenant_id },
            tokens.map((t) =>
              this.push.send({
                pushToken: t.push_token,
                title: notif.subject,
                body: notif.body,
                notificationId: notif.notification_id,
              }),
            ),
          );
        }
        await this.repo.markSent(notif.tenant_id, notif.notification_id);
        return;
      }

      if (channel === 'EMAIL') {
        await this.email.send({ to: email, subject: notif.subject, body: notif.body });
        await this.repo.markSent(notif.tenant_id, notif.notification_id);
        return;
      }

      /* istanbul ignore else -- Channel is exhaustively IN_APP|EMAIL|LINE and the first two
         return above, so this guard is always true; kept as a defensive, self-documenting check */
      if (channel === 'LINE') {
        // line_user_id sourced from env for MVP; per-tenant in Stage 2
        const lineUserId = process.env[`LINE_USER_ID_${userId.replace(/-/g, '_')}`] ?? '';
        if (lineUserId) {
          await this.line.send({ lineUserId, body: notif.body });
          await this.repo.markSent(notif.tenant_id, notif.notification_id);
        }
        return;
      }
    } catch (err) {
      logger.error(
        { err, channel, notification_id: notif.notification_id },
        'Channel delivery failed',
      );
      await this.repo.markFailed(notif.tenant_id, notif.notification_id).catch(() => undefined);
    }
  }

  /** Whether it is currently within the user's quiet-hours window, evaluated in the tenant timezone. */
  private async isInQuietHours(tenantId: string, userId: string): Promise<boolean> {
    const [tz, window] = await Promise.all([
      this.repo.getTenantTimezone(tenantId),
      this.repo.getUserQuietHours(tenantId, userId),
    ]);
    return isWithinQuietHours(new Date(), tz, window.start, window.end);
  }

  /**
   * Deliver a CRITICAL message to ONE named user, exempt from preferences and quiet hours.
   *
   * master:5041 says no service sends notifications directly — everything routes through here. Three
   * places in the identity module did anyway (step-up codes, data-subject request verification, the
   * data-export link), and they were right to: this service had no door for them. Every public entry
   * resolved its recipients from a ROLE or from an event envelope, and none of them can address one
   * person. A verification code has exactly one recipient and no role.
   *
   * They also could not use the normal path even if it existed: §19.6 preferences and quiet hours
   * would let a user silence the one message that answers a statutory request, or the code that
   * completes their own login. That is what `critical` means here — the same exemption
   * CRITICAL_EVENT_TYPES already grants a safety incident, applied to one addressed recipient.
   *
   * Routing through the service rather than around it is what the industry does with these: Knock
   * models a password reset as a workflow with "override recipient preferences" and Courier as a
   * category that bypasses preference checks — in both, the message still goes through the
   * notification system. What that buys, and what a direct SendGrid call loses, is the row in
   * notifications.notifications. For a PDPA/GDPR data-subject response the record that the subject
   * WAS notified is part of the obligation; a mail sent outside the service leaves none.
   *
   * Composed inline like {@link escalate} — no template lookup, because these bodies carry one-time
   * tokens and links that no template table should ever hold.
   */
  async notifyUserCritical(params: {
    tenant_id: string;
    user_id: string;
    email: string;
    event_type: string;
    subject: string;
    body: string;
  }): Promise<void> {
    const notif = await this.repo.createNotification({
      tenant_id: params.tenant_id,
      recipient_id: params.user_id,
      channel: 'IN_APP',
      event_type: params.event_type,
      subject: params.subject,
      body: params.body,
    });
    this.sse.push(params.user_id, notif);
    await this.repo.markSent(params.tenant_id, notif.notification_id);

    // The email is the channel that matters for these — phone_number is nullable, so email is the
    // only one every account is reachable on. It is sent WITHOUT consulting findDisabledChannels or
    // the quiet window, which is the whole point of the method.
    if (params.email) {
      await this.email
        .send({ to: params.email, subject: params.subject, body: params.body })
        .catch((err: unknown) => {
          // The in-app row is already written and marked sent, so a bounce must not undo it — but a
          // verification code nobody received is a person who cannot finish what they started, and
          // that has to be findable.
          logger.error(
            {
              err,
              tenant_id: params.tenant_id,
              recipient_id: params.user_id,
              event_type: params.event_type,
            },
            'Critical user notification email failed — the in-app row was still written',
          );
        });
    }
  }

  /**
   * Deliver an escalation notice (§19.3) to every user holding `roles`. Composed inline (no template
   * lookup) as an IN_APP + email alert; the caller marks the source notification escalated afterwards.
   */
  async escalate(tenantId: string, roles: string[], subject: string, body: string): Promise<void> {
    const recipients = await this.repo.findUsersByRole(tenantId, roles);
    await settleAll(
      'escalate',
      { tenant_id: tenantId, roles },
      recipients.map(async (r) => {
        const notif = await this.repo.createNotification({
          tenant_id: tenantId,
          recipient_id: r.user_id,
          channel: 'IN_APP',
          event_type: 'notification.escalated.v1',
          subject,
          body,
        });
        this.sse.push(r.user_id, notif);
        await this.repo.markSent(tenantId, notif.notification_id);
        if (r.email) {
          // The IN_APP row is already written and marked sent, so a bounce here must not undo the
          // escalation — but it is still a Project Manager who did not get the mail, so it is logged
          // rather than discarded.
          await this.email.send({ to: r.email, subject, body }).catch((err: unknown) => {
            logger.error(
              { err, tenant_id: tenantId, recipient_id: r.user_id },
              'Escalation email failed — the in-app notification was still delivered',
            );
          });
        }
      }),
    );
  }

  /** Deliver a scheduled digest (§19.3) via email to every user holding `roles`. Email-only by spec. */
  async deliverDigest(
    tenantId: string,
    roles: string[],
    subject: string,
    body: string,
  ): Promise<void> {
    const recipients = await this.repo.findUsersByRole(tenantId, roles);
    await settleAll(
      'deliverDigest',
      { tenant_id: tenantId, roles },
      recipients
        .filter((r) => r.email)
        // The per-recipient catch is what keeps one hard bounce from rejecting the whole scheduled
        // batch (18:00 daily / Mon 08:00). It used to discard the reason with it.
        .map((r) =>
          this.email.send({ to: r.email, subject, body }).catch((err: unknown) => {
            logger.error(
              { err, tenant_id: tenantId, recipient_id: r.user_id },
              'Digest email failed for one recipient',
            );
          }),
        ),
    );
  }

  // ── Push token registration ────────────────────────────────────────────────

  async registerDeviceToken(params: {
    tenant_id: string;
    user_id: string;
    push_token: string;
    platform: string;
  }) {
    return this.repo.upsertDeviceToken(params);
  }

  // ── HTTP read operations ───────────────────────────────────────────────────

  async listNotifications(tenantId: string, userId: string, page: number, limit: number) {
    return this.repo.findByRecipient(tenantId, userId, page, limit);
  }

  async markRead(tenantId: string, notificationId: string, userId: string): Promise<boolean> {
    return this.repo.markRead(tenantId, notificationId, userId);
  }

  async markAllRead(tenantId: string, userId: string): Promise<{ updated: number }> {
    const updated = await this.repo.markAllRead(tenantId, userId);
    return { updated: Number(updated) };
  }

  async getPreferences(tenantId: string, userId: string) {
    return this.repo.findPreferences(tenantId, userId);
  }

  async updatePreferences(
    tenantId: string,
    userId: string,
    preferences: Array<{ event_type: string; channel: string; is_enabled: boolean }>,
    quietHours?: { start: string; end: string },
  ) {
    const results = await Promise.all(
      preferences.map((p) =>
        this.repo.upsertPreference({
          tenant_id: tenantId,
          user_id: userId,
          event_type: p.event_type,
          channel: p.channel,
          is_enabled: p.is_enabled,
        }),
      ),
    );
    // Quiet hours (§19.6) live on the denormalised preference rows, so upsert the rows first, then
    // stamp the window on all of them. Skipped unless the caller supplied a validated window.
    if (quietHours) {
      await this.repo.updateQuietHours(tenantId, userId, quietHours.start, quietHours.end);
    }
    return results;
  }

  // ── Template rendering ─────────────────────────────────────────────────────

  render(template: string, context: Record<string, unknown>): string {
    return Handlebars.compile(template)(context);
  }
}
