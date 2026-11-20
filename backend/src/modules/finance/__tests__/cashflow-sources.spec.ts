import { unpaidBillingsDue } from '../cashflow-sources';

// Plan DG: one query for the forecast and the risk sweep — what remains on each ISSUED billing.
describe('unpaidBillingsDue', () => {
  it("reads each ISSUED billing's amount less its receipts, tenant-filtered on both tables", async () => {
    const rows = [{ due_date: new Date(), amount: '600.0000' }];
    const $queryRaw = jest.fn().mockResolvedValue(rows);
    expect(await unpaidBillingsDue({ $queryRaw } as never, 'ten-1', 'proj-1')).toBe(rows);
    const [strings, ...values] = $queryRaw.mock.calls[0] as [string[], ...unknown[]];
    const sql = strings.join('?').replace(/\s+/g, ' ');
    expect(sql).toContain('(b.amount - COALESCE(SUM(r.amount_received), 0))');
    expect(sql).toContain(
      'LEFT JOIN finance.ar_receipts r ON r.billing_id = b.billing_id AND r.tenant_id = b.tenant_id',
    );
    expect(sql).toContain("AND b.status = 'ISSUED'");
    expect(sql).toContain('HAVING b.amount - COALESCE(SUM(r.amount_received), 0) > 0');
    expect(values).toEqual(['ten-1', 'proj-1']);
  });
});
