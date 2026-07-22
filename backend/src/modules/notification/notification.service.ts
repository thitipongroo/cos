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

const CHANNELS = ['IN_APP', 'EMAIL', 'LINE'] as const;
type Channel = (typeof CHANNELS)[number];

// Critical safety notifications are NEVER quieted (§19.6 — "cannot be disabled or quieted"). Only the
// safety-incident event qualifies; every other event's push is suppressed inside the quiet window.
const CRITICAL_EVENT_TYPES = new Set<string>(['safety.incident.created.v1']);

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
const EVENT_ROLE_MAP: Record<string, string[] | 'actor' | { payloadUserId: string }> = {
  'site.inspection.failed.v1': ['SITE_ENGINEER', 'PROJECT_MANAGER'],
  'site.issue.created.v1': ['SITE_ENGINEER', 'PROJECT_MANAGER'],
  'site.issue.escalated.v1': ['PROJECT_MANAGER'], // G-M12 — escalate raises the issue to the PM
  'site.conflict.flagged.v1': ['SITE_ENGINEER', 'PROJECT_MANAGER', 'TENANT_ADMIN'],
  'procurement.po.status_changed.v1': 'actor',
  'procurement.po.approval_requested.v1': { payloadUserId: 'approver_id' },
  'finance.variance.alert.v1': ['FINANCE', 'TENANT_ADMIN'],
  'site.report.created.v1': ['PROJECT_MANAGER'],
  'procurement.invoice.received.v1': ['FINANCE'],
  // §19.4 routing — safety incident (Exec/PM/Site Engineer/Safety Officer) + AI risk (Exec/PM)
  'safety.incident.created.v1': ['EXECUTIVE', 'PROJECT_MANAGER', 'SITE_ENGINEER', 'SAFETY_OFFICER'],
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

    let recipients: Array<{ user_id: string; email: string }>;
    if (routing === 'actor') {
      recipients = [{ user_id: event.actor_id, email: '' }];
    } else if (Array.isArray(routing)) {
      recipients = await this.repo.findUsersByRole(event.tenant_id, routing);
    } else {
      // Payload-targeted: notify the specific user named in the payload (e.g. approver_id).
      const targetId = event.payload[routing.payloadUserId];
      recipients =
        typeof targetId === 'string' && targetId ? [{ user_id: targetId, email: '' }] : [];
    }

    await Promise.allSettled(
      recipients.map((r) =>
        this.notifyUser({
          tenant_id: event.tenant_id,
          user_id: r.user_id,
          email: r.email,
          event_type: event.event_type,
          payload: event.payload,
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
    for (const channel of CHANNELS) {
      const enabled = await this.repo.isChannelEnabled(
        params.tenant_id,
        params.user_id,
        params.event_type,
        channel,
      );
      if (!enabled) continue;

      const template = await this.repo.findTemplate(params.tenant_id, params.event_type, channel);
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
          !CRITICAL_EVENT_TYPES.has(notif.event_type) &&
          (await this.isInQuietHours(notif.tenant_id, userId));
        if (!suppressPush) {
          const tokens = await this.repo.findDeviceTokens(notif.tenant_id, userId);
          await Promise.allSettled(
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
   * Deliver an escalation notice (§19.3) to every user holding `roles`. Composed inline (no template
   * lookup) as an IN_APP + email alert; the caller marks the source notification escalated afterwards.
   */
  async escalate(tenantId: string, roles: string[], subject: string, body: string): Promise<void> {
    const recipients = await this.repo.findUsersByRole(tenantId, roles);
    await Promise.allSettled(
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
          await this.email.send({ to: r.email, subject, body }).catch(() => undefined);
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
    await Promise.allSettled(
      recipients
        .filter((r) => r.email)
        .map((r) => this.email.send({ to: r.email, subject, body }).catch(() => undefined)),
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
  ) {
    return Promise.all(
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
  }

  // ── Template rendering ─────────────────────────────────────────────────────

  render(template: string, context: Record<string, unknown>): string {
    return Handlebars.compile(template)(context);
  }
}
