// Unit tests for TenantAuditLogController and AdminAuditLogController — delegation, the export
// headers, and the CSV / JSON choice. The reads and their auditing are AdminAuditLogService's.

const mockAuditLogs = {
  listTenantAuditLogs: jest.fn(),
  exportTenantAuditLogs: jest.fn(),
  listAuditLogs: jest.fn(),
  summarizeAuditLogs: jest.fn(),
  exportAuditLogs: jest.fn(),
};

import { TenantAuditLogController } from '../tenant-audit-log.controller';
import { AdminAuditLogController } from '../admin-audit-log.controller';
import type { AuditLogRow } from '../admin-audit-log.service';

const TENANT = '11111111-1111-4111-8111-111111111111';
const HOME = '22222222-2222-4222-8222-222222222222';
const ACTOR = '33333333-3333-4333-8333-333333333333';

const row = {
  log_id: 'l1',
  occurred_at: '2026-09-15T10:00:00.000Z',
  tenant_id: TENANT,
  tenant_code: 'acme',
  tenant_name: 'ACME',
  action: 'tenant.deactivate',
  resource_type: 'tenant',
  resource_id: TENANT,
  actor_id: ACTOR,
  actor_email: 'ops@example.com',
  actor_name: 'Operator',
  ip_address: null,
  user_agent: null,
  justification: '=cmd',
  metadata: { justification: '=cmd' },
} satisfies AuditLogRow;

function fakeRes() {
  const headers: Record<string, string> = {};
  return {
    headers,
    res: { header: jest.fn((k: string, v: string) => (headers[k] = v)) } as never,
  };
}

