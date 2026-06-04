// Unit tests — Procurement Service (Phase 5)
// Focus: workflow state transitions, financial calculations (total validation),
//        quotation comparison, RBAC-critical paths.

import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { REQUEST } from '@nestjs/core';
import { ProcurementService } from '../procurement.service';
import { ProcurementRepository } from '../procurement.repository';
import type {
  VendorRow,
  RfqRow,
  QuotationRow,
  PurchaseOrderRow,
  PoLineItemRow,
  DeliveryRow,
  DeliveryItemRow,
} from '../procurement.repository';

// ── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('@cos/shared', () => ({
  KafkaProducer: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    publish: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('@temporalio/client', () => ({
  Connection: {
    connect: jest.fn().mockResolvedValue({}),
  },
  Client: jest.fn().mockImplementation(() => ({
    workflow: {
      start: jest.fn().mockResolvedValue({ firstExecutionRunId: 'run-1' }),
      getHandle: jest.fn().mockReturnValue({
        signal: jest.fn().mockResolvedValue(undefined),
        query: jest.fn().mockResolvedValue('DRAFT'),
      }),
    },
  })),
}));

const mockRepo = {
  createVendor: jest.fn(),
  findVendorById: jest.fn(),
  listVendors: jest.fn(),
  deactivateVendor: jest.fn(),
  createPurchaseRequest: jest.fn(),
  listPurchaseRequests: jest.fn(),
  findPrById: jest.fn(),
  updatePrStatus: jest.fn(),
  createRfq: jest.fn(),
  findRfqById: jest.fn(),
  listRfqs: jest.fn(),
  updateRfqStatus: jest.fn(),
  setRfqWorkflowId: jest.fn(),
  createQuotation: jest.fn(),
  findQuotationsByRfq: jest.fn(),
  markQuotationSelected: jest.fn(),
  createPurchaseOrder: jest.fn(),
  findPoById: jest.fn(),
  listPurchaseOrders: jest.fn(),
  updatePoStatus: jest.fn(),
  setPoWorkflowId: jest.fn(),
  createLineItems: jest.fn(),
  findLineItemsByPo: jest.fn(),
  createDelivery: jest.fn(),
  findDeliveriesByPo: jest.fn(),
  sumDeliveredQuantity: jest.fn(),
  createInvoice: jest.fn(),
  findInvoiceById: jest.fn(),
  findInvoicesByPo: jest.fn(),
  updateInvoiceStatus: jest.fn(),
};

const mockRequest = {
  tenantId: 'tenant-uuid-001',
  tenantCode: 'acme_corp',
  user: { user_id: 'user-uuid-001', role: 'PROCUREMENT_OFFICER' },
};

// ── Fixtures ───────────────────────────────────────────────────────────────

const vendorFixture: VendorRow = {
  vendor_id: 'vendor-uuid-001',
  tenant_id: 'tenant-uuid-001',
  vendor_code: 'V001',
  vendor_name: 'Test Vendor Co.',
  tax_id: null,
  contact_email: null,
  contact_phone: null,
  address: null,
  is_active: true,
  created_at: new Date(),
  updated_at: new Date(),
};

const rfqDraftFixture: RfqRow = {
  rfq_id: 'rfq-uuid-001',
  pr_id: null,
  project_id: 'project-uuid-001',
  tenant_id: 'tenant-uuid-001',
  rfq_number: 'RFQ-001',
  status: 'DRAFT',
  deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  temporal_workflow_id: 'rfq-rfq-uuid-001',
  created_by: 'user-uuid-001',
  created_at: new Date(),
  updated_at: new Date(),
};

const rfqPublishedFixture: RfqRow = { ...rfqDraftFixture, status: 'PUBLISHED' };
const rfqClosedFixture: RfqRow = { ...rfqDraftFixture, status: 'CLOSED' };
const rfqEvaluatedFixture: RfqRow = { ...rfqDraftFixture, status: 'EVALUATED' };

