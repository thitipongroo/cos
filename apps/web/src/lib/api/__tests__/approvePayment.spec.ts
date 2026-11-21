// Plan DT: approving a payment may make its invoice PAID, so the approval refreshes the invoice lists as well as the
// payments — otherwise the payments page's picker keeps offering the paid invoice. No component tests run here
// (node environment), so the wiring is read from the source.
describe('useApprovePayment (plan DT)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readFileSync } = require('node:fs') as typeof import('node:fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { join } = require('node:path') as typeof import('node:path');

  it('invalidates the payments and the finance invoice lists on success', () => {
    const src = readFileSync(join(__dirname, '../queries.ts'), 'utf8');
    const hook = src.slice(src.indexOf('export function useApprovePayment'));
    const body = hook.slice(0, hook.indexOf('\nexport function'));
    expect(body).toContain("qc.invalidateQueries({ queryKey: ['payments'] })");
    expect(body).toContain("qc.invalidateQueries({ queryKey: ['finance', 'invoices'] })");
  });
});