describe('TenantAuditLogController', () => {
  let controller: TenantAuditLogController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new TenantAuditLogController(mockAuditLogs as never);
  });

  it('list passes the tenant, the actor and the paging', async () => {
    const page = { rows: [], next_cursor: null, summary: { total_30d: 0 } };
    mockAuditLogs.listTenantAuditLogs.mockResolvedValue(page);
    const out = await controller.list(TENANT, { cursor: 'c', limit: 10, q: 'x' }, {
      userId: ACTOR,
    } as never);
    expect(out).toBe(page);
    expect(mockAuditLogs.listTenantAuditLogs).toHaveBeenCalledWith(TENANT, ACTOR, {
      cursor: 'c',
      limit: 10,
      q: 'x',
    });
  });

  it('list passes an empty actor when the request has none (the service refuses it)', async () => {
    await controller.list(TENANT, {}, {} as never);
    expect(mockAuditLogs.listTenantAuditLogs).toHaveBeenCalledWith(TENANT, '', {
      cursor: undefined,
      limit: undefined,
      q: undefined,
    });
  });

  it('exportCsv returns injection-safe CSV as an attachment with the cap headers', async () => {
    mockAuditLogs.exportTenantAuditLogs.mockResolvedValue({
      rows: [row],
      row_cap: 50_000,
      truncated: true,
    });
    const { headers, res } = fakeRes();
    const csv = await controller.exportCsv(TENANT, { q: 'x' }, { userId: ACTOR } as never, res);

    expect(mockAuditLogs.exportTenantAuditLogs).toHaveBeenCalledWith(TENANT, ACTOR, { q: 'x' });
    expect(headers).toEqual({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="audit-log-${TENANT}.csv"`,
      'X-Export-Row-Cap': '50000',
      'X-Export-Truncated': 'true',
    });
    const [head, line] = csv.split('\r\n');
    expect(head).toBe(
      'occurred_at,log_id,tenant_id,tenant_code,tenant_name,action,resource_type,resource_id,' +
        'actor_id,actor_email,actor_name,ip_address,user_agent,justification,metadata',
    );
    // The formula-triggering justification is neutralised; metadata goes out as quoted JSON.
    expect(line).toContain(`,,,"'=cmd","{""justification"":""=cmd""}"`);
  });

  it('exportCsv passes an empty actor when the request has none', async () => {
    mockAuditLogs.exportTenantAuditLogs.mockResolvedValue({
      rows: [],
      row_cap: 1,
      truncated: false,
    });
    await controller.exportCsv(TENANT, {}, {} as never, fakeRes().res);
    expect(mockAuditLogs.exportTenantAuditLogs).toHaveBeenCalledWith(TENANT, '', { q: undefined });
  });
});

describe('AdminAuditLogController', () => {
  let controller: AdminAuditLogController;
  const filters = {
    tenantId: TENANT,
    actorId: ACTOR,
    action: 'tenant.',
    from: '2026-09-01',
    to: '2026-09-15',
    q: 'ops',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AdminAuditLogController(mockAuditLogs as never);
    mockAuditLogs.exportAuditLogs.mockResolvedValue({
      rows: [row],
      row_cap: 50_000,
      truncated: false,
    });
  });

  it('list passes the caller`s tenant, the actor, every filter and the paging', async () => {
    const page = { rows: [], next_cursor: null };
    mockAuditLogs.listAuditLogs.mockResolvedValue(page);
    const out = await controller.list({ ...filters, cursor: 'c', limit: 20 }, {
      tenantId: HOME,
      userId: ACTOR,
    } as never);
    expect(out).toBe(page);
    expect(mockAuditLogs.listAuditLogs).toHaveBeenCalledWith(HOME, ACTOR, {
      ...filters,
      cursor: 'c',
      limit: 20,
    });
  });

  it('list passes empty identity when the request carries none (the service refuses it)', async () => {
    await controller.list({}, {} as never);
    expect(mockAuditLogs.listAuditLogs).toHaveBeenCalledWith('', '', expect.any(Object));
  });

  it('summary passes the window', async () => {
    const counts = { total: 1, today: 1, with_justification: 0, privileged: 0, privileged_7d: 0 };
    mockAuditLogs.summarizeAuditLogs.mockResolvedValue(counts);
    expect(
      await controller.summary({ from: '2026-09-01', to: '2026-09-02' }, {
        tenantId: HOME,
        userId: ACTOR,
      } as never),
    ).toBe(counts);
    expect(mockAuditLogs.summarizeAuditLogs).toHaveBeenCalledWith(HOME, ACTOR, {
      from: '2026-09-01',
      to: '2026-09-02',
    });
    await controller.summary({}, {} as never);
    expect(mockAuditLogs.summarizeAuditLogs).toHaveBeenLastCalledWith('', '', {
      from: undefined,
      to: undefined,
    });
  });

  it('export defaults to CSV', async () => {
    const { headers, res } = fakeRes();
    const out = await controller.export(
      { ...filters },
      { tenantId: HOME, userId: ACTOR } as never,
      res,
    );
    expect(mockAuditLogs.exportAuditLogs).toHaveBeenCalledWith(HOME, ACTOR, filters, 'csv');
    expect(typeof out).toBe('string');
    expect(headers['Content-Type']).toBe('text/csv; charset=utf-8');
    expect(headers['Content-Disposition']).toMatch(
      /^attachment; filename="audit-log-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
    expect(headers['X-Export-Truncated']).toBe('false');
  });

  it('export as JSON returns the export object itself', async () => {
    const { headers, res } = fakeRes();
    const out = await controller.export({ format: 'json' }, {} as never, res);
    expect(mockAuditLogs.exportAuditLogs).toHaveBeenCalledWith(
      '',
      '',
      {
        tenantId: undefined,
        actorId: undefined,
        action: undefined,
        from: undefined,
        to: undefined,
        q: undefined,
      },
      'json',
    );
    expect(out).toEqual({ rows: [row], row_cap: 50_000, truncated: false });
    expect(headers['Content-Type']).toBe('application/json; charset=utf-8');
    expect(headers['Content-Disposition']).toMatch(/\.json"$/);
  });
});
