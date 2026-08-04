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
import {
  publishRfqSignal,
  closeRfqSignal,
  awardRfqSignal,
  cancelRfqSignal,
} from '../workflows/rfq.workflow';
import {
  submitPoSignal,
  approvePoSignal,
  rejectPoSignal,
  acknowledgePoSignal,
  recordDeliverySignal,
  receiveInvoiceSignal,
  markPaidSignal,
  disputeInvoiceSignal,
} from '../workflows/po.workflow';

// ── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('@cos/logger', () => {
  const info = jest.fn();
  const warn = jest.fn();
  const error = jest.fn();
  const names: string[] = [];
  const createLogger = jest.fn((module: string) => {
    names.push(module);
    return { info, warn, error, debug: jest.fn(), child: jest.fn() };
  });
  return { createLogger, __loggerMock: { info, warn, error, names } };
});
const { __loggerMock: loggerMock } = jest.requireMock('@cos/logger');

const mockKafkaConnect = jest.fn().mockResolvedValue(undefined);
const mockKafkaPublish = jest.fn().mockResolvedValue(undefined);
const mockKafkaDisconnect = jest.fn().mockResolvedValue(undefined);

jest.mock('@cos/shared', () => ({
  KafkaProducer: jest.fn().mockImplementation(() => ({
    connect: mockKafkaConnect,
    publish: mockKafkaPublish,
    disconnect: mockKafkaDisconnect,
  })),
}));

const mockWorkflowStart = jest.fn().mockResolvedValue({ firstExecutionRunId: 'run-1' });
const mockWorkflowSignal = jest.fn().mockResolvedValue(undefined);
const mockGetHandle = jest.fn(() => ({
  signal: mockWorkflowSignal,
  query: jest.fn().mockResolvedValue('DRAFT'),
}));
const mockConnectionConnect = jest.fn().mockResolvedValue({});

jest.mock('@temporalio/client', () => ({
  Connection: {
    connect: (...args: unknown[]) => mockConnectionConnect(...args),
  },
  Client: jest.fn().mockImplementation(() => ({
    workflow: {
      start: mockWorkflowStart,
      getHandle: mockGetHandle,
    },
  })),
}));

const mockRepo = {
  createVendor: jest.fn(),
  findVendorById: jest.fn(),
  listVendors: jest.fn(),
  deactivateVendor: jest.fn(),
  createPurchaseRequest: jest.fn(),
  nextPrNumber: jest.fn(),
  findPrById: jest.fn(),
  updatePrStatus: jest.fn(),
  createRfq: jest.fn(),
  findRfqById: jest.fn(),
  updateRfqStatus: jest.fn(),
  setRfqWorkflowId: jest.fn(),
  createQuotation: jest.fn(),
  findQuotationsByRfq: jest.fn(),
  findQuotationsByVendor: jest.fn(),
  markQuotationSelected: jest.fn(),
  createPurchaseOrder: jest.fn(),
  createPurchaseOrderWithLineItems: jest.fn(),
  findPoById: jest.fn(),
  updatePoStatus: jest.fn(),
  setPoWorkflowId: jest.fn(),
  createLineItems: jest.fn(),
  findLineItemsByPo: jest.fn(),
  createDelivery: jest.fn(),
  findDeliveriesByPo: jest.fn(),
  sumDeliveredQuantity: jest.fn(),
  createInvoice: jest.fn(),
  findInvoiceById: jest.fn(),
  findInvoices: jest.fn(),
  updateInvoiceStatus: jest.fn(),
  updateInvoiceNote: jest.fn(),
  vendorOtdStats: jest.fn(),
  vendorDisputeStats: jest.fn(),
  vendorPriceStats: jest.fn(),
  listPurchaseRequestsTenant: jest.fn(),
  listRfqsTenant: jest.fn(),
  listPurchaseOrdersTenant: jest.fn(),
  listDeliveriesTenant: jest.fn(),
};

