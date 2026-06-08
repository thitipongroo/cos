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

// Maps event_type → roles to notify; 'actor' means the actor_id from the event envelope.
// For platform.* events, tenant_id='platform' and routing resolves all SYSTEM_ADMIN users globally.
const EVENT_ROLE_MAP: Record<string, string[] | 'actor'> = {
  'site.inspection.failed.v1': ['SITE_ENGINEER', 'PROJECT_MANAGER'],
  'site.issue.created.v1': ['SITE_ENGINEER', 'PROJECT_MANAGER'],
  'procurement.purchase_order.status_changed.v1': 'actor',
  'finance.variance.alert.v1': ['FINANCE', 'TENANT_ADMIN'],
  'site.report.created.v1': ['PROJECT_MANAGER'],
  'procurement.vendor_invoice.received.v1': ['FINANCE'],
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
    } else {
      recipients = await this.repo.findUsersByRole(event.tenant_id, routing);
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
        this.sse.push(userId, notif);
        // Also deliver via Expo push to any registered device tokens
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
        await this.repo.markSent(notif.tenant_id, notif.notification_id);
        return;
      }

      if (channel === 'EMAIL') {
        await this.email.send({ to: email, subject: notif.subject, body: notif.body });
        await this.repo.markSent(notif.tenant_id, notif.notification_id);
        return;
      }

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
