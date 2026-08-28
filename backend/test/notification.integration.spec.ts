// Integration tests: Notification Service — Phase 20
// HTTP contract + validation + end-to-end event → notification delivery.
// Kafka consumer is NOT used here; handleEvent() is called directly on the service
// to avoid requiring a live Kafka broker in CI.

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { JwtAuthGuard } from '../src/shared/guards/jwt-auth.guard';
import {
  startIntegrationInfra,
  stopIntegrationInfra,
  clsAuthGuard,
  type IntegrationInfra,
} from './helpers/integration-infra';
import { AppModule } from '../src/app.module';
import { buildNotificationPreferenceDto, buildRegisterDeviceDto } from '@cos/test-utils';
import { NotificationService } from '../src/modules/notification/notification.service';

const USER_TOKEN = 'Bearer test-user-token';
const TENANT_ID = 'ee000002-0001-4000-8000-000000000001';
const USER_ID = '11111111-1111-1111-1111-111111111111';
const NOTIF_ID = '22222222-2222-2222-2222-222222222222';
// A recipient of its OWN, used only by the end-to-end case below. USER_ID cannot serve: the
// preferences tests earlier in this file PATCH its channel preferences off, and a notification is
// then correctly suppressed — which would read here as "the delivery path is broken".
const RECIPIENT_ID = '33333333-3333-3333-3333-333333333333';