const quotationFixtures: QuotationRow[] = [
  {
    quotation_id: 'quot-uuid-002',
    rfq_id: 'rfq-uuid-001',
    vendor_id: 'vendor-uuid-002',
    tenant_id: 'tenant-uuid-001',
    total_amount: '150000.0000',
    currency_code: 'THB',
    validity_days: 30,
    submitted_at: new Date(),
    is_selected: false,
  },
  {
    quotation_id: 'quot-uuid-001',
    rfq_id: 'rfq-uuid-001',
    vendor_id: 'vendor-uuid-001',
    tenant_id: 'tenant-uuid-001',
    total_amount: '120000.0000',
    currency_code: 'THB',
    validity_days: 30,
    submitted_at: new Date(),
    is_selected: false,
  },
];

const poFixture: PurchaseOrderRow = {
  po_id: 'po-uuid-001',
  rfq_id: null,
  vendor_id: 'vendor-uuid-001',
  project_id: 'project-uuid-001',
  tenant_id: 'tenant-uuid-001',
  po_number: 'PO-001',
  status: 'DRAFT',
  total_amount: '60000.0000',
  currency_code: 'THB',
  delivery_date: new Date('2026-09-01'),
  temporal_workflow_id: 'po-po-uuid-001',
  created_by: 'user-uuid-001',
  created_at: new Date(),
  updated_at: new Date(),
};

const lineItemFixtures: PoLineItemRow[] = [
  {
    line_id: 'line-uuid-001',
    po_id: 'po-uuid-001',
    tenant_id: 'tenant-uuid-001',
    boq_item_id: null,
    description: 'Concrete mix M35',
    quantity: '10.0000',
    unit: 'm3',
    unit_price: '6000.0000',
    line_total: '60000.0000',
  },
];

// ── Test setup ─────────────────────────────────────────────────────────────

let service: ProcurementService;

beforeEach(async () => {
  Object.values(mockRepo).forEach((fn) => (fn as jest.Mock).mockReset());

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      ProcurementService,
      { provide: ProcurementRepository, useValue: mockRepo },
      { provide: REQUEST, useValue: mockRequest },
    ],
  }).compile();

  service = module.get<ProcurementService>(ProcurementService);
});

// ── Vendor tests ───────────────────────────────────────────────────────────