const mockRequest = {
  tenantId: 'tenant-uuid-001',
  tenantCode: 'acme_corp',
  userId: 'user-uuid-001',
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

  mockKafkaConnect.mockClear().mockResolvedValue(undefined);
  mockKafkaPublish.mockClear().mockResolvedValue(undefined);
  mockKafkaDisconnect.mockClear().mockResolvedValue(undefined);
  mockWorkflowStart.mockClear().mockResolvedValue({ firstExecutionRunId: 'run-1' });
  mockWorkflowSignal.mockClear().mockResolvedValue(undefined);
  mockGetHandle.mockClear();
  mockConnectionConnect.mockClear().mockResolvedValue({});
  loggerMock.info.mockClear();
  loggerMock.warn.mockClear();
  loggerMock.error.mockClear();

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

  it('getVendorQuotations — returns the vendor history after the 404 guard passes', async () => {
    mockRepo.findVendorById.mockResolvedValue({ vendor_id: 'vendor-uuid-001' });
    mockRepo.findQuotationsByVendor.mockResolvedValue([{ quotation_id: 'q-001' }]);
    const result = await service.getVendorQuotations('vendor-uuid-001');
    expect(result).toHaveLength(1);
    expect(mockRepo.findQuotationsByVendor).toHaveBeenCalledWith('vendor-uuid-001');
  });

  it('getVendorQuotations — throws NotFoundException when the vendor does not exist', async () => {
    mockRepo.findVendorById.mockResolvedValue(null);
    await expect(service.getVendorQuotations('nonexistent')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(mockRepo.findQuotationsByVendor).not.toHaveBeenCalled();
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
    mockRepo.createPurchaseOrderWithLineItems.mockResolvedValue({
      po: poFixture,
      line_items: lineItemFixtures,
    });
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
    mockRepo.createPurchaseOrderWithLineItems.mockResolvedValue({
      po: { ...poFixture, total_amount: '60740.4010' },
      line_items: [
        {
          ...lineItemFixtures[0]!,
          quantity: '10.1234',
          unit_price: '6000.0001',
          line_total: '60740.4010',
        },
      ],
    });
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
      service.receiveInvoice({
        po_id: 'po-uuid-001',
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
      service.recordDelivery({
        po_id: 'po-uuid-001',
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

    const result = await service.recordDelivery({
      po_id: 'po-uuid-001',
      delivered_at: new Date().toISOString(),
      items: [{ line_id: 'line-uuid-001', quantity_received: '5.0000' }],
    });

    expect(result.is_partial).toBe(true);
  });

  it('recordDelivery — throws NotFoundException when PO not found', async () => {
    mockRepo.findPoById.mockResolvedValue(null);
    await expect(
      service.recordDelivery({
        po_id: 'missing-po',
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

    const result = await service.recordDelivery({
      po_id: 'po-uuid-001',
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

  it('keeps a caller-supplied pr_number instead of allocating one', async () => {
    mockRepo.createPurchaseRequest.mockResolvedValue({ pr_id: 'pr-001' });

    await service.createPurchaseRequest({ project_id: 'p-001', pr_number: 'PR-MANUAL-9' });

    expect(mockRepo.nextPrNumber).not.toHaveBeenCalled();
    expect(mockRepo.createPurchaseRequest).toHaveBeenCalledWith(
      expect.objectContaining({ pr_number: 'PR-MANUAL-9' }),
    );
  });

  it('defers pr_number allocation to the insert transaction when the caller omits one', async () => {
    // The mobile path: a site engineer should not be asked to invent a document number. The number
    // is now derived inside createPurchaseRequest's transaction (under an advisory lock) rather than
    // read here first — reading it in a separate transaction was a race.
    mockRepo.createPurchaseRequest.mockResolvedValue({ pr_id: 'pr-001' });

    await service.createPurchaseRequest({ project_id: 'p-001' } as never);

    expect(mockRepo.nextPrNumber).not.toHaveBeenCalled();
    expect(mockRepo.createPurchaseRequest).toHaveBeenCalledWith(
      expect.objectContaining({ pr_number: undefined, year: new Date().getFullYear() }),
    );
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

  it('covers both TEMPORAL_ADDRESS env-defined and default branches (line 654)', async () => {
    const original = process.env['TEMPORAL_ADDRESS'];
    const startRfq = async (rfqNumber: string) => {
      mockRepo.createRfq.mockResolvedValue({ ...rfqDraftFixture });
      mockRepo.setRfqWorkflowId.mockResolvedValue(undefined);
      return service.createRfq({
        project_id: 'project-uuid-001',
        rfq_number: rfqNumber,
        deadline: new Date(Date.now() + 7 * 86400 * 1000).toISOString(),
      });
    };
    try {
      process.env['TEMPORAL_ADDRESS'] = 'temporal.internal:7233';
      expect((await startRfq('RFQ-002')).rfq_id).toBe('rfq-uuid-001');
      delete process.env['TEMPORAL_ADDRESS'];
      expect((await startRfq('RFQ-003')).rfq_id).toBe('rfq-uuid-001');
    } finally {
      if (original === undefined) delete process.env['TEMPORAL_ADDRESS'];
      else process.env['TEMPORAL_ADDRESS'] = original;
    }
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
    po_id: 'po-uuid-001',
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
    const result = await service.receiveInvoice(invoiceDto);
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
    const result = await service.approveInvoice('inv-uuid-001');
    expect(result.status).toBe('APPROVED');
  });

  it('throws NotFoundException when invoice not found', async () => {
    mockRepo.findInvoiceById.mockResolvedValue(null);
    await expect(service.approveInvoice('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws UnprocessableEntityException when status is not RECEIVED or VERIFIED', async () => {
    mockRepo.findInvoiceById.mockResolvedValue({ ...invoiceRow, status: 'APPROVED' });
    await expect(service.approveInvoice('inv-uuid-001')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('approves invoice when po is null (covers po?.project_id ?? "" branch)', async () => {
    mockRepo.findInvoiceById.mockResolvedValue(invoiceRow);
    mockRepo.updateInvoiceStatus.mockResolvedValue(undefined);
    mockRepo.findPoById.mockResolvedValue(null); // po is null → project_id = ''
    const result = await service.approveInvoice('inv-uuid-001');
    expect(result.status).toBe('APPROVED');
  });

  it('approves invoice when due_date is a string not a Date (covers instanceof false branch)', async () => {
    const invoiceWithStringDate = { ...invoiceRow, due_date: '2026-09-20' as unknown as Date };
    mockRepo.findInvoiceById.mockResolvedValue(invoiceWithStringDate);
    mockRepo.updateInvoiceStatus.mockResolvedValue(undefined);
    mockRepo.findPoById.mockResolvedValue(poFixture);
    const result = await service.approveInvoice('inv-uuid-001');
    expect(result.status).toBe('APPROVED');
  });
});

describe('disputeVendorInvoice (G-W6)', () => {
  const inv = {
    invoice_id: 'inv-d-1',
    po_id: 'po-1',
    vendor_id: 'v-1',
    tenant_id: 't-1',
    invoice_number: 'INV-D-1',
    amount: '100.0000',
    currency_code: 'THB',
    invoice_date: new Date(),
    due_date: new Date(),
    status: 'VERIFIED' as const,
    file_id: null,
    created_at: new Date(),
    updated_at: new Date(),
  };

  it('sets a verified invoice to DISPUTED', async () => {
    mockRepo.findInvoiceById.mockResolvedValue(inv);
    mockRepo.updateInvoiceStatus.mockResolvedValue(undefined);
    const result = await service.disputeVendorInvoice('inv-d-1');
    expect(result.status).toBe('DISPUTED');
    expect(mockRepo.updateInvoiceStatus).toHaveBeenCalledWith('inv-d-1', 'DISPUTED');
  });

  it('throws NotFoundException when invoice not found', async () => {
    mockRepo.findInvoiceById.mockResolvedValue(null);
    await expect(service.disputeVendorInvoice('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws UnprocessableEntityException when already PAID or DISPUTED', async () => {
    mockRepo.findInvoiceById.mockResolvedValue({ ...inv, status: 'PAID' });
    await expect(service.disputeVendorInvoice('inv-d-1')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('getVendorInvoice returns the invoice', async () => {
    mockRepo.findInvoiceById.mockResolvedValue(inv);
    expect(await service.getVendorInvoice('inv-d-1')).toBe(inv);
  });

  it('getVendorInvoice throws NotFoundException when missing', async () => {
    mockRepo.findInvoiceById.mockResolvedValue(null);
    await expect(service.getVendorInvoice('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('setInvoiceNote sets the note and returns the updated invoice', async () => {
    mockRepo.findInvoiceById.mockResolvedValue(inv);
    mockRepo.updateInvoiceNote.mockResolvedValue(undefined);
    const result = await service.setInvoiceNote('inv-d-1', 'check quantity');
    expect(result.note).toBe('check quantity');
    expect(mockRepo.updateInvoiceNote).toHaveBeenCalledWith('inv-d-1', 'check quantity');
  });

  it('setInvoiceNote throws NotFoundException when missing', async () => {
    mockRepo.findInvoiceById.mockResolvedValue(null);
    await expect(service.setInvoiceNote('missing', 'x')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('computeVendorScore (G-W5)', () => {
  it('grades A when all three criteria are perfect', async () => {
    mockRepo.vendorOtdStats.mockResolvedValue({ on_time: 10, total: 10 });
    mockRepo.vendorDisputeStats.mockResolvedValue({ disputed: 0, total: 5 });
    mockRepo.vendorPriceStats.mockResolvedValue({ price_pct: 100, count: 4 });
    const result = await service.computeVendorScore('v-1');
    expect(result.grade).toBe('A');
    expect(result.totalScore).toBeCloseTo(100);
    expect(result.breakdown).toHaveLength(3);
  });

  it('re-normalises weights over available criteria (only OTD has data)', async () => {
    mockRepo.vendorOtdStats.mockResolvedValue({ on_time: 6, total: 10 }); // 60
    mockRepo.vendorDisputeStats.mockResolvedValue({ disputed: 0, total: 0 });
    mockRepo.vendorPriceStats.mockResolvedValue({ price_pct: null, count: 0 });
    const result = await service.computeVendorScore('v-2');
    expect(result.breakdown).toHaveLength(1);
    expect(result.totalScore).toBeCloseTo(60); // single criterion weight = 1
    expect(result.grade).toBe('C');
  });

  it('returns null grade when the vendor has no data at all', async () => {
    mockRepo.vendorOtdStats.mockResolvedValue({ on_time: 0, total: 0 });
    mockRepo.vendorDisputeStats.mockResolvedValue({ disputed: 0, total: 0 });
    mockRepo.vendorPriceStats.mockResolvedValue({ price_pct: null, count: 0 });
    const result = await service.computeVendorScore('v-3');
    expect(result.grade).toBeNull();
    expect(result.totalScore).toBeNull();
    expect(result.breakdown).toHaveLength(0);
  });

  it('quality reflects the invoice dispute rate', async () => {
    mockRepo.vendorOtdStats.mockResolvedValue({ on_time: 0, total: 0 });
    mockRepo.vendorDisputeStats.mockResolvedValue({ disputed: 2, total: 10 }); // quality = 80
    mockRepo.vendorPriceStats.mockResolvedValue({ price_pct: null, count: 0 });
    const result = await service.computeVendorScore('v-4');
    expect(result.breakdown[0]?.value).toBeCloseTo(80);
  });
});

describe('listInvoices / markInvoicePaid / disputeInvoice', () => {
  it('listInvoices wraps repo result with pagination meta', async () => {
    mockRepo.findInvoices.mockResolvedValue({ rows: ['INV'], total: 1 });
    const result = await service.listInvoices({ po_id: 'po-uuid-001', page: 1, limit: 20 });
    expect(mockRepo.findInvoices).toHaveBeenCalledWith({
      po_id: 'po-uuid-001',
      page: 1,
      limit: 20,
    });
    expect(result).toEqual({ items: ['INV'], total: 1, page: 1, limit: 20 });
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
    const module = await Test.createTestingModule({
      providers: [
        ProcurementService,
        {
          provide: ProcurementRepository,
          useValue: mockRepo,
        },
        { provide: REQUEST, useValue: {} },
      ],
    }).compile();
    const svc = await module.resolve<ProcurementService>(ProcurementService);
    expect(svc).toBeDefined();
    expect((svc as unknown as { tenantId: string }).tenantId).toBe('');
    expect((svc as unknown as { userId: string }).userId).toBe('');
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

describe('Tenant-wide list methods', () => {
  it('listAllPurchaseRequests wraps repo result with pagination meta', async () => {
    mockRepo.listPurchaseRequestsTenant.mockResolvedValue({ rows: ['PR'], total: 5 });
    const result = await service.listAllPurchaseRequests({
      project_id: 'p-1',
      status: 'DRAFT',
      page: 2,
      limit: 10,
    });
    expect(mockRepo.listPurchaseRequestsTenant).toHaveBeenCalledWith({
      project_id: 'p-1',
      status: 'DRAFT',
      page: 2,
      limit: 10,
    });
    expect(result).toEqual({ items: ['PR'], total: 5, page: 2, limit: 10 });
  });

  it('listAllRfqs wraps repo result', async () => {
    mockRepo.listRfqsTenant.mockResolvedValue({ rows: ['RFQ'], total: 1 });
    const result = await service.listAllRfqs({ page: 1, limit: 20 });
    expect(result).toEqual({ items: ['RFQ'], total: 1, page: 1, limit: 20 });
  });

  it('listAllPurchaseOrders wraps repo result', async () => {
    mockRepo.listPurchaseOrdersTenant.mockResolvedValue({ rows: ['PO'], total: 3 });
    const result = await service.listAllPurchaseOrders({ page: 1, limit: 20 });
    expect(result).toEqual({ items: ['PO'], total: 3, page: 1, limit: 20 });
  });

  it('listAllDeliveries wraps repo result', async () => {
    mockRepo.listDeliveriesTenant.mockResolvedValue({ rows: ['DEL'], total: 2 });
    const result = await service.listAllDeliveries({ po_id: 'po-1', page: 1, limit: 20 });
    expect(mockRepo.listDeliveriesTenant).toHaveBeenCalledWith({
      po_id: 'po-1',
      page: 1,
      limit: 20,
    });
    expect(result).toEqual({ items: ['DEL'], total: 2, page: 1, limit: 20 });
  });

  it('listDeliveriesByPo delegates to repo.findDeliveriesByPo', async () => {
    mockRepo.findDeliveriesByPo.mockResolvedValue(['DEL']);
    expect(await service.listDeliveriesByPo('po-1')).toEqual(['DEL']);
    expect(mockRepo.findDeliveriesByPo).toHaveBeenCalledWith('po-1');
  });
});

// ── Mutation hardening — exact contracts (QM-1 mutation score ≥ 70%) ────────
// Kills surviving mutants by pinning exact strings, payloads, and call args.

describe('module wiring', () => {
  it('creates the module logger with the exact name', () => {
    expect(loggerMock.names).toContain('procurement-service');
  });
});

describe('exact contracts — vendors and purchase requests', () => {
  it('listVendors passes active_only=true by default', async () => {
    mockRepo.listVendors.mockResolvedValue([]);
    await service.listVendors();
    expect(mockRepo.listVendors).toHaveBeenCalledWith(true);
  });

  it('getVendor — exact not-found message', async () => {
    mockRepo.findVendorById.mockResolvedValue(null);
    await expect(service.getVendor('nonexistent')).rejects.toThrow('Vendor nonexistent not found');
  });

  it('deactivateVendor — logs exact event', async () => {
    mockRepo.findVendorById.mockResolvedValue(vendorFixture);
    mockRepo.deactivateVendor.mockResolvedValue(undefined);
    await service.deactivateVendor('vendor-uuid-001');
    expect(loggerMock.info).toHaveBeenCalledWith(
      { vendor_id: 'vendor-uuid-001', tenant_id: 'tenant-uuid-001' },
      'vendor.deactivated',
    );
  });

  it('createPurchaseRequest — exact repo payload and log', async () => {
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
    await service.createPurchaseRequest({ project_id: 'p-001', pr_number: 'PR-001' });
    expect(mockRepo.createPurchaseRequest).toHaveBeenCalledWith({
      project_id: 'p-001',
      pr_number: 'PR-001',
      requested_by: 'user-uuid-001',
      required_date: undefined,
      // `year` and `items` were added when PR-number allocation moved INSIDE the insert transaction
      // (deriving the number in the service first was a read-then-write race across two
      // transactions). This assertion had not followed. Computed, not the literal 2026 the failure
      // output showed — a hardcoded year turns into a green-until-January test.
      year: new Date().getFullYear(),
      items: undefined,
    });
    expect(loggerMock.info).toHaveBeenCalledWith(
      { pr_id: 'pr-001', tenant_id: 'tenant-uuid-001' },
      'pr.created',
    );
  });
});

describe('exact contracts — createRfq', () => {
  const isoDeadline = new Date(Date.now() + 7 * 86400 * 1000).toISOString();

  it('passes exact repo payload, workflow start args, Kafka event, and log', async () => {
    mockRepo.createRfq.mockResolvedValue({ ...rfqDraftFixture });
    mockRepo.setRfqWorkflowId.mockResolvedValue(undefined);

    await service.createRfq({
      project_id: 'project-uuid-001',
      rfq_number: 'RFQ-001',
      deadline: isoDeadline,
    });

    expect(mockRepo.createRfq).toHaveBeenCalledWith({
      pr_id: undefined,
      project_id: 'project-uuid-001',
      rfq_number: 'RFQ-001',
      deadline: isoDeadline,
      created_by: 'user-uuid-001',
    });
    expect(mockWorkflowStart).toHaveBeenCalledWith('rfqWorkflow', {
      taskQueue: 'procurement',
      workflowId: 'rfq-rfq-uuid-001',
      args: [
        {
          rfq_id: 'rfq-uuid-001',
          tenant_id: 'tenant-uuid-001',
          correlation_id: expect.any(String),
          deadline_ms: new Date(isoDeadline).getTime(),
        },
      ],
    });
    expect(mockRepo.setRfqWorkflowId).toHaveBeenCalledWith('rfq-uuid-001', 'rfq-rfq-uuid-001');
    expect(mockKafkaPublish).toHaveBeenCalledWith({
      event_type: 'procurement.rfq.created.v1',
      event_version: '1.0',
      tenant_id: 'tenant-uuid-001',
      actor_id: 'user-uuid-001',
      occurred_at: expect.any(String),
      correlation_id: expect.any(String),
      payload: {
        rfq_id: 'rfq-uuid-001',
        pr_id: null,
        project_id: 'project-uuid-001',
        rfq_number: 'RFQ-001',
        deadline: rfqDraftFixture.deadline.toISOString(),
        created_by: 'user-uuid-001',
      },
    });
    expect(loggerMock.info).toHaveBeenCalledWith(
      {
        rfq_id: 'rfq-uuid-001',
        workflow_id: 'rfq-rfq-uuid-001',
        tenant_id: 'tenant-uuid-001',
      },
      'rfq.created',
    );
  });

  it('publishes the RFQ pr_id when the RFQ was created from a PR', async () => {
    mockRepo.createRfq.mockResolvedValue({ ...rfqDraftFixture, pr_id: 'pr-uuid-777' });
    mockRepo.setRfqWorkflowId.mockResolvedValue(undefined);
    await service.createRfq({
      pr_id: 'pr-uuid-777',
      project_id: 'project-uuid-001',
      rfq_number: 'RFQ-002',
      deadline: isoDeadline,
    });
    expect(mockKafkaPublish).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ pr_id: 'pr-uuid-777' }),
      }),
    );
  });

  it('kafka publish failure logs exact error event and does not throw', async () => {
    mockRepo.createRfq.mockResolvedValue({ ...rfqDraftFixture });
    mockRepo.setRfqWorkflowId.mockResolvedValue(undefined);
    mockKafkaPublish.mockRejectedValueOnce(new Error('Kafka down'));
    await expect(
      service.createRfq({
        project_id: 'project-uuid-001',
        rfq_number: 'RFQ-001',
        deadline: isoDeadline,
      }),
    ).resolves.toBeDefined();
    expect(loggerMock.error).toHaveBeenCalledWith(
      {
        event_type: 'procurement.rfq.created.v1',
        err: expect.any(Error),
        correlation_id: expect.any(String),
      },
      'kafka.publish.failed',
    );
  });
});

describe('exact contracts — Temporal client connection', () => {
  it('connects to the default address when TEMPORAL_ADDRESS is unset', async () => {
    const original = process.env['TEMPORAL_ADDRESS'];
    delete process.env['TEMPORAL_ADDRESS'];
    try {
      mockRepo.createRfq.mockResolvedValue({ ...rfqDraftFixture });
      mockRepo.setRfqWorkflowId.mockResolvedValue(undefined);
      await service.createRfq({
        project_id: 'project-uuid-001',
        rfq_number: 'RFQ-001',
        deadline: new Date(Date.now() + 86400 * 1000).toISOString(),
      });
      expect(mockConnectionConnect).toHaveBeenCalledWith({ address: 'localhost:7233' });
      const { Client } = jest.requireMock('@temporalio/client');
      expect(Client).toHaveBeenCalledWith({ connection: expect.anything() });
    } finally {
      if (original === undefined) delete process.env['TEMPORAL_ADDRESS'];
      else process.env['TEMPORAL_ADDRESS'] = original;
    }
  });

  it('connects to TEMPORAL_ADDRESS when set', async () => {
    const original = process.env['TEMPORAL_ADDRESS'];
    process.env['TEMPORAL_ADDRESS'] = 'temporal.internal:7233';
    try {
      mockRepo.createRfq.mockResolvedValue({ ...rfqDraftFixture });
      mockRepo.setRfqWorkflowId.mockResolvedValue(undefined);
      await service.createRfq({
        project_id: 'project-uuid-001',
        rfq_number: 'RFQ-001',
        deadline: new Date(Date.now() + 86400 * 1000).toISOString(),
      });
      expect(mockConnectionConnect).toHaveBeenCalledWith({
        address: 'temporal.internal:7233',
      });
    } finally {
      if (original === undefined) delete process.env['TEMPORAL_ADDRESS'];
      else process.env['TEMPORAL_ADDRESS'] = original;
    }
  });
});

describe('exact contracts — RFQ lifecycle signals and errors', () => {
  it('publishRfq — exact signal payload, handle id, and log', async () => {
    mockRepo.findRfqById.mockResolvedValue(rfqDraftFixture);
    await service.publishRfq('rfq-uuid-001');
    expect(mockGetHandle).toHaveBeenCalledWith('rfq-rfq-uuid-001');
    expect(mockWorkflowSignal).toHaveBeenCalledWith(publishRfqSignal, {
      actor_id: 'user-uuid-001',
    });
    expect(loggerMock.info).toHaveBeenCalledWith(
      { rfq_id: 'rfq-uuid-001', actor_id: 'user-uuid-001' },
      'rfq.published',
    );
  });

  it('publishRfq — exact wrong-status message', async () => {
    mockRepo.findRfqById.mockResolvedValue(rfqPublishedFixture);
    await expect(service.publishRfq('rfq-uuid-001')).rejects.toThrow(
      'RFQ rfq-uuid-001 must be DRAFT (current: PUBLISHED)',
    );
  });

  it('publishRfq — exact not-found message', async () => {
    mockRepo.findRfqById.mockResolvedValue(null);
    await expect(service.publishRfq('missing')).rejects.toThrow('RFQ missing not found');
  });

  it('publishRfq — exact no-workflow message', async () => {
    mockRepo.findRfqById.mockResolvedValue({ ...rfqDraftFixture, temporal_workflow_id: null });
    await expect(service.publishRfq('rfq-uuid-001')).rejects.toThrow(
      'RFQ rfq-uuid-001 has no Temporal workflow',
    );
  });

  it('closeRfq — exact signal payload and log', async () => {
    mockRepo.findRfqById.mockResolvedValue(rfqPublishedFixture);
    await service.closeRfq('rfq-uuid-001');
    expect(mockWorkflowSignal).toHaveBeenCalledWith(closeRfqSignal, {
      actor_id: 'user-uuid-001',
    });
    expect(loggerMock.info).toHaveBeenCalledWith(
      { rfq_id: 'rfq-uuid-001', actor_id: 'user-uuid-001' },
      'rfq.closed',
    );
  });

  it('cancelRfq — exact signal payload and log', async () => {
    mockRepo.findRfqById.mockResolvedValue(rfqDraftFixture);
    await service.cancelRfq('rfq-uuid-001');
    expect(mockWorkflowSignal).toHaveBeenCalledWith(cancelRfqSignal, {
      actor_id: 'user-uuid-001',
    });
    expect(loggerMock.info).toHaveBeenCalledWith(
      { rfq_id: 'rfq-uuid-001', actor_id: 'user-uuid-001' },
      'rfq.cancelled',
    );
  });

  it('cancelRfq — exact not-found and terminal-state messages', async () => {
    mockRepo.findRfqById.mockResolvedValue(null);
    await expect(service.cancelRfq('missing')).rejects.toThrow('RFQ missing not found');

    mockRepo.findRfqById.mockResolvedValue({ ...rfqDraftFixture, status: 'AWARDED' });
    await expect(service.cancelRfq('rfq-uuid-001')).rejects.toThrow(
      'RFQ rfq-uuid-001 is already in terminal state: AWARDED',
    );
  });

  it('awardRfq — exact signal payload, selection call, and log', async () => {
    mockRepo.findRfqById.mockResolvedValue(rfqEvaluatedFixture);
    // Single quotation that IS the target: a negated find-predicate returns undefined here.
    mockRepo.findQuotationsByRfq.mockResolvedValue([quotationFixtures[1]!]);
    mockRepo.markQuotationSelected.mockResolvedValue(undefined);
    await service.awardRfq('rfq-uuid-001', 'quot-uuid-001');
    expect(mockRepo.markQuotationSelected).toHaveBeenCalledWith('quot-uuid-001', 'rfq-uuid-001');
    expect(mockWorkflowSignal).toHaveBeenCalledWith(awardRfqSignal, {
      actor_id: 'user-uuid-001',
      quotation_id: 'quot-uuid-001',
    });
    expect(loggerMock.info).toHaveBeenCalledWith(
      { rfq_id: 'rfq-uuid-001', quotation_id: 'quot-uuid-001', actor_id: 'user-uuid-001' },
      'rfq.awarded',
    );
  });

  it('awardRfq — throws exact message when target quotation absent from a non-empty list', async () => {
    mockRepo.findRfqById.mockResolvedValue(rfqEvaluatedFixture);
    mockRepo.findQuotationsByRfq.mockResolvedValue([quotationFixtures[0]!]);
    await expect(service.awardRfq('rfq-uuid-001', 'quot-uuid-999')).rejects.toThrow(
      'Quotation quot-uuid-999 not found in RFQ rfq-uuid-001',
    );
  });
});

describe('exact contracts — quotations', () => {
  it('submitQuotation — exact repo payload and log', async () => {
    const submittedAt = new Date().toISOString();
    mockRepo.findRfqById.mockResolvedValue(rfqPublishedFixture);
    mockRepo.createQuotation.mockResolvedValue({ ...quotationFixtures[0]! });
    await service.submitQuotation('rfq-uuid-001', {
      vendor_id: 'vendor-uuid-002',
      total_amount: '150000.0000',
      currency_code: 'THB',
      validity_days: 30,
      submitted_at: submittedAt,
    });
    expect(mockRepo.createQuotation).toHaveBeenCalledWith({
      rfq_id: 'rfq-uuid-001',
      vendor_id: 'vendor-uuid-002',
      total_amount: '150000.0000',
      currency_code: 'THB',
      validity_days: 30,
      submitted_at: submittedAt,
    });
    expect(loggerMock.info).toHaveBeenCalledWith(
      {
        quotation_id: 'quot-uuid-002',
        rfq_id: 'rfq-uuid-001',
        vendor_id: 'vendor-uuid-002',
      },
      'quotation.submitted',
    );
  });

  it('submitQuotation — exact not-found and not-published messages', async () => {
    mockRepo.findRfqById.mockResolvedValue(null);
    await expect(
      service.submitQuotation('missing', {
        vendor_id: 'v-001',
        total_amount: '1.0000',
        currency_code: 'THB',
        validity_days: 30,
        submitted_at: new Date().toISOString(),
      }),
    ).rejects.toThrow('RFQ missing not found');

    mockRepo.findRfqById.mockResolvedValue(rfqDraftFixture);
    await expect(
      service.submitQuotation('rfq-uuid-001', {
        vendor_id: 'v-001',
        total_amount: '1.0000',
        currency_code: 'THB',
        validity_days: 30,
        submitted_at: new Date().toISOString(),
      }),
    ).rejects.toThrow('RFQ rfq-uuid-001 is not PUBLISHED — cannot submit quotation');
  });

  it('compareQuotations — exact no-quotations message and evaluation log', async () => {
    mockRepo.findRfqById.mockResolvedValue(rfqClosedFixture);
    mockRepo.findQuotationsByRfq.mockResolvedValue([]);
    await expect(service.compareQuotations('rfq-uuid-001')).rejects.toThrow(
      'RFQ rfq-uuid-001 has no quotations — cannot evaluate',
    );

    mockRepo.findQuotationsByRfq.mockResolvedValue(quotationFixtures);
    mockRepo.markQuotationSelected.mockResolvedValue(undefined);
    await service.compareQuotations('rfq-uuid-001');
    expect(loggerMock.info).toHaveBeenCalledWith(
      { rfq_id: 'rfq-uuid-001', winner: 'quot-uuid-001', total: '120000.0000' },
      'quotations.evaluated',
    );
  });
});

describe('exact contracts — createPurchaseOrder', () => {
  const poDto = {
    vendor_id: 'vendor-uuid-001',
    project_id: 'project-uuid-001',
    po_number: 'PO-001',
    total_amount: '60000.0000',
    currency_code: 'THB',
    delivery_date: '2026-09-01',
    line_items: [
      { description: 'Concrete mix M35', quantity: '10.0000', unit: 'm3', unit_price: '6000.0000' },
    ],
  };

  beforeEach(() => {
    mockRepo.createPurchaseOrderWithLineItems.mockResolvedValue({
      po: poFixture,
      line_items: lineItemFixtures,
    });
    mockRepo.setPoWorkflowId.mockResolvedValue(undefined);
  });

  it('rejects with exact mismatch message', async () => {
    await expect(
      service.createPurchaseOrder({ ...poDto, total_amount: '99999.9999' }),
    ).rejects.toThrow('PO total_amount 99999.9999 does not match sum of line_items (60000.0000)');
  });

  it('passes exact repo payload and line items', async () => {
    await service.createPurchaseOrder(poDto);
    // Header + lines go to the repo as a single atomic call (one transaction).
    expect(mockRepo.createPurchaseOrderWithLineItems).toHaveBeenCalledWith(
      {
        rfq_id: undefined,
        vendor_id: 'vendor-uuid-001',
        project_id: 'project-uuid-001',
        po_number: 'PO-001',
        total_amount: '60000.0000',
        currency_code: 'THB',
        delivery_date: '2026-09-01',
        created_by: 'user-uuid-001',
      },
      [
        {
          boq_item_id: undefined,
          description: 'Concrete mix M35',
          quantity: '10.0000',
          unit: 'm3',
          unit_price: '6000.0000',
          line_total: '60000.0000',
        },
      ],
    );
    expect(mockRepo.setPoWorkflowId).toHaveBeenCalledWith('po-uuid-001', 'po-po-uuid-001');
  });

  it('starts poWorkflow with exact params, thresholds, and default approvers', async () => {
    const originals = {
      pm: process.env['DEFAULT_PM_APPROVER_ID'],
      fin: process.env['DEFAULT_FINANCE_APPROVER_ID'],
      exec: process.env['DEFAULT_EXECUTIVE_APPROVER_ID'],
      admin: process.env['DEFAULT_TENANT_ADMIN_ID'],
    };
    delete process.env['DEFAULT_PM_APPROVER_ID'];
    delete process.env['DEFAULT_FINANCE_APPROVER_ID'];
    delete process.env['DEFAULT_EXECUTIVE_APPROVER_ID'];
    delete process.env['DEFAULT_TENANT_ADMIN_ID'];
    try {
      await service.createPurchaseOrder(poDto);
      expect(mockWorkflowStart).toHaveBeenCalledWith('poWorkflow', {
        taskQueue: 'procurement',
        workflowId: 'po-po-uuid-001',
        args: [
          {
            po_id: 'po-uuid-001',
            project_id: 'project-uuid-001',
            vendor_id: 'vendor-uuid-001',
            tenant_id: 'tenant-uuid-001',
            correlation_id: expect.any(String),
            total_amount_thb: '60000.0000',
            po_number: 'PO-001',
            total_amount: '60000.0000',
            currency_code: 'THB',
            approval_thresholds: { pm_only_max: 50000, pm_finance_max: 500000 },
            approvers: {
              pm_id: '00000000-0000-0000-0000-000000000001',
              finance_id: '00000000-0000-0000-0000-000000000002',
              executive_id: '00000000-0000-0000-0000-000000000003',
              tenant_admin_id: '00000000-0000-0000-0000-000000000004',
            },
          },
        ],
      });
    } finally {
      if (originals.pm !== undefined) process.env['DEFAULT_PM_APPROVER_ID'] = originals.pm;
      if (originals.fin !== undefined) process.env['DEFAULT_FINANCE_APPROVER_ID'] = originals.fin;
      if (originals.exec !== undefined)
        process.env['DEFAULT_EXECUTIVE_APPROVER_ID'] = originals.exec;
      if (originals.admin !== undefined) process.env['DEFAULT_TENANT_ADMIN_ID'] = originals.admin;
    }
  });

  it('uses env-configured approver ids when set', async () => {
    const originals = {
      pm: process.env['DEFAULT_PM_APPROVER_ID'],
      fin: process.env['DEFAULT_FINANCE_APPROVER_ID'],
      exec: process.env['DEFAULT_EXECUTIVE_APPROVER_ID'],
      admin: process.env['DEFAULT_TENANT_ADMIN_ID'],
    };
    process.env['DEFAULT_PM_APPROVER_ID'] = 'env-pm-id';
    process.env['DEFAULT_FINANCE_APPROVER_ID'] = 'env-finance-id';
    process.env['DEFAULT_EXECUTIVE_APPROVER_ID'] = 'env-executive-id';
    process.env['DEFAULT_TENANT_ADMIN_ID'] = 'env-admin-id';
    try {
      await service.createPurchaseOrder(poDto);
      const params = mockWorkflowStart.mock.calls.at(-1)![1].args[0];
      expect(params.approvers).toEqual({
        pm_id: 'env-pm-id',
        finance_id: 'env-finance-id',
        executive_id: 'env-executive-id',
        tenant_admin_id: 'env-admin-id',
      });
    } finally {
      for (const [key, value] of [
        ['DEFAULT_PM_APPROVER_ID', originals.pm],
        ['DEFAULT_FINANCE_APPROVER_ID', originals.fin],
        ['DEFAULT_EXECUTIVE_APPROVER_ID', originals.exec],
        ['DEFAULT_TENANT_ADMIN_ID', originals.admin],
      ] as const) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it('publishes exact po.created event and log', async () => {
    await service.createPurchaseOrder(poDto);
    expect(mockKafkaPublish).toHaveBeenCalledWith({
      event_type: 'procurement.po.created.v1',
      event_version: '1.0',
      tenant_id: 'tenant-uuid-001',
      actor_id: 'user-uuid-001',
      occurred_at: expect.any(String),
      correlation_id: expect.any(String),
      payload: {
        po_id: 'po-uuid-001',
        project_id: 'project-uuid-001',
        vendor_id: 'vendor-uuid-001',
        po_number: 'PO-001',
        total_amount: { amount: '60000.0000', currency_code: 'THB' },
        delivery_date: '2026-09-01',
        line_items: [
          {
            item_id: 'line-uuid-001',
            quantity: '10.0000',
            unit: 'm3',
            unit_price: '6000.0000',
          },
        ],
      },
    });
    expect(loggerMock.info).toHaveBeenCalledWith(
      { po_id: 'po-uuid-001', workflow_id: 'po-po-uuid-001', tenant_id: 'tenant-uuid-001' },
      'po.created',
    );
  });
});

describe('exact contracts — PO lifecycle signals and errors', () => {
  it('submitPoForApproval — exact signal, log, and error messages', async () => {
    mockRepo.findPoById.mockResolvedValue(poFixture);
    await service.submitPoForApproval('po-uuid-001');
    expect(mockGetHandle).toHaveBeenCalledWith('po-po-uuid-001');
    expect(mockWorkflowSignal).toHaveBeenCalledWith(submitPoSignal, {
      actor_id: 'user-uuid-001',
    });
    expect(loggerMock.info).toHaveBeenCalledWith(
      { po_id: 'po-uuid-001', actor_id: 'user-uuid-001' },
      'po.submitted',
    );

    mockRepo.findPoById.mockResolvedValue({ ...poFixture, status: 'PENDING_APPROVAL' });
    await expect(service.submitPoForApproval('po-uuid-001')).rejects.toThrow(
      'PO po-uuid-001 must be DRAFT (current: PENDING_APPROVAL)',
    );

    mockRepo.findPoById.mockResolvedValue(null);
    await expect(service.submitPoForApproval('missing')).rejects.toThrow(
      'Purchase order missing not found',
    );

    mockRepo.findPoById.mockResolvedValue({ ...poFixture, temporal_workflow_id: null });
    await expect(service.submitPoForApproval('po-uuid-001')).rejects.toThrow(
      'PO po-uuid-001 has no Temporal workflow',
    );
  });

  it('approvePo — exact signal payload and log', async () => {
    mockRepo.findPoById.mockResolvedValue({ ...poFixture, status: 'PENDING_APPROVAL' });
    await service.approvePo('po-uuid-001', 'FINANCE');
    expect(mockWorkflowSignal).toHaveBeenCalledWith(approvePoSignal, {
      approver_id: 'user-uuid-001',
      tier: 'FINANCE',
    });
    expect(loggerMock.info).toHaveBeenCalledWith(
      { po_id: 'po-uuid-001', tier: 'FINANCE', approver_id: 'user-uuid-001' },
      'po.approved',
    );
  });

  it('rejectPo — exact signal payload and log', async () => {
    mockRepo.findPoById.mockResolvedValue({ ...poFixture, status: 'PENDING_APPROVAL' });
    await service.rejectPo('po-uuid-001', 'Price too high');
    expect(mockWorkflowSignal).toHaveBeenCalledWith(rejectPoSignal, {
      approver_id: 'user-uuid-001',
      reason: 'Price too high',
    });
    expect(loggerMock.info).toHaveBeenCalledWith(
      { po_id: 'po-uuid-001', actor_id: 'user-uuid-001' },
      'po.rejected',
    );
  });

  it('acknowledgePo — exact signal payload and log', async () => {
    mockRepo.findPoById.mockResolvedValue({ ...poFixture, status: 'SENT' });
    await service.acknowledgePo('po-uuid-001');
    expect(mockWorkflowSignal).toHaveBeenCalledWith(acknowledgePoSignal, {
      actor_id: 'user-uuid-001',
    });
    expect(loggerMock.info).toHaveBeenCalledWith(
      { po_id: 'po-uuid-001', actor_id: 'user-uuid-001' },
      'po.acknowledged',
    );
  });

  it('markInvoicePaid / disputeInvoice — exact signals and logs', async () => {
    mockRepo.findPoById.mockResolvedValue({ ...poFixture, status: 'INVOICED' });
    await service.markInvoicePaid('po-uuid-001');
    expect(mockWorkflowSignal).toHaveBeenCalledWith(markPaidSignal, {
      actor_id: 'user-uuid-001',
    });
    expect(loggerMock.info).toHaveBeenCalledWith(
      { po_id: 'po-uuid-001', actor_id: 'user-uuid-001' },
      'invoice.paid',
    );

    await service.disputeInvoice('po-uuid-001', 'Wrong amount');
    expect(mockWorkflowSignal).toHaveBeenCalledWith(disputeInvoiceSignal, {
      actor_id: 'user-uuid-001',
      reason: 'Wrong amount',
    });
    expect(loggerMock.info).toHaveBeenCalledWith(
      { po_id: 'po-uuid-001', actor_id: 'user-uuid-001' },
      'invoice.disputed',
    );
  });

  it('getPurchaseOrder — exact not-found message', async () => {
    mockRepo.findPoById.mockResolvedValue(null);
    await expect(service.getPurchaseOrder('missing')).rejects.toThrow(
      'Purchase order missing not found',
    );
  });
});

describe('exact contracts — recordDelivery', () => {
  const deliveredAt = '2026-09-02T08:00:00.000Z';
  const deliveryRow = {
    delivery_id: 'delivery-uuid-001',
    po_id: 'po-uuid-001',
    tenant_id: 'tenant-uuid-001',
    delivery_note: null,
    delivered_at: new Date(deliveredAt),
    received_by: 'user-uuid-001',
    notes: null,
  } as DeliveryRow;
  const deliveryItems = [
    {
      delivery_item_id: 'di-uuid-001',
      delivery_id: 'delivery-uuid-001',
      line_id: 'line-uuid-001',
      tenant_id: 'tenant-uuid-001',
      quantity_received: '5.0000',
    } as DeliveryItemRow,
  ];

  it('exact not-found and wrong-status messages', async () => {
    mockRepo.findPoById.mockResolvedValue(null);
    await expect(
      service.recordDelivery({
        po_id: 'missing-po',
        delivered_at: deliveredAt,
        items: [{ line_id: 'l-001', quantity_received: '5.0000' }],
      }),
    ).rejects.toThrow('Purchase order missing-po not found');

    mockRepo.findPoById.mockResolvedValue({ ...poFixture, status: 'DRAFT' });
    await expect(
      service.recordDelivery({
        po_id: 'po-uuid-001',
        delivered_at: deliveredAt,
        items: [{ line_id: 'l-001', quantity_received: '5.0000' }],
      }),
    ).rejects.toThrow(
      'PO po-uuid-001 must be ACKNOWLEDGED or PARTIALLY_DELIVERED to record delivery (current: DRAFT)',
    );
  });

  it('accepts a PO in PARTIALLY_DELIVERED status', async () => {
    mockRepo.findPoById.mockResolvedValue({ ...poFixture, status: 'PARTIALLY_DELIVERED' });
    mockRepo.createDelivery.mockResolvedValue({ delivery: deliveryRow, items: deliveryItems });
    mockRepo.findLineItemsByPo.mockResolvedValue(lineItemFixtures);
    mockRepo.sumDeliveredQuantity.mockResolvedValue('10.0000');
    const result = await service.recordDelivery({
      po_id: 'po-uuid-001',
      delivered_at: deliveredAt,
      items: [{ line_id: 'line-uuid-001', quantity_received: '5.0000' }],
    });
    expect(result.is_partial).toBe(false);
  });

  it('exact repo payload, signal, Kafka event, and log for a mixed partial delivery', async () => {
    // Two line items: one fully delivered, one not — is_partial must be true.
    // (Kills every→some mutation: some(Boolean) would be true here.)
    mockRepo.findPoById.mockResolvedValue({ ...poFixture, status: 'ACKNOWLEDGED' });
    mockRepo.createDelivery.mockResolvedValue({ delivery: deliveryRow, items: deliveryItems });
    mockRepo.findLineItemsByPo.mockResolvedValue([
      lineItemFixtures[0]!,
      { ...lineItemFixtures[0]!, line_id: 'line-uuid-002', quantity: '4.0000' },
    ]);
    mockRepo.sumDeliveredQuantity.mockImplementation(async (lineId: string) =>
      lineId === 'line-uuid-001' ? '10.0000' : '1.0000',
    );

    const result = await service.recordDelivery({
      po_id: 'po-uuid-001',
      delivered_at: deliveredAt,
      items: [{ line_id: 'line-uuid-001', quantity_received: '5.0000' }],
    });

    expect(result.is_partial).toBe(true);
    expect(mockRepo.createDelivery).toHaveBeenCalledWith({
      po_id: 'po-uuid-001',
      delivery_note: undefined,
      delivered_at: deliveredAt,
      received_by: 'user-uuid-001',
      notes: undefined,
      items: [{ line_id: 'line-uuid-001', quantity_received: '5.0000' }],
    });
    expect(mockWorkflowSignal).toHaveBeenCalledWith(recordDeliverySignal, {
      delivery_id: 'delivery-uuid-001',
      is_partial: true,
    });
    expect(mockKafkaPublish).toHaveBeenCalledWith({
      event_type: 'procurement.delivery.received.v1',
      event_version: '1.0',
      tenant_id: 'tenant-uuid-001',
      actor_id: 'user-uuid-001',
      occurred_at: expect.any(String),
      correlation_id: expect.any(String),
      payload: {
        delivery_id: 'delivery-uuid-001',
        po_id: 'po-uuid-001',
        project_id: 'project-uuid-001',
        vendor_id: 'vendor-uuid-001',
        received_by: 'user-uuid-001',
        received_at: deliveredAt,
        items_received: [{ item_id: 'line-uuid-001', quantity_received: '5.0000' }],
        partial: true,
      },
    });
    expect(loggerMock.info).toHaveBeenCalledWith(
      {
        delivery_id: 'delivery-uuid-001',
        po_id: 'po-uuid-001',
        is_partial: true,
        tenant_id: 'tenant-uuid-001',
      },
      'delivery.recorded',
    );
  });
});

describe('exact contracts — invoices', () => {
  const invoiceRow = {
    invoice_id: 'inv-uuid-001',
    po_id: 'po-uuid-001',
    vendor_id: 'vendor-uuid-001',
    tenant_id: 'tenant-uuid-001',
    invoice_number: 'INV-001',
    amount: '60000.0000',
    currency_code: 'THB',
    invoice_date: new Date('2026-09-05'),
    due_date: new Date('2026-09-20T00:00:00.000Z'),
    status: 'RECEIVED' as const,
    file_id: null,
    created_at: new Date(),
    updated_at: new Date(),
  };

  it('receiveInvoice — exact repo payload, signal, Kafka event, and log', async () => {
    mockRepo.findPoById.mockResolvedValue({ ...poFixture, status: 'FULLY_DELIVERED' });
    mockRepo.createInvoice.mockResolvedValue(invoiceRow);
    await service.receiveInvoice({
      po_id: 'po-uuid-001',
      invoice_number: 'INV-001',
      amount: '60000.0000',
      currency_code: 'THB',
      invoice_date: '2026-09-05',
      due_date: '2026-09-20',
    });
    expect(mockRepo.createInvoice).toHaveBeenCalledWith({
      po_id: 'po-uuid-001',
      vendor_id: 'vendor-uuid-001',
      invoice_number: 'INV-001',
      amount: '60000.0000',
      currency_code: 'THB',
      invoice_date: '2026-09-05',
      due_date: '2026-09-20',
      file_id: undefined,
    });
    expect(mockWorkflowSignal).toHaveBeenCalledWith(receiveInvoiceSignal, {
      invoice_id: 'inv-uuid-001',
    });
    expect(mockKafkaPublish).toHaveBeenCalledWith({
      event_type: 'procurement.invoice.received.v1',
      event_version: '1.0',
      tenant_id: 'tenant-uuid-001',
      actor_id: 'user-uuid-001',
      occurred_at: expect.any(String),
      correlation_id: expect.any(String),
      payload: {
        invoice_id: 'inv-uuid-001',
        po_id: 'po-uuid-001',
        project_id: 'project-uuid-001',
        vendor_id: 'vendor-uuid-001',
        amount: { amount: '60000.0000', currency_code: 'THB' },
        invoice_date: '2026-09-05',
        due_date: '2026-09-20',
      },
    });
    expect(loggerMock.info).toHaveBeenCalledWith(
      { invoice_id: 'inv-uuid-001', po_id: 'po-uuid-001', tenant_id: 'tenant-uuid-001' },
      'invoice.received',
    );

    mockRepo.findPoById.mockResolvedValue({ ...poFixture, status: 'INVOICED' });
    await expect(
      service.receiveInvoice({
        po_id: 'po-uuid-001',
        invoice_number: 'INV-001',
        amount: '60000.0000',
        currency_code: 'THB',
        invoice_date: '2026-09-05',
        due_date: '2026-09-20',
      }),
    ).rejects.toThrow('PO po-uuid-001 must be FULLY_DELIVERED (current: INVOICED)');
  });

  it('approveInvoice — exact status update, Kafka event (date-only payment_due), and log', async () => {
    mockRepo.findInvoiceById.mockResolvedValue(invoiceRow);
    mockRepo.updateInvoiceStatus.mockResolvedValue(undefined);
    mockRepo.findPoById.mockResolvedValue(poFixture);
    await service.approveInvoice('inv-uuid-001');
    expect(mockRepo.updateInvoiceStatus).toHaveBeenCalledWith('inv-uuid-001', 'APPROVED');
    expect(mockKafkaPublish).toHaveBeenCalledWith({
      event_type: 'procurement.vendor_invoice.approved.v1',
      event_version: '1.0',
      tenant_id: 'tenant-uuid-001',
      actor_id: 'user-uuid-001',
      occurred_at: expect.any(String),
      correlation_id: expect.any(String),
      payload: {
        invoice_id: 'inv-uuid-001',
        po_id: 'po-uuid-001',
        project_id: 'project-uuid-001',
        vendor_id: 'vendor-uuid-001',
        amount: { amount: '60000.0000', currency_code: 'THB' },
        approved_by: 'user-uuid-001',
        approved_at: expect.any(String),
        payment_due: '2026-09-20',
      },
    });
    expect(loggerMock.info).toHaveBeenCalledWith(
      { invoice_id: 'inv-uuid-001', po_id: 'po-uuid-001', actor_id: 'user-uuid-001' },
      'invoice.approved',
    );
  });

  it('approveInvoice — accepts a VERIFIED invoice', async () => {
    mockRepo.findInvoiceById.mockResolvedValue({ ...invoiceRow, status: 'VERIFIED' });
    mockRepo.updateInvoiceStatus.mockResolvedValue(undefined);
    mockRepo.findPoById.mockResolvedValue(poFixture);
    const result = await service.approveInvoice('inv-uuid-001');
    expect(result.status).toBe('APPROVED');
  });

  it('approveInvoice — publishes empty project_id when PO lookup fails', async () => {
    mockRepo.findInvoiceById.mockResolvedValue(invoiceRow);
    mockRepo.updateInvoiceStatus.mockResolvedValue(undefined);
    mockRepo.findPoById.mockResolvedValue(null);
    await service.approveInvoice('inv-uuid-001');
    expect(mockKafkaPublish).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ project_id: '' }),
      }),
    );
  });

  it('approveInvoice — exact not-found and wrong-status messages', async () => {
    mockRepo.findInvoiceById.mockResolvedValue(null);
    await expect(service.approveInvoice('missing')).rejects.toThrow('Invoice missing not found');

    mockRepo.findInvoiceById.mockResolvedValue({ ...invoiceRow, status: 'APPROVED' });
    await expect(service.approveInvoice('inv-uuid-001')).rejects.toThrow(
      'Invoice inv-uuid-001 must be RECEIVED or VERIFIED to approve (current: APPROVED)',
    );
  });
});