describe('Notification Integration (Phase 20)', () => {
  let infra: IntegrationInfra;
  let app: INestApplication;

  beforeAll(async () => {
    infra = await startIntegrationInfra();
    await infra.prisma.$executeRaw`
      INSERT INTO platform.tenants (tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type, is_active)
      VALUES (${TENANT_ID}::uuid, 'notif-int', 'Notification Integration Tenant', 'notif-realm', 'STARTER'::platform."PlanType", true)
    `;
    await infra.prisma.$executeRaw`
      INSERT INTO platform.users (user_id, tenant_id, keycloak_user_id, email, display_name)
      VALUES (${USER_ID}::uuid, ${TENANT_ID}::uuid, 'kc-notif', 'eng@notif-int.test', 'Engineer User')
    `;
    // site.inspection.failed.v1 routes to SITE_ENGINEER / PROJECT_MANAGER, and findUsersByRole reads
    // platform.tenant_memberships. Without this row the routing resolves to nobody and the
    // end-to-end test below has nothing to deliver.
    await infra.prisma.$executeRaw`
      INSERT INTO platform.users (user_id, tenant_id, keycloak_user_id, email, display_name)
      VALUES (${RECIPIENT_ID}::uuid, ${TENANT_ID}::uuid, 'kc-notif-recipient', 'recipient@notif-int.test', 'Recipient')
    `;
    // site.inspection.failed.v1 routes to SITE_ENGINEER / PROJECT_MANAGER, and findUsersByRole reads
    // platform.tenant_memberships. Without this row the routing resolves to nobody and the
    // end-to-end case has nothing to deliver.
    await infra.prisma.$executeRaw`
      INSERT INTO platform.tenant_memberships (tenant_id, user_id, role)
      VALUES (${TENANT_ID}::uuid, ${RECIPIENT_ID}::uuid, 'SITE_ENGINEER')
    `;

    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(
        clsAuthGuard(() => ({
          tenant_id: TENANT_ID,
          user_id: USER_ID,
          role: 'SITE_ENGINEER',
          tenantCode: 'notif-int',
        })),
      )
      .compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await stopIntegrationInfra(infra);
  });

  // ── GET /notifications ─────────────────────────────────────────────────────

  describe('GET /api/v1/notifications', () => {
    it('returns paginated list', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', USER_TOKEN);
      expect(res.status).toBe(200);
    });

    it('accepts page and limit query params', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications?page=2&limit=10')
        .set('Authorization', USER_TOKEN);
      expect(res.status).toBe(200);
    });
  });

  // ── PATCH /notifications/read-all ─────────────────────────────────────────

  describe('PATCH /api/v1/notifications/read-all', () => {
    it('returns updated count', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/notifications/read-all')
        .set('Authorization', USER_TOKEN);
      expect(res.status).toBe(200);
    });
  });

  // ── PATCH /notifications/:id/read ─────────────────────────────────────────

  describe('PATCH /api/v1/notifications/:id/read', () => {
    it('marks a single notification read', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/notifications/${NOTIF_ID}/read`)
        .set('Authorization', USER_TOKEN);
      expect(res.status).toBe(204);
    });
  });

  // ── GET /notifications/preferences ────────────────────────────────────────

  describe('GET /api/v1/notifications/preferences', () => {
    it('returns preference list', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications/preferences')
        .set('Authorization', USER_TOKEN);
      expect(res.status).toBe(200);
    });
  });

  // ── PATCH /notifications/preferences ──────────────────────────────────────

  describe('PATCH /api/v1/notifications/preferences', () => {
    it('returns 200 with valid preferences payload', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/notifications/preferences')
        .set('Authorization', USER_TOKEN)
        .send({ preferences: [buildNotificationPreferenceDto({ is_enabled: false })] });
      expect(res.status).toBe(200);
    });

    it('returns 400 when preferences array is missing', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/notifications/preferences')
        .set('Authorization', USER_TOKEN)
        .send({});
      expect(res.status).toBe(400);
    });

    it('returns 400 when channel value is invalid', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/notifications/preferences')
        .set('Authorization', USER_TOKEN)
        .send({
          preferences: [
            { event_type: 'site.inspection.failed.v1', channel: 'TELEGRAM', is_enabled: true },
          ],
        });
      expect(res.status).toBe(400);
    });
  });

  // ── POST /notifications/device-token ──────────────────────────────────────

  describe('POST /api/v1/notifications/device-token', () => {
    it('returns 200 with valid push token payload', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/notifications/device-token')
        .set('Authorization', USER_TOKEN)
        .send(buildRegisterDeviceDto());
      expect([200, 201]).toContain(res.status);
    });

    it('returns 400 when push_token is missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/notifications/device-token')
        .set('Authorization', USER_TOKEN)
        .send({ platform: 'ANDROID' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when platform value is invalid', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/notifications/device-token')
        .set('Authorization', USER_TOKEN)
        .send({
          push_token: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
          platform: 'WINDOWS',
        });
      expect(res.status).toBe(400);
    });
  });

  // ── End-to-end: event → notification delivery ─────────────────────────────
  //
  // Nothing is mocked. The previous version stubbed every repository method the path touches —
  // findUsersByRole, findTemplate, createNotification AND findByRecipient — then asserted the
  // endpoint returned the row findByRecipient had been told to return. That is a test of the mock:
  // it passes with the database switched off, with the routing table empty, and with the templates
  // migration never applied. This suite already starts a real PostgreSQL, so the whole path runs.

  describe('end-to-end event → notification delivery', () => {
    it('routes site.inspection.failed.v1 to the SITE_ENGINEER and the row reaches the inbox', async () => {
      const svc = app.get(NotificationService);
      await svc.handleEvent({
        event_type: 'site.inspection.failed.v1',
        tenant_id: TENANT_ID,
        actor_id: USER_ID,
        payload: { project_id: 'proj-alpha' },
      });

      // The row is in the DATABASE — read directly, so a failure separates "nothing was written"
      // from "the read path is wrong".
      const rows = await infra.prisma.$queryRaw<Array<{ event_type: string; body: string }>>`
        SELECT event_type, body FROM notifications.notifications
        WHERE tenant_id = ${TENANT_ID}::uuid AND recipient_id = ${RECIPIENT_ID}::uuid
      `;
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.event_type === 'site.inspection.failed.v1')).toBe(true);
      // Rendered from the templates table, not from a literal beside an INSERT: an unrendered
      // handlebars placeholder would reach the user as "{{project_id}}".
      expect(rows[0].body).not.toContain('{{');
    });

    it('an unrouted event type reaches nobody', async () => {
      // CONTROL for the case above: the delivery must come from the routing table, not from any
      // event that happens to arrive. An unknown type logs and returns.
      const before = await infra.prisma.$queryRaw<Array<{ n: bigint }>>`
        SELECT count(*)::bigint AS n FROM notifications.notifications
        WHERE tenant_id = ${TENANT_ID}::uuid
      `;
      const svc = app.get(NotificationService);
      await svc.handleEvent({
        event_type: 'nothing.routes.this.v1',
        tenant_id: TENANT_ID,
        actor_id: USER_ID,
        payload: {},
      });
      const after = await infra.prisma.$queryRaw<Array<{ n: bigint }>>`
        SELECT count(*)::bigint AS n FROM notifications.notifications
        WHERE tenant_id = ${TENANT_ID}::uuid
      `;
      expect(Number(after[0].n)).toBe(Number(before[0].n));
    });
  });
});
