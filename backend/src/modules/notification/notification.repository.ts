// Notification Repository — Phase 20
// The notifications-schema tables carry tenant_id and ARE protected by PostgreSQL RLS. Per-tenant
// operations go through `this.db.run(tenantId, …)` (NotificationPrismaService), which connects as the
// app role and sets `app.current_tenant_id` so RLS applies — the `WHERE tenant_id = …` clauses are
// secondary defense-in-depth, not the primary isolation.
// Cross-tenant SYSTEM sweeps (escalation, digest scheduler, role→user resolution over platform.*)
// deliberately use `platformPrisma` (the RLS-bypassing shared connection) because they span tenants.

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
  quiet_hours_start: string;
  quiet_hours_end: string;
}

/** Per-user quiet-hours window (§19.6). TIME columns come back as 'HH:MM:SS' strings. */
export interface QuietHours {
  start: string;
  end: string;
}

/** A notification eligible for escalation (§19.3). */
export interface EscalationCandidate {
  notification_id: string;
  tenant_id: string;
  recipient_id: string;
  event_type: string;
  subject: string | null;
  body: string;
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

/**
 * Most notifications one escalation sweep will send in a single tick, per rule. The sweep runs every
 * five minutes and sends one message per row, so this is a rate limit on a burst as much as a memory
 * bound — the remainder is not lost, it is escalated on the next tick.
 */
export const ESCALATION_BATCH_SIZE = 200;

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
          AND tenant_id       = ${tenantId}::uuid
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
          AND tenant_id       = ${tenantId}::uuid
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

  /**
   * The channels this user has explicitly DISABLED for an event type, in one query.
   *
   * Returns disabled rather than enabled channels on purpose: a missing preference row means
   * "enabled" (isChannelEnabled defaults `?? true`), so the set of explicit opt-outs is the complete
   * answer and the caller needs no per-channel fallback logic.
   *
   * Replaces one isChannelEnabled round trip per channel per recipient — each of which opened its own
   * db.run transaction, so notifying 50 users cost 150 transactions before a single template lookup.
   */
  async findDisabledChannels(
    tenantId: string,
    userId: string,
    eventType: string,
    channels: readonly string[],
  ): Promise<Set<string>> {
    if (channels.length === 0) return new Set();
    const rows = await this.db.run(
      tenantId,
      (tx) =>
        tx.$queryRaw<Array<{ channel: string }>>`
        SELECT channel FROM notifications.notification_preferences
        WHERE tenant_id  = ${tenantId}::uuid
          AND user_id    = ${userId}::uuid
          AND event_type = ${eventType}
          AND channel    = ANY(${channels}::notifications."NotificationChannel"[])
          AND is_enabled = false
      `,
    );
    return new Set(rows.map((r) => r.channel));
  }

