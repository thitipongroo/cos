// Unit tests — Procurement Repository (Phase 5)
// Tests: tenant isolation, query delegation, null-return handling.

import { Test, TestingModule } from '@nestjs/testing';
import { REQUEST } from '@nestjs/core';
import { ProcurementRepository } from '../procurement.repository';
import { TenantPrismaService } from '../../tenant/prisma/tenant-prisma.service';

const mockPrisma = {
  $queryRaw: jest.fn(),
  $executeRaw: jest.fn(),
};

const mockTenantPrisma = {
  run: jest.fn((fn: (p: typeof mockPrisma) => unknown) => fn(mockPrisma)),
};

const mockRequest = { tenantId: 'tenant-uuid-001' };

// ── Shared row fixtures ─────────────────────────────────────────────────────

const vendorRow = {
  vendor_id: 'vendor-uuid-001',
  tenant_id: 'tenant-uuid-001',
  vendor_code: 'V001',
  vendor_name: 'Test Vendor',
  tax_id: null,
  contact_email: null,
  contact_phone: null,
  address: null,
  is_active: true,
  category: null,
  verification_status: null,
  created_at: new Date(),
  updated_at: new Date(),
};

const prRow = {
  pr_id: 'pr-uuid-001',
  project_id: 'proj-uuid-001',
  tenant_id: 'tenant-uuid-001',
  pr_number: 'PR-001',
  status: 'DRAFT' as const,
  requested_by: 'user-uuid-001',
  required_date: null,
  created_at: new Date(),
  updated_at: new Date(),
};

const rfqRow = {
  rfq_id: 'rfq-uuid-001',
  pr_id: null,
  project_id: 'proj-uuid-001',
  tenant_id: 'tenant-uuid-001',
  rfq_number: 'RFQ-001',
  status: 'DRAFT' as const,
  deadline: new Date(),
  temporal_workflow_id: null,
  created_by: 'user-uuid-001',
  created_at: new Date(),
  updated_at: new Date(),
};

const quotRow = {
  quotation_id: 'quot-uuid-001',
  rfq_id: 'rfq-uuid-001',
  vendor_id: 'vendor-uuid-001',
  tenant_id: 'tenant-uuid-001',
  total_amount: '120000.0000',
  currency_code: 'THB',
  validity_days: 30,
  submitted_at: new Date(),
  is_selected: false,
};

const poRow = {
  po_id: 'po-uuid-001',
  rfq_id: null,
  vendor_id: 'vendor-uuid-001',
  project_id: 'proj-uuid-001',
  tenant_id: 'tenant-uuid-001',
  po_number: 'PO-001',
  status: 'DRAFT' as const,
  total_amount: '60000.0000',
  currency_code: 'THB',
  delivery_date: new Date(),
  temporal_workflow_id: null,
  created_by: 'user-uuid-001',
  created_at: new Date(),
  updated_at: new Date(),
};

const lineRow = {
  line_id: 'line-uuid-001',
  po_id: 'po-uuid-001',
  tenant_id: 'tenant-uuid-001',
  boq_item_id: null,
  description: 'Concrete',
  quantity: '10.0000',
  unit: 'm3',
  unit_price: '6000.0000',
  line_total: '60000.0000',
};

const deliveryRow = {
  delivery_id: 'del-uuid-001',
  po_id: 'po-uuid-001',
  tenant_id: 'tenant-uuid-001',
  delivery_note: null,
  delivered_at: new Date(),
  received_by: 'user-uuid-001',
  notes: null,
};

const invoiceRow = {
  invoice_id: 'inv-uuid-001',
  po_id: 'po-uuid-001',
  vendor_id: 'vendor-uuid-001',
  tenant_id: 'tenant-uuid-001',
  invoice_number: 'INV-001',
  amount: '60000.0000',
  currency_code: 'THB',
  invoice_date: new Date(),
  due_date: new Date(),
  status: 'RECEIVED' as const,
  file_id: null,
  created_at: new Date(),
  updated_at: new Date(),
};

