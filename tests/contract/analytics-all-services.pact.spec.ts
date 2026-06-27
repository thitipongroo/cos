// Pact Contract Test — Analytics (consumer) ← All services (providers)
// Source: spec §Phase 18 — Pact contract tests; analytics consumer ← all service providers
// Consumer: analytics-worker (ClickHouse ingestion)
// Providers: backend domain events (project, procurement, site-ops, finance)
//
// Run consumer: jest tests/contract/analytics-all-services.pact.spec.ts
// Run provider verification: PACT_PROVIDER_URL=http://... jest tests/contract/provider-verify.spec.ts

// Import the consumer-only v3 entry (not the package root, which loads the provider
// verifier → an ESM-only https-proxy-agent that jest cannot transform).
import { PactV3, MatchersV3 } from '@pact-foundation/pact/src/v3';

const { like, uuid, datetime } = MatchersV3;
// pact v3 replaced the v2 `iso8601DateTimeWithMillis()` matcher with `datetime(format, example)`.
const iso8601DateTimeWithMillis = () =>
  datetime("yyyy-MM-dd'T'HH:mm:ss.SSSX", '2026-06-26T00:00:00.000Z');

const PACT_DIR = `${__dirname}/../../pacts`;

function makeProvider(providerName: string): PactV3 {
  return new PactV3({
    consumer: 'analytics-worker',
    provider: providerName,
    dir: PACT_DIR,
    logLevel: 'warn',
  });
}

describe('Analytics ← Project Module', () => {
  const provider = makeProvider('project-module');

  it('analytics can ingest project.created event', async () => {
    await provider.addInteraction({
      states: [{ description: 'a new project has been created' }],
      uponReceiving: 'a project.created event for analytics ingestion',
      withRequest: {
        method: 'POST',
        path: '/api/v1/analytics/ingest/project',
        headers: { 'Content-Type': 'application/json' },
        body: {
          event_type: like('project.created'),
          event_id: uuid(),
          occurred_at: iso8601DateTimeWithMillis(),
          tenant_id: uuid(),
          payload: {
            project_id: uuid(),
            name: like('Test Project'),
            status: like('DRAFT'),
            contract_value: like(1000000),
            currency: like('THB'),
            start_date: like('2026-01-01'),
            end_date: like('2026-12-31'),
          },
        },
      },
      willRespondWith: {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
        body: { ingested: like(true) },
      },
    });

    return provider.executeTest(async (mockServer) => {
      const res = await fetch(`${mockServer.url}/api/v1/analytics/ingest/project`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: 'project.created',
          event_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          occurred_at: new Date().toISOString(),
          tenant_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
          payload: {
            project_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
            name: 'E2E Project Alpha',
            status: 'DRAFT',
            contract_value: 1000000,
            currency: 'THB',
            start_date: '2026-01-01',
            end_date: '2026-12-31',
          },
        }),
      });
      expect(res.status).toBe(202);
    });
  });
});

describe('Analytics ← Procurement Module', () => {
  const provider = makeProvider('procurement-module');

  it('analytics can ingest purchase_order.created event', async () => {
    await provider.addInteraction({
      states: [{ description: 'a purchase order has been created' }],
      uponReceiving: 'a purchase_order.created event for analytics ingestion',
      withRequest: {
        method: 'POST',
        path: '/api/v1/analytics/ingest/procurement',
        headers: { 'Content-Type': 'application/json' },
        body: {
          event_type: like('purchase_order.created'),
          event_id: uuid(),
          occurred_at: iso8601DateTimeWithMillis(),
          tenant_id: uuid(),
          payload: {
            po_id: uuid(),
            project_id: uuid(),
            vendor_id: uuid(),
            total_amount: like(50000),
            currency: like('THB'),
            status: like('APPROVED'),
          },
        },
      },
      willRespondWith: {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
        body: { ingested: like(true) },
      },
    });

    return provider.executeTest(async (mockServer) => {
      const res = await fetch(`${mockServer.url}/api/v1/analytics/ingest/procurement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: 'purchase_order.created',
          event_id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
          occurred_at: new Date().toISOString(),
          tenant_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
          payload: {
            po_id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
            project_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
            vendor_id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
            total_amount: 50000,
            currency: 'THB',
            status: 'APPROVED',
          },
        }),
      });
      expect(res.status).toBe(202);
    });
  });
});

describe('Analytics ← Site-Ops Module', () => {
  const provider = makeProvider('site-ops-module');

  it('analytics can ingest site_report.submitted event', async () => {
    await provider.addInteraction({
      states: [{ description: 'a daily site report has been submitted' }],
      uponReceiving: 'a site_report.submitted event for analytics ingestion',
      withRequest: {
        method: 'POST',
        path: '/api/v1/analytics/ingest/site-ops',
        headers: { 'Content-Type': 'application/json' },
        body: {
          event_type: like('site_report.submitted'),
          event_id: uuid(),
          occurred_at: iso8601DateTimeWithMillis(),
          tenant_id: uuid(),
          payload: {
            report_id: uuid(),
            project_id: uuid(),
            reported_by: uuid(),
            report_date: like('2026-06-15'),
            manpower_count: like(12),
            has_blockers: like(true),
          },
        },
      },
      willRespondWith: {
        status: 202,
        body: { ingested: like(true) },
      },
    });

    return provider.executeTest(async (mockServer) => {
      const res = await fetch(`${mockServer.url}/api/v1/analytics/ingest/site-ops`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: 'site_report.submitted',
          event_id: '11111111-2222-3333-4444-555555555555',
          occurred_at: new Date().toISOString(),
          tenant_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
          payload: {
            report_id: '66666666-7777-8888-9999-000000000000',
            project_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
            reported_by: 'dddddddd-0000-0000-0000-dddddddddddd',
            report_date: '2026-06-15',
            manpower_count: 12,
            has_blockers: true,
          },
        }),
      });
      expect(res.status).toBe(202);
    });
  });
});

describe('Analytics ← Finance Module', () => {
  const provider = makeProvider('finance-module');

  it('analytics can ingest budget.exceeded event', async () => {
    await provider.addInteraction({
      states: [{ description: 'a project has exceeded its budget' }],
      uponReceiving: 'a budget.exceeded event for analytics ingestion',
      withRequest: {
        method: 'POST',
        path: '/api/v1/analytics/ingest/finance',
        headers: { 'Content-Type': 'application/json' },
        body: {
          event_type: like('budget.exceeded'),
          event_id: uuid(),
          occurred_at: iso8601DateTimeWithMillis(),
          tenant_id: uuid(),
          payload: {
            project_id: uuid(),
            budget_amount: like(1000000),
            actual_cost: like(1050000),
            variance: like(50000),
            currency: like('THB'),
          },
        },
      },
      willRespondWith: {
        status: 202,
        body: { ingested: like(true) },
      },
    });

    return provider.executeTest(async (mockServer) => {
      const res = await fetch(`${mockServer.url}/api/v1/analytics/ingest/finance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: 'budget.exceeded',
          event_id: 'aaaabbbb-cccc-dddd-eeee-ffffaaaabbbb',
          occurred_at: new Date().toISOString(),
          tenant_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
          payload: {
            project_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
            budget_amount: 1000000,
            actual_cost: 1050000,
            variance: 50000,
            currency: 'THB',
          },
        }),
      });
      expect(res.status).toBe(202);
    });
  });
});
