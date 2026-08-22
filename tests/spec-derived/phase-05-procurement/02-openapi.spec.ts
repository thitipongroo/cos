/**
 * Phase 5 Generate item 10 — master:2471-2517
 *
 * ADR-022: the canonical prefix is `/api/v1/procurement/*` for the ENTIRE module, vendors
 * included, and there are NO project-scoped procurement list routes — per-project views use the
 * tenant-wide lists with `?project_id=` (master:2474-2477). Both halves are asserted: the routes
 * that must exist, and the namespace that must NOT have come back.
 */
import * as fs from 'fs';
import * as path from 'path';
import { readYaml, repoRoot } from '../helpers';

interface OpenApiDoc {
  openapi?: string;
  servers?: Array<{ url?: string }>;
  paths?: Record<string, Record<string, unknown>>;
}

const docs = fs
  .readdirSync(path.join(repoRoot, 'docs/api'))
  .filter((f) => f.endsWith('.openapi.yaml'))
  .map((f) => readYaml<OpenApiDoc>(`docs/api/${f}`));

const operations = new Set<string>();
const allPaths = new Set<string>();
for (const doc of docs) {
  const m = (doc.servers?.[0]?.url ?? '').match(/(\/api\/v\d+)/);
  const prefix = m ? m[1] : '';
  for (const [p, ops] of Object.entries(doc.paths ?? {})) {
    const full = (p.startsWith('/api/') ? p : `${prefix}${p}`).replace(/\{[^}]+\}/g, '{}');
    allPaths.add(full);
    for (const method of Object.keys(ops)) operations.add(`${method.toLowerCase()} ${full}`);
  }
}
const has = (m: string, p: string): boolean =>
  operations.has(`${m} ${p.replace(/\{[^}]+\}/g, '{}')}`);

describe('Phase 5 · vendor endpoints under the procurement prefix (master:2478-2483)', () => {
  const OPS: ReadonlyArray<[string, string]> = [
    ['post', '/api/v1/procurement/vendors'],
    ['get', '/api/v1/procurement/vendors'],
    ['get', '/api/v1/procurement/vendors/{vendorId}'],
    ['get', '/api/v1/procurement/vendors/{vendorId}/quotations'],
    ['delete', '/api/v1/procurement/vendors/{vendorId}'],
  ];
  it.each(OPS)('%s %s', (m, p) => expect(has(m, p)).toBe(true));
});

describe('Phase 5 · purchase requests + RFQs (master:2484-2493)', () => {
  const OPS: ReadonlyArray<[string, string]> = [
    ['post', '/api/v1/procurement/purchase-requests'],
    ['get', '/api/v1/procurement/purchase-requests'],
    ['post', '/api/v1/procurement/rfqs'],
    ['get', '/api/v1/procurement/rfqs'],
    ['post', '/api/v1/procurement/rfqs/{rfqId}/publish'],
    ['post', '/api/v1/procurement/rfqs/{rfqId}/close'],
    ['post', '/api/v1/procurement/rfqs/{rfqId}/cancel'],
    ['post', '/api/v1/procurement/rfqs/{rfqId}/award'],
    ['get', '/api/v1/procurement/rfqs/{rfqId}/quotations'],
    ['post', '/api/v1/procurement/rfqs/{rfqId}/quotations'],
    ['post', '/api/v1/procurement/rfqs/{rfqId}/invitations'],
  ];
  it.each(OPS)('%s %s', (m, p) => expect(has(m, p)).toBe(true));
});

describe('Phase 5 · purchase orders, deliveries, vendor invoices (master:2494-2506)', () => {
  const OPS: ReadonlyArray<[string, string]> = [
    ['post', '/api/v1/procurement/purchase-orders'],
    ['get', '/api/v1/procurement/purchase-orders'],
    ['get', '/api/v1/procurement/purchase-orders/{poId}'],
    ['get', '/api/v1/procurement/purchase-orders/{poId}/deliveries'],
    ['post', '/api/v1/procurement/purchase-orders/{poId}/submit'],
    ['post', '/api/v1/procurement/purchase-orders/{poId}/approve'],
    ['post', '/api/v1/procurement/purchase-orders/{poId}/reject'],
    ['post', '/api/v1/procurement/purchase-orders/{poId}/acknowledge'],
    ['post', '/api/v1/procurement/purchase-orders/{poId}/mark-paid'],
    ['post', '/api/v1/procurement/purchase-orders/{poId}/dispute'],
    ['post', '/api/v1/procurement/deliveries'],
    ['get', '/api/v1/procurement/deliveries'],
    ['post', '/api/v1/procurement/vendor-invoices'],
    ['get', '/api/v1/procurement/vendor-invoices'],
    ['post', '/api/v1/procurement/vendor-invoices/{invoiceId}/approve'],
  ];
  it.each(OPS)('%s %s', (m, p) => expect(has(m, p)).toBe(true));
});

describe('Phase 5 · Vendor Portal, ADR-030 (master:2507-2513)', () => {
  const OPS: ReadonlyArray<[string, string]> = [
    ['get', '/api/v1/vendor/rfq/{token}'],
    ['post', '/api/v1/vendor/rfq/{token}/quotation'],
    ['get', '/api/v1/vendor/purchase-orders'],
    ['get', '/api/v1/vendor/invoices'],
    ['post', '/api/v1/vendor/invoices'],
  ];
  it.each(OPS)('%s %s', (m, p) => expect(has(m, p)).toBe(true));
});

describe('Phase 5 · ADR-022 namespace rules (master:2474-2477)', () => {
  it('the pre-ADR-022 /api/v1/vendors namespace is gone', () => {
    const stray = [...allPaths].filter((p) => /^\/api\/v1\/vendors(\/|$)/.test(p));
    expect(stray).toEqual([]);
  });

  it('no project-scoped procurement list route exists', () => {
    const stray = [...allPaths].filter((p) =>
      /^\/api\/v1\/projects\/\{\}\/(vendors|purchase-requests|rfqs|purchase-orders|deliveries|vendor-invoices)/.test(
        p,
      ),
    );
    expect(stray).toEqual([]);
  });
});