// ── Tests ───────────────────────────────────────────────────────────────────

describe('ProcurementRepository', () => {
  let repo: ProcurementRepository;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProcurementRepository,
        { provide: TenantPrismaService, useValue: mockTenantPrisma },
        { provide: REQUEST, useValue: mockRequest },
      ],
    }).compile();
    repo = await module.resolve<ProcurementRepository>(ProcurementRepository);
  });

  it('constructor uses empty string when tenantId missing', async () => {
    const module = await Test.createTestingModule({
      providers: [
        ProcurementRepository,
        { provide: TenantPrismaService, useValue: mockTenantPrisma },
        { provide: REQUEST, useValue: {} },
      ],
    }).compile();
    const r = await module.resolve<ProcurementRepository>(ProcurementRepository);
    expect(r).toBeDefined();
    expect((r as unknown as { tenantId: string }).tenantId).toBe('');
  });

  // ── Vendors ────────────────────────────────────────────────────────────────

  it('createVendor returns inserted row', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([vendorRow]);
    const result = await repo.createVendor({ vendor_code: 'V001', vendor_name: 'Test Vendor' });
    expect(result.vendor_id).toBe('vendor-uuid-001');
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    // Omitted classification reaches the INSERT as NULL, not as `undefined` — Prisma would send the
    // latter as a missing parameter and the statement would fail on parameter count.
    const params = mockPrisma.$queryRaw.mock.calls[0].slice(1);
    expect(params.slice(-2)).toEqual([null, null]);
  });

  it('createVendor carries category and verification_status when supplied', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([vendorRow]);
    await repo.createVendor({
      vendor_code: 'V002',
      vendor_name: 'Classified Vendor',
      category: 'EQUIPMENT',
      verification_status: 'VERIFIED',
    });
    const params = mockPrisma.$queryRaw.mock.calls[0].slice(1);
    expect(params.slice(-2)).toEqual(['EQUIPMENT', 'VERIFIED']);
  });

  it('findVendorById returns null when not found', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    expect(await repo.findVendorById('missing')).toBeNull();
  });

  it('findVendorById returns row when found', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([vendorRow]);
    expect((await repo.findVendorById('vendor-uuid-001'))?.vendor_id).toBe('vendor-uuid-001');
  });

  it('listVendors active_only=true queries with is_active filter', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([vendorRow]);
    const result = await repo.listVendors(true);
    expect(result).toHaveLength(1);
  });

  it('listVendors active_only=false queries all vendors', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([vendorRow]);
    const result = await repo.listVendors(false);
    expect(result).toHaveLength(1);
  });

  // The two directory branches are asserted against the SQL TEXT, not just the row count, because the
  // predicates ARE the contract: which PO statuses count as live work, and the LATERAL that keeps a
  // vendor with no orders in the list at 0 instead of dropping it. A GROUP BY join would pass a
  // length check and silently lose every vendor the buyer has not ordered from yet.
  const directoryRow = { ...vendorRow, active_project_count: 2 };
  // $queryRaw is called as a TAGGED TEMPLATE, so calls[n][0] is the TemplateStringsArray itself —
  // the literal chunks around each parameter. Joining them back with '?' reconstructs the statement.
  const sqlOf = (call: unknown[]): string => (call[0] as readonly string[]).join('?');

  it('listVendorDirectory (no category) counts open-PO projects via LATERAL', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([directoryRow]);
    const result = await repo.listVendorDirectory(null);
    expect(result[0]?.active_project_count).toBe(2);
    const sql = sqlOf(mockPrisma.$queryRaw.mock.calls[0]);
    expect(sql).toContain('LEFT JOIN LATERAL');
    expect(sql).toContain("NOT IN ('DRAFT', 'PENDING_APPROVAL', 'PAID')");
    expect(sql).toContain('is_active = true');
    expect(sql).not.toContain('v.category =');
  });

  it('listVendorDirectory (category) adds the category predicate', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([directoryRow]);
    const result = await repo.listVendorDirectory('LOGISTICS');
    expect(result).toHaveLength(1);
    const sql = sqlOf(mockPrisma.$queryRaw.mock.calls[0]);
    expect(sql).toContain('v.category =');
    expect(sql).toContain('LEFT JOIN LATERAL');
  });

  it('deactivateVendor calls $executeRaw', async () => {
    mockPrisma.$executeRaw.mockResolvedValue(1);
    await repo.deactivateVendor('vendor-uuid-001');
    expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('findQuotationsByVendor returns the vendor quotation history', async () => {
    const quotationRow = {
      quotation_id: 'q-001',
      rfq_id: 'rfq-001',
      vendor_id: 'vendor-uuid-001',
      tenant_id: 'tenant-uuid-001',
      total_amount: '1000.0000',
      currency_code: 'THB',
      validity_days: 30,
      submitted_at: new Date(),
      is_selected: false,
    };
    mockPrisma.$queryRaw.mockResolvedValue([quotationRow]);
    const result = await repo.findQuotationsByVendor('vendor-uuid-001');
    expect(result).toHaveLength(1);
    expect(result[0]!.vendor_id).toBe('vendor-uuid-001');
  });

  // ── Purchase Requests ──────────────────────────────────────────────────────

  it('createPurchaseRequest returns PR row', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([prRow]);
    const result = await repo.createPurchaseRequest({
      project_id: 'proj-uuid-001',
      pr_number: 'PR-001',
      requested_by: 'user-uuid-001',
    });
    expect(result.pr_id).toBe('pr-uuid-001');
  });

  it('createPurchaseRequest defaults the allocation year to now when the caller omits it', async () => {
    // The service always sends `year`, but the repository is also reachable from the Temporal worker
    // and from seeds. Falling back to the current year keeps PR-<year>-<seq> correct there instead of
    // allocating under `undefined`.
    mockPrisma.$queryRaw.mockResolvedValue([prRow]);
    await repo.createPurchaseRequest({
      project_id: 'proj-uuid-001',
      requested_by: 'user-uuid-001',
      // no pr_number → allocation path runs; no year → the ?? fallback is what supplies it
    });
    expect(mockPrisma.$queryRaw).toHaveBeenCalled();
  });

  it('createPurchaseRequest inserts all pr_line_items in one statement, ordered by sort_order', async () => {
    // The PR and its lines share one transaction — a PR that records no materials is not a request.
    // The lines go in as a single set-based INSERT; WITH ORDINALITY carries the array position into
    // sort_order, which is what preserves the caller's order now that there is no per-item loop.
    mockPrisma.$queryRaw.mockResolvedValue([prRow]);
    mockPrisma.$executeRaw.mockResolvedValue(1);

    await repo.createPurchaseRequest({
      project_id: 'proj-uuid-001',
      pr_number: 'PR-001',
      requested_by: 'user-uuid-001',
      required_date: '2026-08-01',
      items: [
        { description: 'Cement', quantity: 10, unit: 'bag', material_id: 'mat-uuid-001' },
        // No material_id: a site engineer can request something not yet in the material master.
        { description: 'Misc fixings', quantity: 2, unit: 'box' },
      ],
    });

    // pr_number was supplied, so no advisory-lock call — exactly one statement, for the lines.
    expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
    const [strings, ...values] = mockPrisma.$executeRaw.mock.calls[0] as [string[], ...unknown[]];
    expect(strings.join('')).toContain('WITH ORDINALITY');
    // Column arrays keep the caller's order; the null material_id is preserved, not dropped.
    expect(values).toEqual(
      expect.arrayContaining([
        ['mat-uuid-001', null],
        ['Cement', 'Misc fixings'],
        ['10', '2'],
        ['bag', 'box'],
      ]),
    );
  });

  it('createPurchaseRequest inserts no line items when items is omitted', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([prRow]);

    await repo.createPurchaseRequest({
      project_id: 'proj-uuid-001',
      pr_number: 'PR-001',
      requested_by: 'user-uuid-001',
    });

    expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('createPurchaseRequest allocates pr_number in-transaction under a lock when omitted', async () => {
    // Allocating in a separate transaction (the old nextPrNumber() call in the service) let two
    // concurrent creates read the same MAX. The lock + derivation now live in the insert's own
    // transaction.
    mockPrisma.$executeRaw.mockResolvedValue(1);
    mockPrisma.$queryRaw
      .mockResolvedValueOnce([{ max_seq: 41 }]) // sequence derivation
      .mockResolvedValueOnce([prRow]); // the insert

    await repo.createPurchaseRequest({
      project_id: 'proj-uuid-001',
      requested_by: 'user-uuid-001',
      year: 2026,
    });

    const lockSql = mockPrisma.$executeRaw.mock.calls[0]![0] as string[];
    expect(lockSql.join('')).toContain('pg_advisory_xact_lock');
    // Derivation and insert are in the same run() — one transaction.
    expect(mockTenantPrisma.run).toHaveBeenCalledTimes(1);
    const insertParams = mockPrisma.$queryRaw.mock.calls[1]!;
    expect(insertParams).toContain('PR-2026-0042');
  });

  it('nextPrNumber starts the year at 0001 when the tenant has no PR yet', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ max_seq: null }]);
    expect(await repo.nextPrNumber(2026)).toBe('PR-2026-0001');
  });

  it('nextPrNumber increments the tenant’s highest number for that year', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ max_seq: 41 }]);
    expect(await repo.nextPrNumber(2026)).toBe('PR-2026-0042');
  });

  it('nextPrNumber starts at 0001 when the aggregate returns no row at all', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    expect(await repo.nextPrNumber(2026)).toBe('PR-2026-0001');
  });

  it('nextPrNumber keeps padding past four digits rather than truncating', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ max_seq: 9999 }]);
    expect(await repo.nextPrNumber(2026)).toBe('PR-2026-10000');
  });

  it('findPrById returns null when not found', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    expect(await repo.findPrById('missing')).toBeNull();
  });

  it('updatePrStatus calls $executeRaw', async () => {
    mockPrisma.$executeRaw.mockResolvedValue(1);
    await repo.updatePrStatus('pr-uuid-001', 'SUBMITTED');
    expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  // ── RFQs ──────────────────────────────────────────────────────────────────

  it('createRfq returns RFQ row', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([rfqRow]);
    const result = await repo.createRfq({
      project_id: 'proj-uuid-001',
      rfq_number: 'RFQ-001',
      deadline: new Date().toISOString(),
      created_by: 'user-uuid-001',
    });
    expect(result.rfq_id).toBe('rfq-uuid-001');
  });

  it('findRfqById returns null when not found', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    expect(await repo.findRfqById('missing')).toBeNull();
  });

  it('findRfqById returns row when found', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([rfqRow]);
    expect((await repo.findRfqById('rfq-uuid-001'))?.rfq_id).toBe('rfq-uuid-001');
  });

  it('updateRfqStatus calls $executeRaw', async () => {
    mockPrisma.$executeRaw.mockResolvedValue(1);
    await repo.updateRfqStatus('rfq-uuid-001', 'PUBLISHED');
    expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('setRfqWorkflowId calls $executeRaw', async () => {
    mockPrisma.$executeRaw.mockResolvedValue(1);
    await repo.setRfqWorkflowId('rfq-uuid-001', 'wf-id-001');
    expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  // ── Quotations ─────────────────────────────────────────────────────────────

  it('createQuotation returns row', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([quotRow]);
    const result = await repo.createQuotation({
      rfq_id: 'rfq-uuid-001',
      vendor_id: 'vendor-uuid-001',
      total_amount: '120000.0000',
      currency_code: 'THB',
      validity_days: 30,
      submitted_at: new Date().toISOString(),
    });
    expect(result.quotation_id).toBe('quot-uuid-001');
  });

  it('findQuotationsByRfq returns rows', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([quotRow]);
    expect(await repo.findQuotationsByRfq('rfq-uuid-001')).toHaveLength(1);
  });

  it('markQuotationSelected calls $executeRaw twice (deselect + select)', async () => {
    mockPrisma.$executeRaw.mockResolvedValue(1);
    await repo.markQuotationSelected('quot-uuid-001', 'rfq-uuid-001');
    expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(2);
  });

  // ── Purchase Orders ────────────────────────────────────────────────────────

  it('createPurchaseOrder returns PO row', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([poRow]);
    const result = await repo.createPurchaseOrder({
      vendor_id: 'vendor-uuid-001',
      project_id: 'proj-uuid-001',
      po_number: 'PO-001',
      total_amount: '60000.0000',
      currency_code: 'THB',
      delivery_date: '2026-09-01',
      created_by: 'user-uuid-001',
    });
    expect(result.po_id).toBe('po-uuid-001');
  });

  // The PO and its lines must land in ONE transaction. Splitting them (create the PO, then insert
  // lines) can leave a header with no lines committed if the second call fails — a PO whose total
  // no longer matches anything.
  it('createPurchaseOrderWithLineItems inserts header and lines in a single transaction', async () => {
    const lineRow = {
      line_id: 'line-uuid-001',
      po_id: 'po-uuid-001',
      tenant_id: 'tenant-uuid-001',
      boq_item_id: null,
      description: 'Cement 50kg',
      quantity: '10.0000',
      unit: 'bag',
      unit_price: '150.0000',
      line_total: '1500.0000',
    };
    mockPrisma.$queryRaw.mockResolvedValueOnce([poRow]).mockResolvedValueOnce([lineRow]);

    const result = await repo.createPurchaseOrderWithLineItems(
      {
        vendor_id: 'vendor-uuid-001',
        project_id: 'proj-uuid-001',
        po_number: 'PO-001',
        total_amount: '1500.0000',
        currency_code: 'THB',
        delivery_date: '2026-09-01',
        created_by: 'user-uuid-001',
      },
      [
        {
          description: 'Cement 50kg',
          quantity: '10.0000',
          unit: 'bag',
          unit_price: '150.0000',
          line_total: '1500.0000',
        },
      ],
    );

    expect(result.po.po_id).toBe('po-uuid-001');
    expect(result.line_items).toEqual([lineRow]);
    // One db.run() — both statements share the transaction, and therefore the RLS GUC.
    expect(mockTenantPrisma.run).toHaveBeenCalledTimes(1);
  });

  it('createPurchaseOrderWithLineItems skips the line insert when there are no items', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([poRow]);
    const result = await repo.createPurchaseOrderWithLineItems(
      {
        rfq_id: 'rfq-uuid-001',
        vendor_id: 'vendor-uuid-001',
        project_id: 'proj-uuid-001',
        po_number: 'PO-002',
        total_amount: '0.0000',
        currency_code: 'THB',
        delivery_date: '2026-09-01',
        created_by: 'user-uuid-001',
      },
      [],
    );
    expect(result.line_items).toEqual([]);
    // Header only — an empty VALUES list would be a syntax error, not an empty insert.
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('findPoById returns null when not found', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    expect(await repo.findPoById('missing')).toBeNull();
  });

  it('findPoById returns row when found', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([poRow]);
    expect((await repo.findPoById('po-uuid-001'))?.po_id).toBe('po-uuid-001');
  });

  it('updatePoStatus calls $executeRaw', async () => {
    mockPrisma.$executeRaw.mockResolvedValue(1);
    await repo.updatePoStatus('po-uuid-001', 'PENDING_APPROVAL');
    expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('setPoWorkflowId calls $executeRaw', async () => {
    mockPrisma.$executeRaw.mockResolvedValue(1);
    await repo.setPoWorkflowId('po-uuid-001', 'wf-id-002');
    expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('createLineItems returns rows', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([lineRow]);
    const result = await repo.createLineItems('po-uuid-001', [
      {
        description: 'Concrete',
        quantity: '10.0000',
        unit: 'm3',
        unit_price: '6000.0000',
        line_total: '60000.0000',
      },
    ]);
    expect(result).toHaveLength(1);
  });

  // One set-based INSERT, not one per line — and the result must come back in the caller's order,
  // which is why line_id is generated here instead of by the column DEFAULT (po_line_items has no
  // sort column, and RETURNING order for INSERT ... SELECT is not guaranteed).
  it('createLineItems issues a single INSERT and preserves input order', async () => {
    const descriptions = ['Concrete', 'Rebar', 'Formwork'];
    // Echo back the generated ids, deliberately SHUFFLED, to prove the reorder is real.
    mockPrisma.$queryRaw.mockImplementation((_strings: unknown, ...values: unknown[]) => {
      const ids = values[2] as string[];
      const descs = values[4] as string[];
      const rows = ids.map((line_id, i) => ({ ...lineRow, line_id, description: descs[i] }));
      return Promise.resolve([...rows].reverse());
    });

    const result = await repo.createLineItems(
      'po-uuid-001',
      descriptions.map((description) => ({
        description,
        quantity: '1.0000',
        unit: 'm3',
        unit_price: '100.0000',
        line_total: '100.0000',
      })),
    );

    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(result.map((r) => r.description)).toEqual(descriptions);
  });

  it('createLineItems issues no query for an empty item list', async () => {
    expect(await repo.createLineItems('po-uuid-001', [])).toEqual([]);
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('findLineItemsByPo returns rows', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([lineRow]);
    expect(await repo.findLineItemsByPo('po-uuid-001')).toHaveLength(1);
  });

  // ── Deliveries ─────────────────────────────────────────────────────────────

  it('createDelivery returns delivery + items', async () => {
    const itemRow = {
      delivery_item_id: 'di-001',
      delivery_id: 'del-uuid-001',
      line_id: 'line-uuid-001',
      tenant_id: 'tenant-uuid-001',
      quantity_received: '10.0000',
    };
    mockPrisma.$queryRaw.mockResolvedValueOnce([deliveryRow]).mockResolvedValueOnce([itemRow]);
    const result = await repo.createDelivery({
      po_id: 'po-uuid-001',
      delivered_at: new Date().toISOString(),
      received_by: 'user-uuid-001',
      items: [{ line_id: 'line-uuid-001', quantity_received: '10.0000' }],
    });
    expect(result.delivery.delivery_id).toBe('del-uuid-001');
    expect(result.items).toHaveLength(1);
  });

  it('createDelivery records the header with no items at all', async () => {
    // A delivery can arrive with nothing matched to a PO line yet (a note-only receipt). The header
    // still has to commit, and an empty VALUES list would be a syntax error — hence the guard rather
    // than an unconditional INSERT.
    mockPrisma.$queryRaw.mockResolvedValueOnce([deliveryRow]);
    const result = await repo.createDelivery({
      po_id: 'po-uuid-001',
      delivered_at: new Date().toISOString(),
      received_by: 'user-uuid-001',
      items: [],
    });
    expect(result.delivery.delivery_id).toBe('del-uuid-001');
    expect(result.items).toEqual([]);
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('createDelivery falls back to raw RETURNING order when a line_id is missing from the result', async () => {
    // The re-ordering maps requested line_ids back onto returned rows. If the database returns a row
    // the caller did not ask for (or drops one), `ordered` is shorter than `rows` and the code keeps
    // the raw rows instead — losing an item silently would understate what was received.
    mockPrisma.$queryRaw.mockResolvedValueOnce([deliveryRow]).mockResolvedValueOnce([
      {
        delivery_item_id: 'di-x',
        delivery_id: 'del-uuid-001',
        line_id: 'line-UNREQUESTED',
        tenant_id: 'tenant-uuid-001',
        quantity_received: '1.0000',
      },
    ]);
    const result = await repo.createDelivery({
      po_id: 'po-uuid-001',
      delivered_at: new Date().toISOString(),
      received_by: 'user-uuid-001',
      items: [{ line_id: 'line-requested', quantity_received: '1.0000' }],
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.line_id).toBe('line-UNREQUESTED');
  });

  it('createDelivery inserts all items in one query, ordered by the caller’s line_ids', async () => {
    const lineIds = ['line-a', 'line-b', 'line-c'];
    mockPrisma.$queryRaw
      .mockResolvedValueOnce([deliveryRow])
      // Returned out of order — the repository must put them back.
      .mockResolvedValueOnce(
        [...lineIds].reverse().map((line_id) => ({
          delivery_item_id: `di-${line_id}`,
          delivery_id: 'del-uuid-001',
          line_id,
          tenant_id: 'tenant-uuid-001',
          quantity_received: '1.0000',
        })),
      );

    const result = await repo.createDelivery({
      po_id: 'po-uuid-001',
      delivered_at: new Date().toISOString(),
      received_by: 'user-uuid-001',
      items: lineIds.map((line_id) => ({ line_id, quantity_received: '1.0000' })),
    });

    // One INSERT for the delivery + one for all three items.
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(2);
    expect(result.items.map((i) => i.line_id)).toEqual(lineIds);
  });

  it('findDeliveriesByPo returns rows', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([deliveryRow]);
    expect(await repo.findDeliveriesByPo('po-uuid-001')).toHaveLength(1);
  });

  // ── Invoices ───────────────────────────────────────────────────────────────

  it('createInvoice returns invoice row', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([invoiceRow]);
    const result = await repo.createInvoice({
      po_id: 'po-uuid-001',
      vendor_id: 'vendor-uuid-001',
      invoice_number: 'INV-001',
      amount: '60000.0000',
      currency_code: 'THB',
      invoice_date: '2026-09-05',
      due_date: '2026-09-20',
    });
    expect(result.invoice_id).toBe('inv-uuid-001');
  });

  it('findInvoiceById returns null when not found', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    expect(await repo.findInvoiceById('missing')).toBeNull();
  });

  it('findInvoiceById returns row when found', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([invoiceRow]);
    expect((await repo.findInvoiceById('inv-uuid-001'))?.invoice_id).toBe('inv-uuid-001');
  });

  it('findInvoices returns rows + total (with po_id and status filters)', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([invoiceRow]).mockResolvedValueOnce([{ count: 1n }]);
    const result = await repo.findInvoices({
      po_id: 'po-uuid-001',
      status: 'RECEIVED',
      page: 1,
      limit: 20,
    });
    expect(result.rows).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('findInvoices handles undefined filters + empty count (?? null and ?? 0 branches)', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const result = await repo.findInvoices({ page: 1, limit: 20 });
    expect(result.total).toBe(0);
  });

  it('updateInvoiceStatus calls $executeRaw', async () => {
    mockPrisma.$executeRaw.mockResolvedValue(1);
    await repo.updateInvoiceStatus('inv-uuid-001', 'APPROVED');
    expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('sumDeliveredQuantity returns string sum', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ total: '10.0000' }]);
    const result = await repo.sumDeliveredQuantity('line-uuid-001');
    expect(result).toBe('10.0000');
  });

  it('sumDeliveredQuantity returns "0" when no deliveries found (covers ?? branch)', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    const result = await repo.sumDeliveredQuantity('line-uuid-001');
    expect(result).toBe('0');
  });

  // ── Tenant-wide list methods (AIP-132) ──────────────────────────────────────

  it('listPurchaseRequestsTenant returns rows + total (with filters)', async () => {
    mockPrisma.$queryRaw
      .mockResolvedValueOnce([prRow])
      .mockResolvedValueOnce([{ count: BigInt(1) }]);
    const result = await repo.listPurchaseRequestsTenant({
      project_id: 'proj-uuid-001',
      status: 'DRAFT',
      page: 1,
      limit: 20,
    });
    expect(result.rows).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('listPurchaseRequestsTenant handles undefined filters (?? null branch)', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: BigInt(0) }]);
    const result = await repo.listPurchaseRequestsTenant({ page: 2, limit: 10 });
    expect(result.total).toBe(0);
  });

  it('listRfqsTenant returns rows + total (with filters)', async () => {
    mockPrisma.$queryRaw
      .mockResolvedValueOnce([rfqRow])
      .mockResolvedValueOnce([{ count: BigInt(1) }]);
    const result = await repo.listRfqsTenant({
      project_id: 'proj-uuid-001',
      status: 'PUBLISHED',
      page: 1,
      limit: 20,
    });
    expect(result.rows).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('listRfqsTenant handles undefined filters', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: BigInt(0) }]);
    expect((await repo.listRfqsTenant({ page: 1, limit: 20 })).total).toBe(0);
  });

  it('listPurchaseOrdersTenant returns rows + total (with filters)', async () => {
    mockPrisma.$queryRaw
      .mockResolvedValueOnce([poRow])
      .mockResolvedValueOnce([{ count: BigInt(1) }]);
    const result = await repo.listPurchaseOrdersTenant({
      project_id: 'proj-uuid-001',
      status: 'APPROVED',
      page: 1,
      limit: 20,
    });
    expect(result.rows).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('listPurchaseOrdersTenant handles undefined filters', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: BigInt(0) }]);
    expect((await repo.listPurchaseOrdersTenant({ page: 1, limit: 20 })).total).toBe(0);
  });

  it('listDeliveriesTenant returns rows + total (with po filter)', async () => {
    mockPrisma.$queryRaw
      .mockResolvedValueOnce([deliveryRow])
      .mockResolvedValueOnce([{ count: BigInt(1) }]);
    const result = await repo.listDeliveriesTenant({ po_id: 'po-uuid-001', page: 1, limit: 20 });
    expect(result.rows).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('listDeliveriesTenant handles undefined po filter', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: BigInt(0) }]);
    expect((await repo.listDeliveriesTenant({ page: 1, limit: 20 })).total).toBe(0);
  });

  // ── G-M14 note + G-W5 vendor-scoring metric queries ──────────────────────
  it('updateInvoiceNote executes the update', async () => {
    mockPrisma.$executeRaw.mockResolvedValue(1);
    await repo.updateInvoiceNote('inv-1', 'check quantity');
    expect(mockPrisma.$executeRaw).toHaveBeenCalled();
  });

  it('vendorOtdStats maps rows and defaults to zero when empty', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ on_time: 8, total: 10 }]);
    expect(await repo.vendorOtdStats('v1')).toEqual({ on_time: 8, total: 10 });
    mockPrisma.$queryRaw.mockResolvedValueOnce([]);
    expect(await repo.vendorOtdStats('v1')).toEqual({ on_time: 0, total: 0 });
  });

  it('vendorDisputeStats maps rows and defaults to zero when empty', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ disputed: 2, total: 10 }]);
    expect(await repo.vendorDisputeStats('v1')).toEqual({ disputed: 2, total: 10 });
    mockPrisma.$queryRaw.mockResolvedValueOnce([]);
    expect(await repo.vendorDisputeStats('v1')).toEqual({ disputed: 0, total: 0 });
  });

  it('vendorPriceStats maps competitiveness and defaults to null when empty', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ price_pct: 95.5, cnt: 4 }]);
    expect(await repo.vendorPriceStats('v1')).toEqual({ price_pct: 95.5, count: 4 });
    mockPrisma.$queryRaw.mockResolvedValueOnce([]);
    expect(await repo.vendorPriceStats('v1')).toEqual({ price_pct: null, count: 0 });
  });
});
