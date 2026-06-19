// Unit tests — CRM Controller
import { CrmController } from '../crm.controller';

const mockSvc = {
  createLead: jest.fn(),
  listLeads: jest.fn(),
  createOpportunity: jest.fn(),
  listOpportunities: jest.fn(),
  convertOpportunity: jest.fn(),
  createContact: jest.fn(),
  listContacts: jest.fn(),
  listCustomers: jest.fn(),
};

describe('CrmController', () => {
  let ctrl: CrmController;

  beforeEach(() => {
    jest.clearAllMocks();
    ctrl = new CrmController(mockSvc as never);
  });

  it('createLead delegates', () => {
    const dto = { company: 'Co' };
    ctrl.createLead(dto as never);
    expect(mockSvc.createLead).toHaveBeenCalledWith(dto);
  });

  it('listLeads delegates with status', () => {
    ctrl.listLeads('NEW');
    expect(mockSvc.listLeads).toHaveBeenCalledWith('NEW');
  });

  it('createOpportunity delegates', () => {
    const dto = { lead_id: 'l1', title: 'Deal' };
    ctrl.createOpportunity(dto as never);
    expect(mockSvc.createOpportunity).toHaveBeenCalledWith(dto);
  });

  it('listOpportunities delegates with status', () => {
    ctrl.listOpportunities('OPEN');
    expect(mockSvc.listOpportunities).toHaveBeenCalledWith('OPEN');
  });

  it('convert delegates', () => {
    ctrl.convert('opp-1');
    expect(mockSvc.convertOpportunity).toHaveBeenCalledWith('opp-1');
  });

  it('createContact delegates', () => {
    const dto = { lead_id: 'l1', name: 'B' };
    ctrl.createContact(dto as never);
    expect(mockSvc.createContact).toHaveBeenCalledWith(dto);
  });

  it('listContacts delegates with leadId', () => {
    ctrl.listContacts('l1');
    expect(mockSvc.listContacts).toHaveBeenCalledWith('l1');
  });

  it('listCustomers delegates', () => {
    ctrl.listCustomers();
    expect(mockSvc.listCustomers).toHaveBeenCalled();
  });
});
