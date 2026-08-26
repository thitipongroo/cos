/**
 * Phase 20 — Notification delivery against a real PostgreSQL (master:5065-5101, 5130).
 *
 * The offline suite proves the routing table and the preference rules are DECLARED. This one proves
 * an event turns into a row a user can actually see, which is a different claim: notifyUser drops a
 * channel silently when no template covers the event, so a fully correct routing table can still
 * deliver nothing. That failure mode is invisible to the unit tests — every one of them mocks
 * findTemplatesByChannel — and it is what §19.6's "always delivered" depends on.
 */
import { randomUUID } from 'node:crypto';
import {
  startIntegrationInfra,
  stopIntegrationInfra,
  type IntegrationInfra,
} from '../helpers/integration-infra';
import {
  NotificationService,
  EVENT_ROLE_MAP,
  PLATFORM_HUMAN_GATE_EVENT_TYPE,
} from '../../src/modules/notification/notification.service';
import { NotificationRepository } from '../../src/modules/notification/notification.repository';
import { NotificationPrismaService } from '../../src/modules/notification/notification-prisma.service';

jest.setTimeout(900_000);

describe('Phase 20 · notification delivery', () => {
  let infra: IntegrationInfra;
  let svc: NotificationService;

  const tenantId = randomUUID();
  const officerId = randomUUID();
  const pmId = randomUUID();
  const adminId = randomUUID();
  const sent: { sse: number; push: number; email: number; line: number } = {
    sse: 0,
    push: 0,
    email: 0,
    line: 0,
  };

  beforeAll(async () => {
    infra = await startIntegrationInfra();

    // Constructed here, not at module load: NotificationRepository builds its platform Prisma client
    // from process.env in a field initializer, and startIntegrationInfra is what sets DATABASE_URL.
    const repo = new NotificationRepository(new NotificationPrismaService());
    // Adapters are counted, not called for real — the assertions are about what the service decided
    // to deliver, and a live SendGrid/Expo call would make the suite depend on the network.
    svc = new NotificationService(
      repo,
      { push: (): void => void (sent.sse += 1) } as never,
      { send: async (): Promise<void> => void (sent.push += 1) } as never,
      { send: async (): Promise<void> => void (sent.email += 1) } as never,
      { send: async (): Promise<void> => void (sent.line += 1) } as never,
    );

    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.tenants (tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type)
       VALUES ($1::uuid, $2, $3, $4, 'PROFESSIONAL')`,
      tenantId,
      `t${tenantId.slice(0, 8)}`,
      'Phase 20 Tenant',
      `realm-${tenantId.slice(0, 8)}`,
    );
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.users (user_id, tenant_id, keycloak_user_id, email, display_name)
       VALUES ($1::uuid, $2::uuid, $3, $4, 'Safety Officer')`,
      officerId,
      tenantId,
      `kc-${officerId}`,
      'officer@example.com',
    );
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.tenant_memberships (tenant_id, user_id, role)
       VALUES ($1::uuid, $2::uuid, 'SAFETY_OFFICER')`,
      tenantId,
      officerId,
    );

    // A second user holding PROJECT_MANAGER. Without one, "a disabled channel suppresses delivery"
    // would pass against the safety officer for the wrong reason — that user is not routed
    // site.report.created.v1 at all, so nothing would arrive either way.
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.users (user_id, tenant_id, keycloak_user_id, email, display_name)
       VALUES ($1::uuid, $2::uuid, $3, $4, 'Project Manager')`,
      pmId,
      tenantId,
      `kc-${pmId}`,
      'pm@example.com',
    );
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.tenant_memberships (tenant_id, user_id, role)
       VALUES ($1::uuid, $2::uuid, 'PROJECT_MANAGER')`,
      tenantId,
      pmId,
    );

    // A SYSTEM_ADMIN for the §19.8 platform-level cases.
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.users (user_id, tenant_id, keycloak_user_id, email, display_name)
       VALUES ($1::uuid, $2::uuid, $3, $4, 'System Admin')`,
      adminId,
      tenantId,
      `kc-${adminId}`,
      'admin@example.com',
    );
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.tenant_memberships (tenant_id, user_id, role)
       VALUES ($1::uuid, $2::uuid, 'SYSTEM_ADMIN')`,
      tenantId,
      adminId,
    );
  });

  afterAll(async () => {
    await stopIntegrationInfra(infra);
  });

  const notificationsFor = (
    eventType: string,
    recipientId: string = officerId,
  ): Promise<Array<{ channel: string; body: string }>> =>
    infra.prisma.$queryRawUnsafe(
      `SELECT channel, body FROM notifications.notifications
        WHERE tenant_id = $1::uuid AND recipient_id = $2::uuid AND event_type = $3`,
      tenantId,
      recipientId,
      eventType,
    );

  const disableEveryChannel = async (
    eventType: string,
    userId: string = officerId,
  ): Promise<void> => {
    for (const channel of ['IN_APP', 'EMAIL', 'LINE']) {
      await infra.prisma.$executeRawUnsafe(
        `INSERT INTO notifications.notification_preferences
           (tenant_id, user_id, event_type, channel, is_enabled)
         VALUES ($1::uuid, $2::uuid, $3, $4::notifications."NotificationChannel", false)
         ON CONFLICT (user_id, event_type, channel) DO UPDATE SET is_enabled = false`,
        tenantId,
        userId,
        eventType,
        channel,
      );
    }
  };

  const emitReport = (reportId: string): Promise<void> =>
    svc.handleEvent({
      event_type: 'site.report.created.v1',
      tenant_id: tenantId,
      actor_id: officerId,
      payload: {
        report_id: reportId,
        project_id: 'p1',
        report_date: '2026-08-24',
        submitted_by: officerId,
        summary: 'day summary',
        issue_count: 1,
        photo_count: 2,
      },
    });

  // ── 15. Schema on a real database ─────────────────────────────────────────

  describe('entities (master:5065-5097)', () => {
    it('has the three tables the spec lists', async () => {
      const rows = await infra.prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'notifications' ORDER BY table_name`,
      );
      const names = rows.map((r) => r.table_name);
      expect(names).toEqual(
        expect.arrayContaining([
          'notification_templates',
          'notifications',
          'notification_preferences',
        ]),
      );
    });

    it('carries all five channel enum values', async () => {
      const rows = await infra.prisma.$queryRawUnsafe<Array<{ label: string }>>(
        `SELECT e.enumlabel AS label FROM pg_enum e
           JOIN pg_type t ON t.oid = e.enumtypid
           JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE n.nspname = 'notifications' AND t.typname = 'NotificationChannel'`,
      );
      expect(rows.map((r) => r.label).sort()).toEqual(
        ['EMAIL', 'IN_APP', 'LINE', 'PUSH', 'SMS'].sort(),
      );
    });

    it('carries the canonical tenant-isolation policy on every notifications table', async () => {
      // Canonical form per 20260623000002 / 20260822000001: exactly one policy per table, named
      // rls_tenant_isolation, PERMISSIVE (a LONE restrictive policy grants nothing and makes the
      // table deny-all), FOR ALL, TO app_user, NULLIF-hardened on both USING and WITH CHECK.
      const rows = await infra.prisma.$queryRawUnsafe<
        Array<{
          tablename: string;
          policyname: string;
          permissive: string;
          cmd: string;
          roles: string;
          qual: string | null;
          with_check: string | null;
        }>
      >(
        `SELECT tablename, policyname, permissive, cmd, roles::text AS roles, qual, with_check
           FROM pg_policies WHERE schemaname = 'notifications' ORDER BY tablename`,
      );
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.filter((r) => r.permissive !== 'PERMISSIVE')).toEqual([]);
      expect(rows.filter((r) => r.policyname !== 'rls_tenant_isolation')).toEqual([]);
      expect(rows.filter((r) => !r.roles.includes('app_user'))).toEqual([]);
      expect(rows.filter((r) => !(r.qual ?? '').includes('NULLIF'))).toEqual([]);
    });

    it('lets app_user read a system-default template (tenant_id IS NULL)', async () => {
      // The one RLS question Phase 20 actually depends on. Templates are looked up through
      // NotificationPrismaService, which connects as app_user; a policy of the plain form
      // `tenant_id = current_tenant` matches no NULL row, so every system default would be
      // invisible and NOTHING would ever be delivered — while this suite's superuser connection
      // kept reporting success. Proven as behaviour under SET LOCAL ROLE app_user, not read off
      // the policy text.
      const visible = await infra.prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET LOCAL ROLE app_user');
        await tx.$executeRawUnsafe(
          `SELECT set_config('app.current_tenant_id', $1, true)`,
          tenantId,
        );
        return tx.$queryRawUnsafe<Array<{ event_type: string }>>(
          `SELECT event_type FROM notifications.notification_templates
            WHERE tenant_id IS NULL AND event_type = 'safety.incident.created.v1'`,
        );
      });
      expect(visible).toHaveLength(1);
    });
  });

  // ── Template coverage — the gap behind "always delivered" ──────────────────

  describe('template coverage', () => {
    it('has a system-default template for every routed event type', async () => {
      // A routed event with no template produces nothing at all: notifyUser skips each channel at
      // `if (!template) continue`. Thirteen of the fifteen routed events were in that state until
      // the 20260824 migrations, including safety.incident.created.v1 — the one event §19.6 says
      // can never be suppressed. Asserted against the database, so a routing entry added later
      // without a template fails here rather than going quiet in production.
      const rows = await infra.prisma.$queryRawUnsafe<Array<{ event_type: string }>>(
        `SELECT DISTINCT event_type FROM notifications.notification_templates
          WHERE tenant_id IS NULL AND is_active = true`,
      );
      const templated = new Set(rows.map((r) => r.event_type));
      // The §19.8 human gate is not in EVENT_ROLE_MAP — it never arrives over Kafka — but it is
      // rendered from the same table, so it belongs in the same coverage claim.
      const needTemplates = [...Object.keys(EVENT_ROLE_MAP), PLATFORM_HUMAN_GATE_EVENT_TYPE];
      const uncovered = needTemplates.filter((e) => !templated.has(e));
      expect(uncovered).toEqual([]);
    });
  });

  // ── 16. Event becomes a notification ──────────────────────────────────────

  describe('event → notification (master:5130)', () => {
    it('writes a rendered notification for a routed event', async () => {
      await svc.handleEvent({
        event_type: 'site.inspection.failed.v1',
        tenant_id: tenantId,
        actor_id: officerId,
        payload: {
          inspection_id: 'insp-001',
          project_id: 'proj-001',
          checklist_id: 'chk-001',
          failed_items: ['guardrail'],
          inspected_by: 'someone',
          inspected_at: '2026-08-24T09:00:00Z',
        },
      });

      // SITE_ENGINEER + PROJECT_MANAGER are the routed roles and this user holds neither, so the
      // absence of a row here would be ambiguous. The safety event below is the one this user
      // receives; this case proves routing excludes as well as includes.
      const rows = await notificationsFor('site.inspection.failed.v1');
      expect(rows).toEqual([]);
    });

    it('delivers to a user who holds the routed role, with the template rendered', async () => {
      await svc.handleEvent({
        event_type: 'safety.incident.created.v1',
        tenant_id: tenantId,
        actor_id: officerId,
        payload: {
          incident_id: 'inc-001',
          project_id: 'proj-77',
          incident_type: 'fall',
          severity: 'CRITICAL',
          reported_by: officerId,
        },
      });

      const rows = await notificationsFor('safety.incident.created.v1');
      expect(rows).toHaveLength(1);
      expect(rows[0].channel).toBe('IN_APP');
      // Placeholders resolved against the event payload — an unrendered body would still be a row,
      // and would still pass a "was anything delivered" check.
      expect(rows[0].body).toContain('proj-77');
      expect(rows[0].body).toContain('CRITICAL');
      expect(rows[0].body).not.toContain('{{');
    });
  });

  // ── 17. Preference filtering and the critical override ────────────────────

  describe('preferences (master:5100-5101)', () => {
    it('delivers a non-critical event to the routed role while preferences are untouched', async () => {
      // The baseline the suppression test needs. Absent this, "no row after disabling" could mean
      // the preference worked, or that nothing was ever routed to this user.
      await emitReport('r1');
      expect(await notificationsFor('site.report.created.v1', pmId)).toHaveLength(1);
    });

    it('suppresses that same event once every channel is disabled', async () => {
      await disableEveryChannel('site.report.created.v1', pmId);
      await emitReport('r2');
      // Still the single row from the baseline — the second emit added nothing.
      expect(await notificationsFor('site.report.created.v1', pmId)).toHaveLength(1);
    });

    it('delivers a critical safety event even with every channel disabled', async () => {
      await disableEveryChannel('safety.incident.created.v1');
      await svc.handleEvent({
        event_type: 'safety.incident.created.v1',
        tenant_id: tenantId,
        actor_id: officerId,
        payload: {
          incident_id: 'inc-002',
          project_id: 'proj-88',
          incident_type: 'electrical',
          severity: 'HIGH',
          reported_by: officerId,
        },
      });

      const rows = await notificationsFor('safety.incident.created.v1');
      // Two now: the one from the delivery test above, plus this one written despite the opt-out.
      expect(rows).toHaveLength(2);
      expect(rows.some((r) => r.body.includes('proj-88'))).toBe(true);
    });

    it('control — the opt-out still silences the non-critical event afterwards', async () => {
      // Proves the override is scoped to the critical set rather than having switched preference
      // filtering off altogether.
      await emitReport('r3');
      expect(await notificationsFor('site.report.created.v1', pmId)).toHaveLength(1);
    });
  });
  // ── §19.8 platform-level delivery ─────────────────────────────────────────

  describe('platform-level events (§19.8)', () => {
    it('delivers to every active SYSTEM_ADMIN, stored under the recipient tenant', async () => {
      // The envelope carries the 'platform' sentinel, which is not a UUID: routed through the
      // ordinary tenant path it would fail the ::uuid cast in findUsersByRole before reaching
      // anyone. The row is written under the ADMIN's tenant so the existing inbox query and RLS
      // policy can see it.
      await svc.handleEvent({
        event_type: 'platform.enterprise.db_provisioned.v1',
        tenant_id: 'platform',
        actor_id: 'system',
        payload: {
          tenant_id: tenantId,
          tenant_name: 'Phase 20 Tenant',
          tenant_code: 'p20',
          rds_endpoint: 'cos-tenant-p20.example.rds.amazonaws.com',
        },
      });

      const rows = await notificationsFor('platform.enterprise.db_provisioned.v1', adminId);
      // IN_APP and EMAIL — §19.8's routing table marks both Yes for this event.
      expect(rows.map((r) => r.channel).sort()).toEqual(['EMAIL', 'IN_APP']);
      // §19.8's content table wording, with the tenant name the payload now carries.
      expect(rows[0].body).toContain('Phase 20 Tenant');
      expect(rows[0].body).not.toContain('{{');
    });

    it('does not treat a tenant-scoped platform.* event as installation-wide', async () => {
      // platform.sync.exhausted.v1 shares the prefix but carries a real tenant UUID. If the
      // sentinel check were a name-prefix test, this would page every SYSTEM_ADMIN on the box.
      await svc.handleEvent({
        event_type: 'platform.sync.exhausted.v1',
        tenant_id: tenantId,
        actor_id: 'device-1',
        payload: {
          item_id: 'i1',
          entity_type: 'material_consumption',
          entity_id: 'e1',
          operation: 'CREATE',
          client_id: 'c1',
          retry_count: 5,
        },
      });

      // §17.2 sends material_consumption to the review queue only — TENANT_ADMIN, and this
      // installation has none, so no SYSTEM_ADMIN should hear about it either.
      expect(await notificationsFor('platform.sync.exhausted.v1', adminId)).toEqual([]);
    });
  });

  // ── §19.8 human gate ──────────────────────────────────────────────────────

  describe('provisioning human gate (§19.8)', () => {
    it('writes the approval notification instead of throwing', async () => {
      // This statement named recipient_user_id / title / 'in_app' / tenant_id NULL — none of which
      // exist on the table — so every provisioning run threw here. Executed against the real schema
      // because that is the only thing that could have caught it.
      // Loaded through the Jest resolver rather than a static import on purpose: the activities
      // module snapshots DATABASE_URL into a module-level const at load time, and that env var only
      // becomes correct once startIntegrationInfra has started the container.
      const activities = jest.requireActual(
        '../../src/modules/tenant/workflows/enterprise-provisioning.activities',
      ) as { notifyAwaitingApprovalActivity: (p: { tenantId: string }) => Promise<void> };
      await activities.notifyAwaitingApprovalActivity({ tenantId });

      const rows = await notificationsFor(PLATFORM_HUMAN_GATE_EVENT_TYPE, adminId);
      // Both channels §19.8 marks Yes. The raw-SQL version wrote one IN_APP row, so the email half
      // of the spec had no implementation at all.
      expect(rows.map((r) => r.channel).sort()).toEqual(['EMAIL', 'IN_APP']);
      // Rendered from the template, not from a literal beside an INSERT.
      expect(rows[0].body).toContain('Phase 20 Tenant');
      expect(rows[0].body).not.toContain('{{');
    });
  });
});
