import { VendorPortalRepository } from '../vendor-portal.repository';

describe('VendorPortalRepository', () => {
  let repo: VendorPortalRepository;
  let queryRaw: jest.Mock;
  let executeRaw: jest.Mock;

  beforeEach(() => {
    queryRaw = jest.fn();
    executeRaw = jest.fn();
    const tx = { $queryRaw: queryRaw, $executeRaw: executeRaw };
    const db = { run: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)) };
    repo = new VendorPortalRepository(db as never, { tenantId: 'ten-1' });
  });

  it('createInvitation returns the inserted row', async () => {
    const row = { invitation_id: 'inv-1' };
    queryRaw.mockResolvedValue([row]);
    const result = await repo.createInvitation({
      invitationId: 'inv-1',
      rfqId: 'rfq-1',
      vendorIdentityId: 'vid-1',
      invitedEmail: 'a@b.co',
      tokenHash: 'hash',
      expiresAt: new Date(),
    });
    expect(result).toBe(row);
  });

  it('findInvitation returns the row or null', async () => {
    queryRaw.mockResolvedValueOnce([{ invitation_id: 'inv-1' }]);
    expect(await repo.findInvitation('inv-1')).toEqual({ invitation_id: 'inv-1' });
    queryRaw.mockResolvedValueOnce([]);
    expect(await repo.findInvitation('inv-1')).toBeNull();
  });

  it('markInvitationResponded runs an update', async () => {
    executeRaw.mockResolvedValue(1);
    await repo.markInvitationResponded('inv-1');
    expect(executeRaw).toHaveBeenCalled();
  });

  it('findRfq returns the row or null', async () => {
    queryRaw.mockResolvedValueOnce([{ rfq_id: 'rfq-1' }]);
    expect(await repo.findRfq('rfq-1')).toEqual({ rfq_id: 'rfq-1' });
    queryRaw.mockResolvedValueOnce([]);
    expect(await repo.findRfq('rfq-1')).toBeNull();
  });

  it('createQuotation returns the inserted row', async () => {
    const row = { quotation_id: 'q-1' };
    queryRaw.mockResolvedValue([row]);
    expect(
      await repo.createQuotation({
        rfqId: 'rfq-1',
        vendorId: 'ven-1',
        totalAmount: '100.00',
        currencyCode: 'THB',
        validityDays: 30,
      }),
    ).toBe(row);
  });

  it('listPurchaseOrdersByVendor returns rows', async () => {
    const rows = [{ po_id: 'po-1' }];
    queryRaw.mockResolvedValue(rows);
    expect(await repo.listPurchaseOrdersByVendor('ven-1')).toBe(rows);
  });

  it('createInvoice returns the inserted row', async () => {
    const row = { invoice_id: 'i-1' };
    queryRaw.mockResolvedValue([row]);
    expect(
      await repo.createInvoice({
        poId: 'po-1',
        vendorId: 'ven-1',
        invoiceNumber: 'INV-1',
        amount: '100.00',
        currencyCode: 'THB',
        invoiceDate: '2026-06-20',
        dueDate: '2026-07-20',
      }),
    ).toBe(row);
  });

  it('listInvoicesByVendor returns rows', async () => {
    const rows = [{ invoice_id: 'i-1' }];
    queryRaw.mockResolvedValue(rows);
    expect(await repo.listInvoicesByVendor('ven-1')).toBe(rows);
  });

  it('defaults tenantId to empty string when request has none', () => {
    const r = new VendorPortalRepository({ run: jest.fn() } as never, {});
    expect(r).toBeInstanceOf(VendorPortalRepository);
    expect((r as unknown as { tenantId: string }).tenantId).toBe('');
  });
});
