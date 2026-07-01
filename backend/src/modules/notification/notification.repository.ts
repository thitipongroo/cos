// Notification Repository — Phase 20
// All tables are in the global `notifications` schema (not per-tenant).
// tenant_id is used as a column filter on every query.
// findUsersByRole queries platform.* — always uses shared DB via platformPrisma.

import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { createPrismaClient } from '../../shared/prisma/create-prisma-client';
import { NotificationPrismaService } from './notification-prisma.service';

// ── Row types ──────────────────────────────────────────────────────────────

export interface TemplateRow {
  template_id: string;
  tenant_id: string | null;
  event_type: string;
  channel: string;
  subject_template: string | null;
  body_template: string;
  is_active: boolean;
}

export interface NotificationRow {
  notification_id: string;
  tenant_id: string;
  recipient_id: string;
  channel: string;
  event_type: string;
  subject: string | null;
  body: string;
  status: string;
  sent_at: Date | null;
  read_at: Date | null;
  created_at: Date;
}

export interface PreferenceRow {
  pref_id: string;
  tenant_id: string;
  user_id: string;
  event_type: string;
  channel: string;
  is_enabled: boolean;
}

export interface DeviceTokenRow {
  token_id: string;
  tenant_id: string;
  user_id: string;
  push_token: string;
  platform: string;
  created_at: Date;
}

// ── Repository ─────────────────────────────────────────────────────────────

@Injectable()
export class NotificationRepository implements OnModuleDestroy {
  // platform.* tables always stay on the shared DB — never move to dedicated DB
  private readonly platformPrisma = createPrismaClient(process.env['DATABASE_URL']);

  constructor(private readonly db: NotificationPrismaService) {}

  /** Close the platform Prisma connection on shutdown so the query-engine socket does not leak. */
  async onModuleDestroy(): Promise<void> {
    await this.platformPrisma.$disconnect();
  }

  // ── templates ──────────────────────────────────────────────────────────────

  async findTemplate(
    tenantId: string,
    eventType: string,
    channel: string,
  ): Promise<TemplateRow | null> {
    const rows = await this.db.run(
      tenantId,
      (tx) =>
        tx.$queryRaw<TemplateRow[]>`
        SELECT * FROM notifications.notification_templates
        WHERE event_type = ${eventType}
          AND channel    = ${channel}::notifications."NotificationChannel"
          AND is_active  = true
          AND (tenant_id = ${tenantId}::uuid OR tenant_id IS NULL)
        ORDER BY tenant_id NULLS LAST
        LIMIT 1
      `,
    );
    return rows[0] ?? null;
  }

  // ── notifications ──────────────────────────────────────────────────────────

  async createNotification(params: {
    tenant_id: string;
    recipient_id: string;
    channel: string;
    event_type: string;
    subject: string | null;
    body: string;
  }): Promise<NotificationRow> {
    const rows = await this.db.run(
      params.tenant_id,
      (tx) =>
        tx.$queryRaw<NotificationRow[]>`
        INSERT INTO notifications.notifications
          (tenant_id, recipient_id, channel, event_type, subject, body)
        VALUES
          (${params.tenant_id}::uuid, ${params.recipient_id}::uuid,
           ${params.channel}::notifications."NotificationChannel",
           ${params.event_type}, ${params.subject ?? null}, ${params.body})
        RETURNING *
      `,
    );
    return rows[0]!;
  }

  async findByRecipient(
    tenantId: string,
    userId: string,
    page: number,
    limit: number,
  ): Promise<{ rows: NotificationRow[]; total: number }> {
    const offset = (page - 1) * limit;
    const rows = await this.db.run(
      tenantId,
      (tx) =>
        tx.$queryRaw<NotificationRow[]>`
        SELECT * FROM notifications.notifications
        WHERE tenant_id    = ${tenantId}::uuid
          AND recipient_id = ${userId}::uuid
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
    );
    const countRows = await this.db.run(
      tenantId,
      (tx) =>
        tx.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*)::bigint AS count
        FROM notifications.notifications
        WHERE tenant_id    = ${tenantId}::uuid
          AND recipient_id = ${userId}::uuid
      `,
    );
    return { rows, total: Number(countRows[0]?.count ?? 0) };
  }

  async markRead(tenantId: string, notificationId: string, userId: string): Promise<boolean> {
    const result = await this.db.run(
      tenantId,
      (tx) =>
        tx.$executeRaw`
        UPDATE notifications.notifications
        SET status  = 'READ',
            read_at = now()
        WHERE notification_id = ${notificationId}::uuid
          AND tenant_id       = ${tenantId}::uuid
          AND recipient_id    = ${userId}::uuid
          AND status         != 'READ'
      `,
    );
    return result > 0;
  }

