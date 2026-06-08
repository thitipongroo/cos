// Pact Contract Test — Finance (consumer) ← Procurement (provider)
// Source: spec §Phase 18 — "Pact consumer test examples for Finance ← Procurement"
// Consumer: Finance module (invoice_received event)
// Provider: Procurement module
//
// Run consumer test: jest tests/contract/finance-procurement.pact.spec.ts
// Run provider verification: PACT_PROVIDER_URL=http://... jest tests/contract/provider-verify.spec.ts

import { PactV3, MatchersV3 } from '@pact-foundation/pact';
import path from 'path';

const { like, uuid, iso8601DateTimeWithMillis } = MatchersV3;

const provider = new PactV3({
  consumer: 'finance-module',
  provider: 'procurement-module',
  dir: path.resolve(__dirname, '../../pacts'),
  logLevel: 'warn',
});

describe('Finance ← Procurement — Invoice Received Event', () => {
  describe('Kafka event: invoice.received', () => {
    it('finance can process an invoice_received event from procurement', async () => {
      await provider.addInteraction({
        states: [{ description: 'a purchase order exists and has been invoiced' }],
        uponReceiving: 'an invoice_received event',
        withRequest: {
          method: 'POST',
          path: '/api/v1/finance/invoices/receive',
          headers: { 'Content-Type': 'application/json' },
          body: {
            event_type: 'invoice.received',
            event_id: uuid(),
            occurred_at: iso8601DateTimeWithMillis(),
            tenant_id: uuid(),
            payload: {
              invoice_id: uuid(),
              po_id: uuid(),
              vendor_id: uuid(),
              project_id: uuid(),
              amount: like(50000),
              currency: like('THB'),
              due_date: like('2026-07-01'),
              line_items: like([
                {
                  description: like('Construction Materials'),
                  quantity: like(10),
                  unit_price: like(5000),
                  total: like(50000),
                },
              ]),
            },
          },
        },
        willRespondWith: {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
          body: {
            id: uuid(),
            status: like('PENDING'),
          },
        },
      });

      return provider.executeTest(async (mockServer) => {
        const response = await fetch(`${mockServer.url}/api/v1/finance/invoices/receive`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event_type: 'invoice.received',
            event_id: '11111111-1111-1111-1111-111111111111',
            occurred_at: new Date().toISOString(),
            tenant_id: '22222222-2222-2222-2222-222222222222',
            payload: {
              invoice_id: '33333333-3333-3333-3333-333333333333',
              po_id: '44444444-4444-4444-4444-444444444444',
              vendor_id: '55555555-5555-5555-5555-555555555555',
              project_id: '66666666-6666-6666-6666-666666666666',
              amount: 50000,
              currency: 'THB',
              due_date: '2026-07-01',
              line_items: [
                { description: 'Concrete', quantity: 10, unit_price: 5000, total: 50000 },
              ],
            },
          }),
        });

        expect(response.status).toBe(201);
        const body = await response.json();
        expect(body.status).toBe('PENDING');
      });
    });
  });
});
