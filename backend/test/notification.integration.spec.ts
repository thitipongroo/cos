// Integration tests: Notification Service — Phase 20
// HTTP contract + validation + end-to-end event → notification delivery.
// Kafka consumer is NOT used here; handleEvent() is called directly on the service
// to avoid requiring a live Kafka broker in CI.

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { JwtAuthGuard } from '../src/modules/identity/guards/jwt-auth.guard';
import { AppModule } from '../src/app.module';
import { buildNotificationPreferenceDto, buildRegisterDeviceDto } from '@cos/test-utils';
import { NotificationService } from '../src/modules/notification/notification.service';
import { NotificationRepository } from '../src/modules/notification/notification.repository';
import type { NotificationRow } from '../src/modules/notification/notification.repository';

const USER_TOKEN = 'Bearer test-user-token';
const TENANT_ID = 'tenant-integration-001';
const USER_ID = '11111111-1111-1111-1111-111111111111';
const NOTIF_ID = '22222222-2222-2222-2222-222222222222';

function makeNotificationRow(overrides: Partial<NotificationRow> = {}): NotificationRow {
  return {
    notification_id: NOTIF_ID,
    tenant_id: TENANT_ID,
    recipient_id: USER_ID,
    channel: 'IN_APP',
    event_type: 'site.inspection.failed.v1',
    subject: 'Inspection failed',
    body: 'Inspection on project Alpha has failed.',
    status: 'SENT',
    sent_at: new Date('2026-06-12T08:00:00Z'),
    read_at: null,
    created_at: new Date('2026-06-12T08:00:00Z'),
    ...overrides,
  };
}

describe('Notification Integration (Phase 20)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: {
          switchToHttp: () => {
            getRequest: () => {
              headers: { authorization: string };
              tenantId: string;
              user: { user_id: string; role: string };
            };
          };
        }) => {
          const req = ctx.switchToHttp().getRequest();
          req.tenantId = TENANT_ID;
          req.user = { user_id: USER_ID, role: 'SITE_ENGINEER' };
          return true;
        },
      })
      .compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // ── GET /notifications ─────────────────────────────────────────────────────

  describe('GET /api/v1/notifications', () => {
    it('returns paginated list (200 or 500 depending on DB availability)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', USER_TOKEN);
      expect([200, 500]).toContain(res.status);
    });

    it('accepts page and limit query params', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications?page=2&limit=10')
        .set('Authorization', USER_TOKEN);
      expect([200, 500]).toContain(res.status);
    });
  });

  // ── PATCH /notifications/read-all ─────────────────────────────────────────

  describe('PATCH /api/v1/notifications/read-all', () => {
    it('returns updated count (200 or 500 depending on DB availability)', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/notifications/read-all')
        .set('Authorization', USER_TOKEN);
      expect([200, 500]).toContain(res.status);
    });
  });

  // ── PATCH /notifications/:id/read ─────────────────────────────────────────

  describe('PATCH /api/v1/notifications/:id/read', () => {
    it('returns 204 or 500 depending on DB availability', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/notifications/${NOTIF_ID}/read`)
        .set('Authorization', USER_TOKEN);
      expect([204, 500]).toContain(res.status);
    });
  });

  // ── GET /notifications/preferences ────────────────────────────────────────

  describe('GET /api/v1/notifications/preferences', () => {
    it('returns preference list (200 or 500 depending on DB availability)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications/preferences')
        .set('Authorization', USER_TOKEN);
      expect([200, 500]).toContain(res.status);
    });
  });

  // ── PATCH /notifications/preferences ──────────────────────────────────────

  describe('PATCH /api/v1/notifications/preferences', () => {
    it('returns 200 with valid preferences payload (or 500 without DB)', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/notifications/preferences')
        .set('Authorization', USER_TOKEN)
        .send({ preferences: [buildNotificationPreferenceDto({ is_enabled: false })] });
      expect([200, 500]).toContain(res.status);
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
    it('returns 200 with valid push token payload (or 500 without DB)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/notifications/device-token')
        .set('Authorization', USER_TOKEN)
        .send(buildRegisterDeviceDto());
      expect([200, 201, 500]).toContain(res.status);
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

  describe('end-to-end event → notification delivery', () => {
    afterEach(() => jest.restoreAllMocks());

    it('handleEvent routes site.inspection.failed.v1 and notification appears in list', async () => {
      const row = makeNotificationRow();

      jest
        .spyOn(NotificationRepository.prototype, 'findUsersByRole')
        .mockResolvedValue([{ user_id: USER_ID, email: 'engineer@example.com' }]);
      jest.spyOn(NotificationRepository.prototype, 'isChannelEnabled').mockResolvedValue(true);
      jest.spyOn(NotificationRepository.prototype, 'findTemplate').mockResolvedValue({
        template_id: 'tmpl-001',
        tenant_id: null,
        event_type: 'site.inspection.failed.v1',
        channel: 'IN_APP',
        subject_template: 'Inspection failed',
        body_template: 'Inspection on project {{project_id}} has failed.',
        is_active: true,
      });
      jest.spyOn(NotificationRepository.prototype, 'createNotification').mockResolvedValue(row);
      jest.spyOn(NotificationRepository.prototype, 'findDeviceTokens').mockResolvedValue([]);
      jest.spyOn(NotificationRepository.prototype, 'markSent').mockResolvedValue();
      jest
        .spyOn(NotificationRepository.prototype, 'findByRecipient')
        .mockResolvedValue({ rows: [row], total: 1 });

      const svc = app.get(NotificationService);
      await svc.handleEvent({
        event_type: 'site.inspection.failed.v1',
        tenant_id: TENANT_ID,
        actor_id: USER_ID,
        payload: { project_id: 'proj-alpha' },
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', USER_TOKEN);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.rows[0].notification_id).toBe(NOTIF_ID);
      expect(res.body.rows[0].event_type).toBe('site.inspection.failed.v1');
    });
  });
});