  /**
   * Resolve the active template for each channel in one query.
   *
   * Mirrors findTemplate's precedence exactly — a tenant-specific row wins over the shared NULL-tenant
   * default — using DISTINCT ON so the choice is made per channel inside the same statement.
   */
  async findTemplatesByChannel(
    tenantId: string,
    eventType: string,
    channels: readonly string[],
  ): Promise<Map<string, TemplateRow>> {
    if (channels.length === 0) return new Map();
    const rows = await this.db.run(
      tenantId,
      (tx) =>
        tx.$queryRaw<TemplateRow[]>`
        SELECT DISTINCT ON (channel) *
          FROM notifications.notification_templates
         WHERE event_type = ${eventType}
           AND channel    = ANY(${channels}::notifications."NotificationChannel"[])
           AND is_active  = true
           AND (tenant_id = ${tenantId}::uuid OR tenant_id IS NULL)
         ORDER BY channel, tenant_id NULLS LAST
      `,
    );
    return new Map(rows.map((r) => [r.channel, r]));
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

  /**
   * Set the user's quiet-hours window (§19.6) on all their preference rows. The window lives on the
   * denormalised TIME columns of notification_preferences, so it updates every row the user owns and
   * returns how many were touched — 0 when the user has no rows yet (the caller upserts first).
   */
  async updateQuietHours(
    tenantId: string,
    userId: string,
    start: string,
    end: string,
  ): Promise<{ updated: number }> {
    const updated = await this.db.run(
      tenantId,
      (tx) =>
        tx.$executeRaw`
        UPDATE notifications.notification_preferences
        SET quiet_hours_start = ${start}::time, quiet_hours_end = ${end}::time
        WHERE tenant_id = ${tenantId}::uuid AND user_id = ${userId}::uuid
      `,
    );
    return { updated: Number(updated) };
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

  // ── quiet hours + tenant timezone (§19.6) ──────────────────────────────────

  /** Tenant IANA timezone (platform.tenants) — resolves "now" for quiet-hour comparison. */
  async getTenantTimezone(tenantId: string): Promise<string> {
    const rows = await this.platformPrisma.$transaction(
      (tx) =>
        tx.$queryRaw<[{ timezone: string }?]>`
        SELECT timezone FROM platform.tenants WHERE tenant_id = ${tenantId}::uuid LIMIT 1
      `,
    );
    return rows[0]?.timezone ?? 'Asia/Bangkok';
  }

  /**
   * The user's quiet-hours window (§19.6). Stored per preference row; a user's window is uniform
   * across rows, so the first row wins. Falls back to the spec default 22:00–07:00 when unset.
   */
  async getUserQuietHours(tenantId: string, userId: string): Promise<QuietHours> {
    const rows = await this.db.run(
      tenantId,
      (tx) =>
        tx.$queryRaw<Array<{ quiet_hours_start: string; quiet_hours_end: string }>>`
        SELECT quiet_hours_start, quiet_hours_end
        FROM notifications.notification_preferences
        WHERE tenant_id = ${tenantId}::uuid AND user_id = ${userId}::uuid
        LIMIT 1
      `,
    );
    const row = rows[0];
    return {
      start: row?.quiet_hours_start ?? '22:00:00',
      end: row?.quiet_hours_end ?? '07:00:00',
    };
  }

  // ── escalation (§19.3) — cross-tenant sweep on the shared DB ────────────────

  /**
   * Unacknowledged immediate notifications of `eventType` older than `olderThanSeconds` that have not
   * yet been escalated. Deliberately a cross-tenant sweep (system job) — it runs on `platformPrisma`
   * (the RLS-bypassing shared connection) precisely because it must span every tenant; per-tenant
   * reads/writes instead go through `this.db.run`, under the notifications-schema RLS policies.
   */
  /**
   * Unescalated, unread notifications past their acknowledgement window.
   *
   * Bounded and oldest-first. Unbounded, this returned every stale notification the tenant had ever
   * accumulated, and the caller then sent one message per row inside a single cron tick — so the
   * first sweep after an outage (or after the escalation rules were widened) was a backlog delivered
   * all at once. ORDER BY created_at is what makes the bound safe rather than arbitrary: the oldest
   * are the ones most overdue, and whatever does not fit is picked up by the next tick five minutes
   * later, because rows are only marked escalated once they have actually been sent.
   */
  async findEscalationCandidates(
    eventType: string,
    olderThanSeconds: number,
  ): Promise<EscalationCandidate[]> {
    return this.platformPrisma.$transaction(
      (tx) =>
        tx.$queryRaw<EscalationCandidate[]>`
        SELECT notification_id, tenant_id, recipient_id, event_type, subject, body
        FROM notifications.notifications
        WHERE event_type   = ${eventType}
          AND status       = 'SENT'
          AND read_at      IS NULL
          AND escalated_at IS NULL
          AND created_at   < now() - (${olderThanSeconds}::int * interval '1 second')
        ORDER BY created_at ASC
        LIMIT ${ESCALATION_BATCH_SIZE}
      `,
    );
  }

  /** All active tenants + their IANA timezone — the digest scheduler gates on tenant-local time. */
  async listActiveTenants(): Promise<Array<{ tenant_id: string; timezone: string }>> {
    return this.platformPrisma.$transaction(
      (tx) =>
        tx.$queryRaw<Array<{ tenant_id: string; timezone: string }>>`
        SELECT tenant_id, timezone FROM platform.tenants WHERE is_active = true
      `,
    );
  }

  /** Idempotency marker — the escalation sweep escalates a notification exactly once. */
  async markEscalated(notificationId: string): Promise<void> {
    await this.platformPrisma.$transaction(
      (tx) =>
        tx.$executeRaw`
        UPDATE notifications.notifications SET escalated_at = now()
        WHERE notification_id = ${notificationId}::uuid
      `,
    );
  }

  // ── user resolution (platform schema — always shared DB) ───────────────────

  /**
   * Every active SYSTEM_ADMIN on the installation, with the tenant each belongs to.
   *
   * Deliberately cross-tenant and therefore on platformPrisma, like the escalation and digest
   * sweeps: §19.8 routes platform-level events to "all active SYSTEM_ADMIN users", and there is no
   * single tenant whose RLS context could see them. The tenant_id comes back per row because the
   * notification is stored under the RECIPIENT's tenant — the event's own tenant_id is the
   * 'platform' sentinel and is not a UUID.
   */
  async findSystemAdmins(): Promise<Array<{ user_id: string; email: string; tenant_id: string }>> {
    return this.platformPrisma.$transaction(
      (tx) =>
        tx.$queryRaw<Array<{ user_id: string; email: string; tenant_id: string }>>`
        SELECT u.user_id, u.email, m.tenant_id
        FROM platform.tenant_memberships m
        JOIN platform.users u ON u.user_id = m.user_id
        WHERE m.role::text = 'SYSTEM_ADMIN'
          AND u.is_active  = true
      `,
    );
  }

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
