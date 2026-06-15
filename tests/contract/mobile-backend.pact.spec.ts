// Pact Contract Test — Mobile (consumer) ← Backend services (providers)
// Source: spec §Phase 18 — Pact contract tests; mobile consumer ← all service providers
// Consumer: React Native mobile app (sync engine + API calls)
// Providers: NestJS backend (projects, site-ops, sync endpoint)
//
// The mobile app uses the backend REST API for: listing projects, syncing offline records,
// resolving sync conflicts. This contract test verifies API response shapes the mobile client
// depends on — ensuring backend changes don't break mobile without notice.
//
// Run consumer: jest tests/contract/mobile-backend.pact.spec.ts
// Run provider verification: PACT_PROVIDER_URL=http://... jest tests/contract/provider-verify.spec.ts

import { PactV3, MatchersV3 } from '@pact-foundation/pact';

const { like, uuid, iso8601DateTimeWithMillis, eachLike } = MatchersV3;

const PACT_DIR = `${__dirname}/../../pacts`;

function makeProvider(providerName: string): PactV3 {
  return new PactV3({
    consumer: 'mobile-app',
    provider: providerName,
    dir: PACT_DIR,
    logLevel: 'warn',
  });
}

describe('Mobile ← Project Module (GET /api/v1/projects)', () => {
  const provider = makeProvider('project-module');

  it('mobile can list projects assigned to the current user', async () => {
    await provider.addInteraction({
      states: [{ description: 'the user has at least one assigned project' }],
      uponReceiving: 'a GET request for user projects from mobile',
      withRequest: {
        method: 'GET',
        path: '/api/v1/projects',
        headers: {
          Authorization: like('Bearer eyJ...'),
          'X-Tenant-ID': uuid(),
        },
      },
      willRespondWith: {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: {
          data: eachLike({
            id: uuid(),
            name: like('Construction Project Alpha'),
            status: like('ACTIVE'),
            start_date: like('2026-01-01'),
            end_date: like('2026-12-31'),
            updated_at: iso8601DateTimeWithMillis(),
          }),
          meta: {
            total: like(1),
            page: like(1),
            limit: like(20),
          },
        },
      },
    });

    return provider.executeTest(async (mockServer) => {
      const res = await fetch(`${mockServer.url}/api/v1/projects`, {
        headers: {
          Authorization: 'Bearer eyJtest',
          'X-Tenant-ID': 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThan(0);
      const project = body.data[0];
      expect(project).toHaveProperty('id');
      expect(project).toHaveProperty('name');
      expect(project).toHaveProperty('status');
    });
  });
});

describe('Mobile ← Site-Ops Module (POST /api/v1/sync/resolve)', () => {
  const provider = makeProvider('site-ops-module');

  it('mobile sync endpoint accepts offline site_report and returns ACCEPTED', async () => {
    await provider.addInteraction({
      states: [{ description: 'a site report does not yet exist on the server' }],
      uponReceiving: 'a sync resolve request for a new offline site_report',
      withRequest: {
        method: 'POST',
        path: '/api/v1/sync/resolve',
        headers: {
          'Content-Type': 'application/json',
          Authorization: like('Bearer eyJ...'),
          'X-Tenant-ID': uuid(),
        },
        body: {
          entity_type: like('site_report'),
          entity_id: uuid(),
          client_version: like(0),
          payload: {
            report_date: like('2026-06-15'),
            manpower_count: like(10),
            progress_notes: like('Foundation poured'),
          },
          client_submitted_at: iso8601DateTimeWithMillis(),
        },
      },
      willRespondWith: {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: {
          resolved_payload: like({
            report_date: like('2026-06-15'),
            manpower_count: like(10),
          }),
          conflict_status: like('ACCEPTED'),
          server_version: like(1),
        },
      },
    });

    return provider.executeTest(async (mockServer) => {
      const res = await fetch(`${mockServer.url}/api/v1/sync/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer eyJtest',
          'X-Tenant-ID': 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        },
        body: JSON.stringify({
          entity_type: 'site_report',
          entity_id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
          client_version: 0,
          payload: {
            report_date: '2026-06-15',
            manpower_count: 10,
            progress_notes: 'Foundation poured',
          },
          client_submitted_at: new Date().toISOString(),
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.conflict_status).toBe('ACCEPTED');
      expect(body).toHaveProperty('server_version');
    });
  });

  it('mobile sync endpoint returns CONFLICT_REJECTED for safety_checklist conflict', async () => {
    await provider.addInteraction({
      states: [{ description: 'a safety checklist already exists on the server with newer data' }],
      uponReceiving: 'a sync resolve request for a conflicting safety_checklist',
      withRequest: {
        method: 'POST',
        path: '/api/v1/sync/resolve',
        headers: {
          'Content-Type': 'application/json',
          Authorization: like('Bearer eyJ...'),
          'X-Tenant-ID': uuid(),
        },
        body: {
          entity_type: like('safety_checklist'),
          entity_id: uuid(),
          client_version: like(1),
          payload: like({ status: 'PASS' }),
          client_submitted_at: iso8601DateTimeWithMillis(),
        },
      },
      willRespondWith: {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: {
          resolved_payload: like({ status: 'FAIL' }),
          conflict_status: like('CONFLICT_REJECTED'),
          server_version: like(2),
        },
      },
    });

    return provider.executeTest(async (mockServer) => {
      const res = await fetch(`${mockServer.url}/api/v1/sync/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer eyJtest',
          'X-Tenant-ID': 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        },
        body: JSON.stringify({
          entity_type: 'safety_checklist',
          entity_id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
          client_version: 1,
          payload: { status: 'PASS' },
          client_submitted_at: new Date(Date.now() - 60_000).toISOString(),
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.conflict_status).toBe('CONFLICT_REJECTED');
    });
  });
});

describe('Mobile ← Notification Module (GET /api/v1/notifications)', () => {
  const provider = makeProvider('notification-module');

  it('mobile can poll notifications for current user', async () => {
    await provider.addInteraction({
      states: [{ description: 'the user has at least one unread notification' }],
      uponReceiving: 'a GET request for notifications from mobile',
      withRequest: {
        method: 'GET',
        path: '/api/v1/notifications',
        headers: {
          Authorization: like('Bearer eyJ...'),
          'X-Tenant-ID': uuid(),
        },
      },
      willRespondWith: {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: {
          data: eachLike({
            id: uuid(),
            type: like('SITE_REPORT_SUBMITTED'),
            title: like('New site report submitted'),
            body: like('Site Engineer submitted daily report'),
            read: like(false),
            created_at: iso8601DateTimeWithMillis(),
          }),
          unread_count: like(1),
        },
      },
    });

    return provider.executeTest(async (mockServer) => {
      const res = await fetch(`${mockServer.url}/api/v1/notifications`, {
        headers: {
          Authorization: 'Bearer eyJtest',
          'X-Tenant-ID': 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.data)).toBe(true);
      expect(typeof body.unread_count).toBe('number');
    });
  });
});