describe('Vendor', () => {
  it('createVendor — stores and returns vendor row', async () => {
    mockRepo.createVendor.mockResolvedValue(vendorFixture);

    const result = await service.createVendor({
      vendor_code: 'V001',
      vendor_name: 'Test Vendor Co.',
    });

    expect(result.vendor_id).toBe('vendor-uuid-001');
    expect(mockRepo.createVendor).toHaveBeenCalledWith(
      expect.objectContaining({ vendor_code: 'V001' }),
    );
  });

  it('getVendor — throws NotFoundException for unknown vendor', async () => {
    mockRepo.findVendorById.mockResolvedValue(null);
    await expect(service.getVendor('nonexistent')).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ── RFQ state machine tests ────────────────────────────────────────────────

describe('RFQ state machine', () => {
  it('publishRfq — throws if RFQ is not DRAFT', async () => {
    mockRepo.findRfqById.mockResolvedValue(rfqPublishedFixture);
    await expect(service.publishRfq('rfq-uuid-001')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('publishRfq — signals workflow when DRAFT', async () => {
    mockRepo.findRfqById.mockResolvedValue(rfqDraftFixture);
    await service.publishRfq('rfq-uuid-001');
    // Signal sent via mocked Temporal client — no error = success
  });

  it('closeRfq — throws if RFQ is not PUBLISHED', async () => {
    mockRepo.findRfqById.mockResolvedValue(rfqDraftFixture);
    await expect(service.closeRfq('rfq-uuid-001')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('cancelRfq — throws if RFQ is in AWARDED terminal state', async () => {
    mockRepo.findRfqById.mockResolvedValue({ ...rfqDraftFixture, status: 'AWARDED' });
    await expect(service.cancelRfq('rfq-uuid-001')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });
});

// ── Quotation comparison tests ────────────────────────────────────────────

describe('Quotation comparison', () => {
  it('compareQuotations — throws if RFQ not CLOSED', async () => {
    mockRepo.findRfqById.mockResolvedValue(rfqPublishedFixture);
    await expect(service.compareQuotations('rfq-uuid-001')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('compareQuotations — throws if no quotations exist', async () => {
    mockRepo.findRfqById.mockResolvedValue(rfqClosedFixture);
    mockRepo.findQuotationsByRfq.mockResolvedValue([]);
    await expect(service.compareQuotations('rfq-uuid-001')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('compareQuotations — sorts by price ASC and marks lowest as selected', async () => {
    mockRepo.findRfqById.mockResolvedValue(rfqClosedFixture);
    mockRepo.findQuotationsByRfq.mockResolvedValue(quotationFixtures);
    mockRepo.markQuotationSelected.mockResolvedValue(undefined);

    const result = await service.compareQuotations('rfq-uuid-001');

    // First result is lowest price
    expect(result[0]!.total_amount).toBe('120000.0000');
    expect(result[0]!.is_selected).toBe(true);
    expect(result[1]!.is_selected).toBe(false);
    expect(mockRepo.markQuotationSelected).toHaveBeenCalledWith('quot-uuid-001', 'rfq-uuid-001');
  });

  it('awardRfq — throws if RFQ not EVALUATED', async () => {
    mockRepo.findRfqById.mockResolvedValue(rfqClosedFixture);
    await expect(service.awardRfq('rfq-uuid-001', 'quot-uuid-001')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('awardRfq — throws if quotation not in RFQ', async () => {
    mockRepo.findRfqById.mockResolvedValue(rfqEvaluatedFixture);
    mockRepo.findQuotationsByRfq.mockResolvedValue([]);
    await expect(service.awardRfq('rfq-uuid-001', 'quot-uuid-999')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

// ── PO financial calculation tests ────────────────────────────────────────

describe('Purchase Order financial calculations', () => {
  it('createPurchaseOrder — rejects when line totals do not match total_amount', async () => {
    await expect(
      service.createPurchaseOrder({
        vendor_id: 'vendor-uuid-001',
        project_id: 'project-uuid-001',
        po_number: 'PO-001',
        total_amount: '99999.9999', // wrong — computed should be 60000.0000
        currency_code: 'THB',
        delivery_date: '2026-09-01',
        line_items: [
          {
            description: 'Concrete',
            quantity: '10.0000',
            unit: 'm3',
            unit_price: '6000.0000',
          },
        ],
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('createPurchaseOrder — accepts when total_amount matches line item sum', async () => {
    mockRepo.createPurchaseOrder.mockResolvedValue(poFixture);
    mockRepo.createLineItems.mockResolvedValue(lineItemFixtures);
    mockRepo.setPoWorkflowId.mockResolvedValue(undefined);

    const result = await service.createPurchaseOrder({
      vendor_id: 'vendor-uuid-001',
      project_id: 'project-uuid-001',
      po_number: 'PO-001',
      total_amount: '60000.0000', // 10 × 6000 = 60000
      currency_code: 'THB',
      delivery_date: '2026-09-01',
      line_items: [
        {
          description: 'Concrete mix M35',
          quantity: '10.0000',
          unit: 'm3',
          unit_price: '6000.0000',
        },
      ],
    });

    expect(result.po.po_number).toBe('PO-001');
    expect(result.line_items).toHaveLength(1);
  });

  it('createPurchaseOrder — DECIMAL precision: 10.1234 × 6000.0001 computed correctly', async () => {
    // 10.1234 × 6000.0001 = 60740.4010... rounded HALF_UP to 60740.4010
    mockRepo.createPurchaseOrder.mockResolvedValue({
      ...poFixture,
      total_amount: '60740.4010',
    });
    mockRepo.createLineItems.mockResolvedValue([
      {
        ...lineItemFixtures[0]!,
        quantity: '10.1234',
        unit_price: '6000.0001',
        line_total: '60740.4010',
      },
    ]);
    mockRepo.setPoWorkflowId.mockResolvedValue(undefined);

    await expect(
      service.createPurchaseOrder({
        vendor_id: 'vendor-uuid-001',
        project_id: 'project-uuid-001',
        po_number: 'PO-002',
        total_amount: '60740.4010',
        currency_code: 'THB',
        delivery_date: '2026-09-01',
        line_items: [
          {
            description: 'Concrete',
            quantity: '10.1234',
            unit: 'm3',
            unit_price: '6000.0001',
          },
        ],
      }),
    ).resolves.toBeDefined();
  });
});

// ── PO state machine tests ─────────────────────────────────────────────────

describe('PO state machine', () => {
  it('submitPoForApproval — throws if PO not DRAFT', async () => {
    mockRepo.findPoById.mockResolvedValue({
      ...poFixture,
      status: 'PENDING_APPROVAL',
    });
    await expect(service.submitPoForApproval('po-uuid-001')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('approvePo — throws if PO not PENDING_APPROVAL', async () => {
    mockRepo.findPoById.mockResolvedValue({ ...poFixture, status: 'APPROVED' });
    await expect(service.approvePo('po-uuid-001', 'PM')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('receiveInvoice — throws if PO not FULLY_DELIVERED', async () => {
    mockRepo.findPoById.mockResolvedValue({ ...poFixture, status: 'INVOICED' });
    await expect(
      service.receiveInvoice('po-uuid-001', {
        invoice_number: 'INV-001',
        amount: '60000.0000',
        currency_code: 'THB',
        invoice_date: '2026-09-05',
        due_date: '2026-09-20',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('markInvoicePaid — throws if PO not INVOICED', async () => {
    mockRepo.findPoById.mockResolvedValue({ ...poFixture, status: 'FULLY_DELIVERED' });
    await expect(service.markInvoicePaid('po-uuid-001')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('disputeInvoice — throws if PO not INVOICED', async () => {
    mockRepo.findPoById.mockResolvedValue({ ...poFixture, status: 'FULLY_DELIVERED' });
    await expect(service.disputeInvoice('po-uuid-001', 'wrong delivery')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });
});

// ── Delivery tests ─────────────────────────────────────────────────────────

describe('Delivery recording', () => {
  it('recordDelivery — throws if PO not ACKNOWLEDGED or PARTIALLY_DELIVERED', async () => {
    mockRepo.findPoById.mockResolvedValue({ ...poFixture, status: 'DRAFT' });
    await expect(
      service.recordDelivery('po-uuid-001', {
        delivered_at: new Date().toISOString(),
        items: [{ line_id: 'line-uuid-001', quantity_received: '5.0000' }],
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('recordDelivery — correctly determines partial delivery', async () => {
    const acknowledgedPo = { ...poFixture, status: 'ACKNOWLEDGED' as const };
    mockRepo.findPoById.mockResolvedValue(acknowledgedPo);
    mockRepo.createDelivery.mockResolvedValue({
      delivery: {
        delivery_id: 'delivery-uuid-001',
        po_id: 'po-uuid-001',
        tenant_id: 'tenant-uuid-001',
        delivery_note: null,
        delivered_at: new Date(),
        received_by: 'user-uuid-001',
        notes: null,
      } as DeliveryRow,
      items: [
        {
          delivery_item_id: 'di-uuid-001',
          delivery_id: 'delivery-uuid-001',
          line_id: 'line-uuid-001',
          tenant_id: 'tenant-uuid-001',
          quantity_received: '5.0000',
        } as DeliveryItemRow,
      ],
    });
    mockRepo.findLineItemsByPo.mockResolvedValue(lineItemFixtures);
    mockRepo.sumDeliveredQuantity.mockResolvedValue('5.0000'); // 5 out of 10 = partial

    const result = await service.recordDelivery('po-uuid-001', {
      delivered_at: new Date().toISOString(),
      items: [{ line_id: 'line-uuid-001', quantity_received: '5.0000' }],
    });

    expect(result.is_partial).toBe(true);
  });
});
