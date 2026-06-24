// Unit tests — CRM Repository
import { Test, TestingModule } from '@nestjs/testing';
import { REQUEST } from '@nestjs/core';
import { CrmRepository } from '../crm.repository';
import { TenantPrismaService } from '../../tenant/prisma/tenant-prisma.service';

const mockPrisma = { $queryRaw: jest.fn(), $executeRaw: jest.fn() };
const mockTenantPrisma = {
  run: jest.fn((fn: (p: typeof mockPrisma) => unknown) => fn(mockPrisma)),
};

const lead = { lead_id: 'lead-1', tenant_id: 'tenant-1', status: 'NEW' };
const opp = { opportunity_id: 'opp-1', tenant_id: 'tenant-1', lead_id: 'lead-1', status: 'OPEN' };
const contact = { contact_id: 'c-1', tenant_id: 'tenant-1', lead_id: 'lead-1' };
const customer = { customer_id: 'cust-1', tenant_id: 'tenant-1', opportunity_id: 'opp-1' };

describe('CrmRepository', () => {
  let repo: CrmRepository;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        CrmRepository,
        { provide: TenantPrismaService, useValue: mockTenantPrisma },
        { provide: REQUEST, useValue: { tenantId: 'tenant-1' } },
      ],
    }).compile();
    repo = await moduleRef.resolve<CrmRepository>(CrmRepository);
  });

  it('uses empty string tenantId when request has none', async () => {
    const m = await Test.createTestingModule({
      providers: [
        CrmRepository,
        { provide: TenantPrismaService, useValue: mockTenantPrisma },
        { provide: REQUEST, useValue: {} },
      ],
    }).compile();
    const noCtx = await m.resolve<CrmRepository>(CrmRepository);
    expect(noCtx).toBeDefined();
    expect((noCtx as unknown as { tenantId: string }).tenantId).toBe('');
  });

  it('createLead with all fields and with none (null branches)', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([lead]);
    expect(
      (
        await repo.createLead({
          contact_name: 'A',
          company: 'Co',
          source: 'web',
          assigned_to: 'u1',
          created_by: 'u1',
        })
      ).lead_id,
    ).toBe('lead-1');
    expect((await repo.createLead({ created_by: 'u1' })).lead_id).toBe('lead-1');
  });

  it('listLeads with and without status', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([lead]);
    expect(await repo.listLeads('NEW')).toHaveLength(1);
    expect(await repo.listLeads()).toHaveLength(1);
  });

  it('findLeadById returns row then null', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([lead]);
    expect((await repo.findLeadById('lead-1'))?.lead_id).toBe('lead-1');
    mockPrisma.$queryRaw.mockResolvedValueOnce([]);
    expect(await repo.findLeadById('x')).toBeNull();
  });

  it('setLeadStatus executes update', async () => {
    mockPrisma.$executeRaw.mockResolvedValue(1);
    await repo.setLeadStatus('lead-1', 'QUALIFIED');
    expect(mockPrisma.$executeRaw).toHaveBeenCalled();
  });

  it('createOpportunity with all fields and with none', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([opp]);
    expect(
      (
        await repo.createOpportunity({
          lead_id: 'lead-1',
          title: 'Deal',
          value: '100000.0000',
          expected_close_date: '2026-09-30',
          assigned_to: 'u1',
          created_by: 'u1',
        })
      ).opportunity_id,
    ).toBe('opp-1');
    expect(
      (await repo.createOpportunity({ lead_id: 'lead-1', title: 'Deal', created_by: 'u1' }))
        .opportunity_id,
    ).toBe('opp-1');
  });

  it('listOpportunities with and without status', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([opp]);
    expect(await repo.listOpportunities('OPEN')).toHaveLength(1);
    expect(await repo.listOpportunities()).toHaveLength(1);
  });

  it('findOpportunityById returns row then null', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([opp]);
    expect((await repo.findOpportunityById('opp-1'))?.opportunity_id).toBe('opp-1');
    mockPrisma.$queryRaw.mockResolvedValueOnce([]);
    expect(await repo.findOpportunityById('x')).toBeNull();
  });

  it('setOpportunityStatus executes update', async () => {
    mockPrisma.$executeRaw.mockResolvedValue(1);
    await repo.setOpportunityStatus('opp-1', 'WON');
    expect(mockPrisma.$executeRaw).toHaveBeenCalled();
  });

  it('createContact with all fields and with none', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([contact]);
    expect(
      (
        await repo.createContact({
          lead_id: 'lead-1',
          name: 'B',
          email: 'b@x.co',
          phone: '123',
          role: 'PM',
          created_by: 'u1',
        })
      ).contact_id,
    ).toBe('c-1');
    expect(
      (await repo.createContact({ lead_id: 'lead-1', name: 'B', created_by: 'u1' })).contact_id,
    ).toBe('c-1');
  });

  it('listContacts with and without leadId', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([contact]);
    expect(await repo.listContacts('lead-1')).toHaveLength(1);
    expect(await repo.listContacts()).toHaveLength(1);
  });

  it('createCustomerFromOpportunity inserts into finance.customers', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([customer]);
    expect(
      (await repo.createCustomerFromOpportunity({ opportunity_id: 'opp-1', company_name: 'Co' }))
        .customer_id,
    ).toBe('cust-1');
  });

  it('listCustomers returns rows', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([customer]);
    expect(await repo.listCustomers()).toHaveLength(1);
  });
});
