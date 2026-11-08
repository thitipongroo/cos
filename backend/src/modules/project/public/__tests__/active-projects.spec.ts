import { ACTIVE_PROJECT_STATUSES, countActiveProjects } from '../active-projects';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';

describe('countActiveProjects', () => {
  it('counts the tenant’s DRAFT / ACTIVE / ON_HOLD projects in the caller’s transaction', async () => {
    const tx = { $queryRaw: jest.fn().mockResolvedValue([{ active: 4 }]) };
    await expect(countActiveProjects(tx as never, TENANT_ID)).resolves.toBe(4);

    const [strings, ...values] = tx.$queryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    const sql = strings.join('?');
    expect(sql).toContain('FROM projects.projects');
    expect(sql).toContain('tenant_id = ?::uuid');
    expect(values).toEqual([TENANT_ID]);
    // The SQL's static list and the exported constant are one rule.
    expect(sql).toContain(`IN (${ACTIVE_PROJECT_STATUSES.map((s) => `'${s}'`).join(', ')})`);
  });

  it('never counts COMPLETED or CANCELLED projects', () => {
    expect(ACTIVE_PROJECT_STATUSES).toEqual(['DRAFT', 'ACTIVE', 'ON_HOLD']);
  });
});
