jest.mock('../client', () => ({
  get: jest.fn(),
  post: jest.fn(),
  patch: jest.fn(),
}));

import {
  listLeads,
  createLead,
  listOpportunities,
  createOpportunity,
  convertOpportunity,
  listCustomers,
} from '../crm';
import { get, post, patch } from '../client';

const mockGet = get as jest.Mock;
const mockPost = post as jest.Mock;
const mockPatch = patch as jest.Mock;

describe('CRM API (§20.7.10)', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('leads', () => {
    it('lists without a status filter by default', async () => {
      mockGet.mockResolvedValue([]);
      await listLeads();
      // `undefined`, not `{}` — an empty params object would still append "?" on some clients.
      expect(mockGet).toHaveBeenCalledWith('/crm/leads', undefined);
    });

    it('passes the status filter through when given', async () => {
      mockGet.mockResolvedValue([]);
      await listLeads('QUALIFIED');
      expect(mockGet).toHaveBeenCalledWith('/crm/leads', { status: 'QUALIFIED' });
    });

    it('returns the rows unchanged', async () => {
      const rows = [{ lead_id: 'l1', company: 'Ekachai', status: 'NEW' }];
      mockGet.mockResolvedValue(rows);
      await expect(listLeads()).resolves.toEqual(rows);
    });

    it('creates a lead with only the fields supplied', async () => {
      mockPost.mockResolvedValue({ lead_id: 'l1' });
      await createLead({ company: 'Ekachai' });
      expect(mockPost).toHaveBeenCalledWith('/crm/leads', { company: 'Ekachai' });
    });
  });

  describe('opportunities', () => {
    it('lists without a filter by default', async () => {
      mockGet.mockResolvedValue([]);
      await listOpportunities();
      expect(mockGet).toHaveBeenCalledWith('/crm/opportunities', undefined);
    });

    it('passes the status filter through when given', async () => {
      mockGet.mockResolvedValue([]);
      await listOpportunities('OPEN');
      expect(mockGet).toHaveBeenCalledWith('/crm/opportunities', { status: 'OPEN' });
    });

    it('creates from a lead, sending lead_id and title', async () => {
      mockPost.mockResolvedValue({ opportunity_id: 'o1' });
      await createOpportunity({ lead_id: 'l1', title: 'Tower B fit-out' });
      expect(mockPost).toHaveBeenCalledWith('/crm/opportunities', {
        lead_id: 'l1',
        title: 'Tower B fit-out',
      });
    });

    // `value` is DECIMAL end-to-end (§14). A number here would lose precision on large contract
    // values, so the client must forward the caller's string untouched.
    it('forwards value as a string, never a number', async () => {
      mockPost.mockResolvedValue({ opportunity_id: 'o1' });
      await createOpportunity({ lead_id: 'l1', title: 'T', value: '12500000.50' });
      const [, body] = mockPost.mock.calls[0] as [string, { value: unknown }];
      expect(body.value).toBe('12500000.50');
      expect(typeof body.value).toBe('string');
    });
  });

  describe('convert', () => {
    it('PATCHes the convert route for the given opportunity', async () => {
      mockPatch.mockResolvedValue({ customer_id: 'c1' });
      await convertOpportunity('o1');
      expect(mockPatch).toHaveBeenCalledWith('/crm/opportunities/o1/convert', {});
    });

    it('returns the created customer', async () => {
      mockPatch.mockResolvedValue({ customer_id: 'c1', company_name: 'Ekachai' });
      await expect(convertOpportunity('o1')).resolves.toEqual({
        customer_id: 'c1',
        company_name: 'Ekachai',
      });
    });

    // Converting twice is COS-CRM-003 server-side. The client must surface that, not swallow it —
    // the screen relies on the rejection to leave the row's status alone.
    it('propagates a rejection rather than swallowing it', async () => {
      mockPatch.mockRejectedValue(new Error('COS-CRM-003'));
      await expect(convertOpportunity('o1')).rejects.toThrow('COS-CRM-003');
    });
  });

  describe('customers', () => {
    it('reads finance.customers via the CRM route', async () => {
      mockGet.mockResolvedValue([]);
      await listCustomers();
      expect(mockGet).toHaveBeenCalledWith('/crm/customers');
    });
  });
});