  async markAllRead(tenantId: string, userId: string): Promise<number> {
    return this.db.run(
      tenantId,
      (tx) =>
        tx.$executeRaw`
        UPDATE notifications.notifications
        SET status  = 'READ',
            read_at = now()
        WHERE tenant_id    = ${tenantId}::uuid
          AND recipient_id = ${userId}::uuid
          AND status      != 'READ'
      `,
    );
  }

  async markSent(tenantId: string, notificationId: string): Promise<void> {
    await this.db.run(
      tenantId,
      (tx) =>
        tx.$executeRaw`
        UPDATE notifications.notifications
        SET status  = 'SENT',
            sent_at = now()
        WHERE notification_id = ${notificationId}::uuid
      `,
    );
  }

  async markFailed(tenantId: string, notificationId: string): Promise<void> {
    await this.db.run(
      tenantId,
      (tx) =>
        tx.$executeRaw`
        UPDATE notifications.notifications
        SET status = 'FAILED'
        WHERE notification_id = ${notificationId}::uuid
      `,
    );
  }

  // ── preferences ────────────────────────────────────────────────────────────

  async findPreferences(tenantId: string, userId: string): Promise<PreferenceRow[]> {
    return this.db.run(
      tenantId,
      (tx) =>
        tx.$queryRaw<PreferenceRow[]>`
        SELECT * FROM notifications.notification_preferences
        WHERE tenant_id = ${tenantId}::uuid
          AND user_id   = ${userId}::uuid
        ORDER BY event_type, channel
      `,
    );
  }

  async isChannelEnabled(
    tenantId: string,
    userId: string,
    eventType: string,
    channel: string,
  ): Promise<boolean> {
    const rows = await this.db.run(
      tenantId,
      (tx) =>
        tx.$queryRaw<[{ is_enabled: boolean }]>`
        SELECT is_enabled FROM notifications.notification_preferences
        WHERE tenant_id  = ${tenantId}::uuid
          AND user_id    = ${userId}::uuid
          AND event_type = ${eventType}
          AND channel    = ${channel}::notifications."NotificationChannel"
        LIMIT 1
      `,
    );
    return rows[0]?.is_enabled ?? true;
  }

  async upsertPreference(params: {
    tenant_id: string;
    user_id: string;
    event_type: string;
    channel: string;
    is_enabled: boolean;
  }): Promise<PreferenceRow> {
    const rows = await this.db.run(
      params.tenant_id,
      (tx) =>
        tx.$queryRaw<PreferenceRow[]>`
        INSERT INTO notifications.notification_preferences
          (tenant_id, user_id, event_type, channel, is_enabled)
        VALUES
          (${params.tenant_id}::uuid, ${params.user_id}::uuid,
           ${params.event_type},
           ${params.channel}::notifications."NotificationChannel",
           ${params.is_enabled})
        ON CONFLICT (user_id, event_type, channel) DO UPDATE SET
          is_enabled = EXCLUDED.is_enabled
        RETURNING *
      `,
    );
    return rows[0]!;
  }

  // ── device tokens ──────────────────────────────────────────────────────────

  async upsertDeviceToken(params: {
    tenant_id: string;
    user_id: string;
    push_token: string;
    platform: string;
  }): Promise<DeviceTokenRow> {
    const rows = await this.db.run(
      params.tenant_id,
      (tx) =>
        tx.$queryRaw<DeviceTokenRow[]>`
        INSERT INTO notifications.notification_device_tokens
          (tenant_id, user_id, push_token, platform)
        VALUES
          (${params.tenant_id}::uuid, ${params.user_id}::uuid,
           ${params.push_token},
           ${params.platform}::notifications."DevicePlatform")
        ON CONFLICT (user_id, push_token) DO UPDATE SET
          platform = EXCLUDED.platform
        RETURNING *
      `,
    );
    return rows[0]!;
  }

  async findDeviceTokens(tenantId: string, userId: string): Promise<DeviceTokenRow[]> {
    return this.db.run(
      tenantId,
      (tx) =>
        tx.$queryRaw<DeviceTokenRow[]>`
        SELECT * FROM notifications.notification_device_tokens
        WHERE tenant_id = ${tenantId}::uuid
          AND user_id   = ${userId}::uuid
      `,
    );
  }

  // ── user resolution (platform schema — always shared DB) ───────────────────

  async findUsersByRole(
    tenantId: string,
    roles: string[],
  ): Promise<Array<{ user_id: string; email: string }>> {
    if (roles.length === 0) return [];
    return this.platformPrisma.$transaction(
      (tx) =>
        tx.$queryRaw<Array<{ user_id: string; email: string }>>`
        SELECT u.user_id, u.email
        FROM platform.tenant_memberships m
        JOIN platform.users u ON u.user_id = m.user_id
        WHERE m.tenant_id = ${tenantId}::uuid
          AND m.role::text = ANY(${roles}::text[])
          AND u.is_active  = true
      `,
    );
  }
}
