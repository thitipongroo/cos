import { vendorInvoicesQuery } from '../vendorInvoicesQuery';

// Plan DC: the payments page asks for the chosen project's invoices only.
describe('vendorInvoicesQuery', () => {
  it('asks for 100, with no filter by default', () => {
    expect(vendorInvoicesQuery('')).toBe('limit=100');
  });

  it('adds the status and the project when given', () => {
    expect(vendorInvoicesQuery('APPROVED', 'p-1')).toBe('limit=100&status=APPROVED&project_id=p-1');
    expect(vendorInvoicesQuery('', 'p-1')).toBe('limit=100&project_id=p-1');
  });
});
