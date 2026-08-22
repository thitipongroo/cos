// Unit tests — CRM Service
jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { REQUEST } from '@nestjs/core';
import { CrmService } from '../crm.service';
import { CrmRepository } from '../crm.repository';

const mockRepo = {
  createLead: jest.fn(),
  listLeads: jest.fn(),
  findLeadById: jest.fn(),
  setLeadStatus: jest.fn(),
  createOpportunity: jest.fn(),
  listOpportunities: jest.fn(),
  findOpportunityById: jest.fn(),
  setOpportunityStatus: jest.fn(),
  createContact: jest.fn(),
  listContacts: jest.fn(),
  createCustomerFromOpportunity: jest.fn(),
  listCustomers: jest.fn(),
};

let service: CrmService;

beforeEach(async () => {
  jest.clearAllMocks();
  const moduleRef: TestingModule = await Test.createTestingModule({
    providers: [
      CrmService,
      { provide: CrmRepository, useValue: mockRepo },
      { provide: REQUEST, useValue: { userId: 'user-1' } },
    ],
  }).compile();
  service = await moduleRef.resolve<CrmService>(CrmService);
});

it('constructor tolerates missing request context', async () => {
  const m = await Test.createTestingModule({
    providers: [
      CrmService,
      { provide: CrmRepository, useValue: mockRepo },
      { provide: REQUEST, useValue: {} },
    ],
  }).compile();
  const svc = await m.resolve<CrmService>(CrmService);
  expect(svc).toBeDefined();
  // Invoke the lazy getter — constructing the service alone does NOT exercise the
  // `|| clsUserId()` fallback branch (context.md QM-1; ADR-031).
  expect((svc as unknown as { userId: string }).userId).toBe('');
});

it('createLead sets created_by (all fields); listLeads delegates', async () => {
  mockRepo.createLead.mockResolvedValue({ lead_id: 'lead-1' });
  await service.createLead({
    contact_name: 'A',
    company: 'Co',
    source: 'web',
    assigned_to: 'u1',
  } as never);
  expect(mockRepo.createLead).toHaveBeenCalledWith(
    expect.objectContaining({ created_by: 'user-1', contact_name: 'A', source: 'web' }),
  );
  await service.createLead({} as never); // null branches
  mockRepo.listLeads.mockResolvedValue([{ lead_id: 'lead-1' }]);
  expect(await service.listLeads('NEW')).toHaveLength(1);
});

describe('createOpportunity', () => {
  it('creates and qualifies the lead', async () => {
    mockRepo.findLeadById.mockResolvedValue({ lead_id: 'lead-1' });
    mockRepo.createOpportunity.mockResolvedValue({ opportunity_id: 'opp-1' });
    await service.createOpportunity({ lead_id: 'lead-1', title: 'Deal' } as never);
    expect(mockRepo.setLeadStatus).toHaveBeenCalledWith('lead-1', 'QUALIFIED');
  });

  it('throws NotFound when lead missing', async () => {
    mockRepo.findLeadById.mockResolvedValue(null);
    await expect(
      service.createOpportunity({ lead_id: 'x', title: 'Deal' } as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

it('listOpportunities + listContacts + listCustomers delegate', async () => {
  mockRepo.listOpportunities.mockResolvedValue([{ opportunity_id: 'opp-1' }]);
  mockRepo.listContacts.mockResolvedValue([{ contact_id: 'c-1' }]);
  mockRepo.listCustomers.mockResolvedValue([{ customer_id: 'cust-1' }]);
  expect(await service.listOpportunities()).toHaveLength(1);
  expect(await service.listContacts('lead-1')).toHaveLength(1);
  expect(await service.listCustomers()).toHaveLength(1);
});

describe('convertOpportunity', () => {
  it('wins opportunity and creates customer (company from lead)', async () => {
    mockRepo.findOpportunityById.mockResolvedValue({
      opportunity_id: 'opp-1',
      lead_id: 'lead-1',
      title: 'Deal',
      status: 'OPEN',
    });
    mockRepo.findLeadById.mockResolvedValue({ lead_id: 'lead-1', company: 'Acme' });
    mockRepo.createCustomerFromOpportunity.mockResolvedValue({ customer_id: 'cust-1' });
    const r = await service.convertOpportunity('opp-1');
    expect(mockRepo.setOpportunityStatus).toHaveBeenCalledWith('opp-1', 'WON');
    expect(mockRepo.createCustomerFromOpportunity).toHaveBeenCalledWith({
      opportunity_id: 'opp-1',
      company_name: 'Acme',
    });
    expect(r.customer_id).toBe('cust-1');
  });

  it('falls back to opportunity title when lead has no company', async () => {
    mockRepo.findOpportunityById.mockResolvedValue({
      opportunity_id: 'opp-1',
      lead_id: 'lead-1',
      title: 'Deal',
      status: 'OPEN',
    });
    mockRepo.findLeadById.mockResolvedValue(null);
    mockRepo.createCustomerFromOpportunity.mockResolvedValue({ customer_id: 'cust-1' });
    await service.convertOpportunity('opp-1');
    expect(mockRepo.createCustomerFromOpportunity).toHaveBeenCalledWith({
      opportunity_id: 'opp-1',
      company_name: 'Deal',
    });
  });

  it('throws NotFound when opportunity missing', async () => {
    mockRepo.findOpportunityById.mockResolvedValue(null);
    await expect(service.convertOpportunity('x')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws Unprocessable when already WON', async () => {
    mockRepo.findOpportunityById.mockResolvedValue({ opportunity_id: 'opp-1', status: 'WON' });
    await expect(service.convertOpportunity('opp-1')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });
});

describe('createContact', () => {
  it('creates when lead exists', async () => {
    mockRepo.findLeadById.mockResolvedValue({ lead_id: 'lead-1' });
    mockRepo.createContact.mockResolvedValue({ contact_id: 'c-1' });
    expect(
      (await service.createContact({ lead_id: 'lead-1', name: 'B' } as never)).contact_id,
    ).toBe('c-1');
  });

  it('throws NotFound when lead missing', async () => {
    mockRepo.findLeadById.mockResolvedValue(null);
    await expect(
      service.createContact({ lead_id: 'x', name: 'B' } as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
