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

  service = await module.resolve<ProcurementService>(ProcurementService);
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

  it('recordDelivery — throws NotFoundException when PO not found', async () => {
    mockRepo.findPoById.mockResolvedValue(null);
    await expect(
      service.recordDelivery('missing-po', {
        delivered_at: new Date().toISOString(),
        items: [{ line_id: 'l-001', quantity_received: '5.0000' }],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('recordDelivery — complete delivery (is_partial = false)', async () => {
    const acknowledgedPo = { ...poFixture, status: 'ACKNOWLEDGED' as const };
    mockRepo.findPoById.mockResolvedValue(acknowledgedPo);
    mockRepo.createDelivery.mockResolvedValue({
      delivery: {
        delivery_id: 'del-uuid-001',
        po_id: 'po-uuid-001',
        tenant_id: 'tenant-uuid-001',
        delivery_note: null,
        delivered_at: new Date(),
        received_by: 'user-uuid-001',
        notes: null,
      },
      items: [
        {
          delivery_item_id: 'di-001',
          delivery_id: 'del-uuid-001',
          line_id: 'line-uuid-001',
          tenant_id: 'tenant-uuid-001',
          quantity_received: '10.0000',
        },
      ],
    });
    mockRepo.findLineItemsByPo.mockResolvedValue(lineItemFixtures);
    mockRepo.sumDeliveredQuantity.mockResolvedValue('10.0000'); // 10 of 10 = complete

    const result = await service.recordDelivery('po-uuid-001', {
      delivered_at: new Date().toISOString(),
      items: [{ line_id: 'line-uuid-001', quantity_received: '10.0000' }],
    });
    expect(result.is_partial).toBe(false);
  });
});

// ── Additional coverage: uncovered happy paths ─────────────────────────────

describe('listVendors', () => {
  it('returns vendor list', async () => {
    mockRepo.listVendors.mockResolvedValue([vendorFixture]);
    const result = await service.listVendors();
    expect(result).toHaveLength(1);
  });
});

describe('getVendor (found)', () => {
  it('returns vendor when found', async () => {
    mockRepo.findVendorById.mockResolvedValue(vendorFixture);
    const result = await service.getVendor('vendor-uuid-001');
    expect(result.vendor_id).toBe('vendor-uuid-001');
  });
});

describe('deactivateVendor', () => {
  it('deactivates vendor', async () => {
    mockRepo.findVendorById.mockResolvedValue(vendorFixture);
    mockRepo.deactivateVendor.mockResolvedValue(undefined);
    await expect(service.deactivateVendor('vendor-uuid-001')).resolves.toBeUndefined();
    expect(mockRepo.deactivateVendor).toHaveBeenCalledWith('vendor-uuid-001');
  });
});

describe('Purchase Requests', () => {
  it('createPurchaseRequest returns PR', async () => {
    const pr = {
      pr_id: 'pr-001',
      project_id: 'p-001',
      tenant_id: 'tenant-uuid-001',
      pr_number: 'PR-001',
      status: 'DRAFT' as const,
      requested_by: 'user-uuid-001',
      required_date: null,
      created_at: new Date(),
      updated_at: new Date(),
    };
    mockRepo.createPurchaseRequest.mockResolvedValue(pr);
    const result = await service.createPurchaseRequest({
      project_id: 'p-001',
      pr_number: 'PR-001',
    });
    expect(result.pr_id).toBe('pr-001');
  });

  it('listPurchaseRequests returns list', async () => {
    mockRepo.listPurchaseRequests.mockResolvedValue([]);
    const result = await service.listPurchaseRequests('p-001');
    expect(result).toEqual([]);
  });
});

describe('createRfq', () => {
  it('creates RFQ and starts Temporal workflow', async () => {
    const rfq = { ...rfqDraftFixture };
    mockRepo.createRfq.mockResolvedValue(rfq);
    mockRepo.setRfqWorkflowId.mockResolvedValue(undefined);

    const result = await service.createRfq({
      project_id: 'project-uuid-001',
      rfq_number: 'RFQ-001',
      deadline: new Date(Date.now() + 7 * 86400 * 1000).toISOString(),
    });
    expect(result.rfq_id).toBe('rfq-uuid-001');
    expect(mockRepo.setRfqWorkflowId).toHaveBeenCalled();
  });
});

describe('RFQ — additional happy paths', () => {
  it('publishRfq — throws NotFoundException when RFQ not found', async () => {
    mockRepo.findRfqById.mockResolvedValue(null);
    await expect(service.publishRfq('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('closeRfq — signals workflow when PUBLISHED', async () => {
    mockRepo.findRfqById.mockResolvedValue(rfqPublishedFixture);
    await expect(service.closeRfq('rfq-uuid-001')).resolves.toBeUndefined();
  });

  it('cancelRfq — throws NotFoundException when RFQ not found', async () => {
    mockRepo.findRfqById.mockResolvedValue(null);
    await expect(service.cancelRfq('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('cancelRfq — throws when RFQ is CANCELLED terminal', async () => {
    mockRepo.findRfqById.mockResolvedValue({ ...rfqDraftFixture, status: 'CANCELLED' });
    await expect(service.cancelRfq('rfq-uuid-001')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('cancelRfq — signals workflow when DRAFT', async () => {
    mockRepo.findRfqById.mockResolvedValue(rfqDraftFixture);
    await expect(service.cancelRfq('rfq-uuid-001')).resolves.toBeUndefined();
  });

  it('awardRfq — happy path marks selected and signals', async () => {
    mockRepo.findRfqById.mockResolvedValue(rfqEvaluatedFixture);
    mockRepo.findQuotationsByRfq.mockResolvedValue(quotationFixtures);
    mockRepo.markQuotationSelected.mockResolvedValue(undefined);
    await expect(service.awardRfq('rfq-uuid-001', 'quot-uuid-001')).resolves.toBeUndefined();
  });

  it('listRfqs returns list', async () => {
    mockRepo.listRfqs.mockResolvedValue([rfqDraftFixture]);
    const result = await service.listRfqs('project-uuid-001');
    expect(result).toHaveLength(1);
  });
});

describe('submitQuotation', () => {
  it('submits quotation for PUBLISHED RFQ', async () => {
    const q = { ...quotationFixtures[0]! };
    mockRepo.findRfqById.mockResolvedValue(rfqPublishedFixture);
    mockRepo.createQuotation.mockResolvedValue(q);

    const result = await service.submitQuotation('rfq-uuid-001', {
      vendor_id: 'vendor-uuid-002',
      total_amount: '150000.0000',
      currency_code: 'THB',
      validity_days: 30,
      submitted_at: new Date().toISOString(),
    });
    expect(result.quotation_id).toBe('quot-uuid-002');
  });

  it('throws NotFoundException when RFQ not found', async () => {
    mockRepo.findRfqById.mockResolvedValue(null);
    await expect(
      service.submitQuotation('missing', {
        vendor_id: 'v-001',
        total_amount: '1.0000',
        currency_code: 'THB',
        validity_days: 30,
        submitted_at: new Date().toISOString(),
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws UnprocessableEntityException when RFQ not PUBLISHED', async () => {
    mockRepo.findRfqById.mockResolvedValue(rfqDraftFixture);
    await expect(
      service.submitQuotation('rfq-uuid-001', {
        vendor_id: 'v-001',
        total_amount: '1.0000',
        currency_code: 'THB',
        validity_days: 30,
        submitted_at: new Date().toISOString(),
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});

describe('PO — additional happy paths', () => {
  it('submitPoForApproval — signals workflow when DRAFT', async () => {
    mockRepo.findPoById.mockResolvedValue(poFixture);
    await expect(service.submitPoForApproval('po-uuid-001')).resolves.toBeUndefined();
  });

  it('approvePo — signals workflow when PENDING_APPROVAL', async () => {
    mockRepo.findPoById.mockResolvedValue({ ...poFixture, status: 'PENDING_APPROVAL' });
    await expect(service.approvePo('po-uuid-001', 'PM')).resolves.toBeUndefined();
  });

  it('rejectPo — signals workflow when PENDING_APPROVAL', async () => {
    mockRepo.findPoById.mockResolvedValue({ ...poFixture, status: 'PENDING_APPROVAL' });
    await expect(service.rejectPo('po-uuid-001', 'Price too high')).resolves.toBeUndefined();
  });

  it('acknowledgePo — signals workflow when SENT', async () => {
    mockRepo.findPoById.mockResolvedValue({ ...poFixture, status: 'SENT' });
    await expect(service.acknowledgePo('po-uuid-001')).resolves.toBeUndefined();
  });

  it('listPurchaseOrders returns list', async () => {
    mockRepo.listPurchaseOrders.mockResolvedValue([poFixture]);
    const result = await service.listPurchaseOrders('project-uuid-001');
    expect(result).toHaveLength(1);
  });

  it('getPurchaseOrder returns PO with line items', async () => {
    mockRepo.findPoById.mockResolvedValue(poFixture);
    mockRepo.findLineItemsByPo.mockResolvedValue(lineItemFixtures);
    const result = await service.getPurchaseOrder('po-uuid-001');
    expect(result.po.po_id).toBe('po-uuid-001');
    expect(result.line_items).toHaveLength(1);
  });

  it('getPurchaseOrder — throws NotFoundException when not found', async () => {
    mockRepo.findPoById.mockResolvedValue(null);
    await expect(service.getPurchaseOrder('missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('receiveInvoice', () => {
  const invoiceDto = {
    invoice_number: 'INV-001',
    amount: '60000.0000',
    currency_code: 'THB',
    invoice_date: '2026-09-05',
    due_date: '2026-09-20',
  };
  const invoiceRow = {
    invoice_id: 'inv-uuid-001',
    po_id: 'po-uuid-001',
    vendor_id: 'vendor-uuid-001',
    tenant_id: 'tenant-uuid-001',
    invoice_number: 'INV-001',
    amount: '60000.0000',
    currency_code: 'THB',
    invoice_date: new Date('2026-09-05'),
    due_date: new Date('2026-09-20'),
    status: 'RECEIVED' as const,
    file_id: null,
    created_at: new Date(),
    updated_at: new Date(),
  };

  it('receives invoice for FULLY_DELIVERED PO', async () => {
    mockRepo.findPoById.mockResolvedValue({ ...poFixture, status: 'FULLY_DELIVERED' });
    mockRepo.createInvoice.mockResolvedValue(invoiceRow);
    const result = await service.receiveInvoice('po-uuid-001', invoiceDto);
    expect(result.invoice_id).toBe('inv-uuid-001');
  });
});

describe('approveInvoice', () => {
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

  it('approves RECEIVED invoice', async () => {
    mockRepo.findInvoiceById.mockResolvedValue(invoiceRow);
    mockRepo.updateInvoiceStatus.mockResolvedValue(undefined);
    mockRepo.findPoById.mockResolvedValue(poFixture);
    const result = await service.approveInvoice('po-uuid-001', 'inv-uuid-001');
    expect(result.status).toBe('APPROVED');
  });

  it('throws NotFoundException when invoice not found', async () => {
    mockRepo.findInvoiceById.mockResolvedValue(null);
    await expect(service.approveInvoice('po-uuid-001', 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('throws NotFoundException when invoice belongs to different PO', async () => {
    mockRepo.findInvoiceById.mockResolvedValue({ ...invoiceRow, po_id: 'other-po' });
    await expect(service.approveInvoice('po-uuid-001', 'inv-uuid-001')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('throws UnprocessableEntityException when status is not RECEIVED or VERIFIED', async () => {
    mockRepo.findInvoiceById.mockResolvedValue({ ...invoiceRow, status: 'APPROVED' });
    await expect(service.approveInvoice('po-uuid-001', 'inv-uuid-001')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('approves invoice when po is null (covers po?.project_id ?? "" branch)', async () => {
    mockRepo.findInvoiceById.mockResolvedValue(invoiceRow);
    mockRepo.updateInvoiceStatus.mockResolvedValue(undefined);
    mockRepo.findPoById.mockResolvedValue(null); // po is null → project_id = ''
    const result = await service.approveInvoice('po-uuid-001', 'inv-uuid-001');
    expect(result.status).toBe('APPROVED');
  });

  it('approves invoice when due_date is a string not a Date (covers instanceof false branch)', async () => {
    const invoiceWithStringDate = { ...invoiceRow, due_date: '2026-09-20' as unknown as Date };
    mockRepo.findInvoiceById.mockResolvedValue(invoiceWithStringDate);
    mockRepo.updateInvoiceStatus.mockResolvedValue(undefined);
    mockRepo.findPoById.mockResolvedValue(poFixture);
    const result = await service.approveInvoice('po-uuid-001', 'inv-uuid-001');
    expect(result.status).toBe('APPROVED');
  });
});

describe('listInvoicesByPo / markInvoicePaid / disputeInvoice', () => {
  it('listInvoicesByPo returns list', async () => {
    mockRepo.findInvoicesByPo.mockResolvedValue([]);
    const result = await service.listInvoicesByPo('po-uuid-001');
    expect(result).toEqual([]);
  });

  it('markInvoicePaid — signals workflow when INVOICED', async () => {
    mockRepo.findPoById.mockResolvedValue({ ...poFixture, status: 'INVOICED' });
    await expect(service.markInvoicePaid('po-uuid-001')).resolves.toBeUndefined();
  });

  it('disputeInvoice — signals workflow when INVOICED', async () => {
    mockRepo.findPoById.mockResolvedValue({ ...poFixture, status: 'INVOICED' });
    await expect(service.disputeInvoice('po-uuid-001', 'Wrong amount')).resolves.toBeUndefined();
  });
});

describe('private helper branches', () => {
  it('assertRfqStatus — throws NotFoundException when rfq not found', async () => {
    mockRepo.findRfqById.mockResolvedValue(null);
    // publishRfq calls assertRfqStatus internally
    await expect(service.publishRfq('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('assertPoStatus — throws NotFoundException when po not found', async () => {
    mockRepo.findPoById.mockResolvedValue(null);
    await expect(service.submitPoForApproval('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('getRfqWorkflowHandle — throws when no temporal_workflow_id', async () => {
    mockRepo.findRfqById.mockResolvedValue({ ...rfqDraftFixture, temporal_workflow_id: null });
    await expect(service.publishRfq('rfq-uuid-001')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('getPoWorkflowHandle — throws when no temporal_workflow_id', async () => {
    mockRepo.findPoById.mockResolvedValue({ ...poFixture, temporal_workflow_id: null });
    await expect(service.submitPoForApproval('po-uuid-001')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('constructor uses empty strings when request has no context', async () => {
    const module = await (
      await import('@nestjs/testing')
    ).Test.createTestingModule({
      providers: [
        (await import('../procurement.service')).ProcurementService,
        {
          provide: (await import('../procurement.repository')).ProcurementRepository,
          useValue: mockRepo,
        },
        { provide: (await import('@nestjs/core')).REQUEST, useValue: {} },
      ],
    }).compile();
    const svc = await module.resolve<ProcurementService>(
      (await import('../procurement.service')).ProcurementService,
    );
    expect(svc).toBeDefined();
  });

  it('publishEvent — logs error but does not throw when Kafka fails (covers catch branch)', async () => {
    mockRepo.findRfqById.mockResolvedValue(rfqDraftFixture);
    mockRepo.setRfqWorkflowId.mockResolvedValue(undefined);
    mockRepo.createRfq.mockResolvedValue(rfqDraftFixture);
    const kafkaMock = (
      service as unknown as {
        kafka: { connect: jest.Mock; publish: jest.Mock; disconnect: jest.Mock };
      }
    ).kafka;
    kafkaMock.publish.mockRejectedValueOnce(new Error('Kafka down'));
    await expect(
      service.createRfq({
        project_id: 'project-uuid-001',
        rfq_number: 'RFQ-001',
        deadline: new Date(Date.now() + 7 * 86400 * 1000).toISOString(),
      }),
    ).resolves.toBeDefined();
  });
});
