// Unit tests for AdminAuditLogService — the SYSTEM_ADMIN audit-log reads (R17.4, R17.6).
//
// The platform client is replaced, but Prisma.sql is REAL: every $queryRaw call is rebuilt into a
// Prisma.Sql here, so the assertions read the SQL text PostgreSQL would receive and the values bound
// to it — which is what proves the filters are parameters and never part of the text (QM-4).

const tx = {
  $queryRaw: jest.fn(),
  $executeRaw: jest.fn(),
  $executeRawUnsafe: jest.fn(),
};
const client = {
  $transaction: jest.fn(),
  $disconnect: jest.fn(),
};

jest.mock('../../../shared/prisma/create-prisma-client', () => ({
  createPrismaClient: jest.fn(() => client),
}));

import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  AdminAuditLogService,
  AUDIT_EXPORT_ROW_CAP,
  decodeAuditCursor,
  encodeAuditCursor,
  redactCredentialUrls,
} from '../admin-audit-log.service';

const TENANT = '11111111-1111-4111-8111-111111111111';
const HOME = '22222222-2222-4222-8222-222222222222';
const ACTOR = '33333333-3333-4333-8333-333333333333';
const LOG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LOG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const KEY_A = '2026-09-15T10:00:00.123456Z';

type Call = { sql: string; values: unknown[] };

/** Every $queryRaw / $executeRaw call, rebuilt into the SQL and the bound values. */
function calls(mock: jest.Mock): Call[] {
  return mock.mock.calls.map(([strings, ...values]) => {
    const s = Prisma.sql(strings as TemplateStringsArray, ...values);
    // `.text` is the PostgreSQL form ($1, $2 …); `.sql` renders placeholders as `?`, `.statement` as `:1`.
    return { sql: s.text, values: s.values };
  });
}

function rawRow(overrides: Record<string, unknown> = {}) {
  return {
    log_id: LOG_A,
    occurred_at: new Date('2026-09-15T10:00:00.123Z'),
    occurred_at_key: KEY_A,
    tenant_id: TENANT,
    tenant_code: 'acme',
    tenant_name: 'ACME',
    action: 'tenant.deactivate',
    resource_type: 'tenant',
    resource_id: TENANT,
    actor_id: ACTOR,
    actor_email: 'ops@example.com',
    actor_name: 'Operator',
    ip_address: '10.0.0.1',
    user_agent: 'Mozilla',
    metadata: { justification: 'Contract ended (OPS-1)' },
    ...overrides,
  };
}

interface Db {
  bypass?: boolean | null;
  tenantExists?: boolean;
  rows?: unknown[];
  count?: bigint;
  summary?: Record<string, bigint>;
}

function wire(db: Db = {}): void {
  tx.$queryRaw.mockImplementation((strings: TemplateStringsArray, ...values: unknown[]) => {
    const sql = Prisma.sql(strings, ...values).sql;
    if (sql.includes('pg_roles')) {
      return Promise.resolve(db.bypass === null ? [] : [{ bypass: db.bypass ?? true }]);
    }
    if (sql.includes('FROM platform.tenants WHERE')) {
      return Promise.resolve(db.tenantExists === false ? [] : [{ tenant_id: TENANT }]);
    }
    if (sql.includes('FILTER')) {
      return Promise.resolve([
        db.summary ?? {
          total: 9n,
          today: 2n,
          with_justification: 4n,
          privileged: 6n,
          privileged_7d: 5n,
        },
      ]);
    }
    if (sql.includes('count(*) AS n')) return Promise.resolve([{ n: db.count ?? 7n }]);
    return Promise.resolve(db.rows ?? [rawRow()]);
  });
}

describe('AdminAuditLogService', () => {
  let service: AdminAuditLogService;

  beforeEach(() => {
    jest.clearAllMocks();
    client.$transaction.mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx));
    tx.$executeRaw.mockResolvedValue(1);
    tx.$executeRawUnsafe.mockResolvedValue(0);
    wire();
    service = new AdminAuditLogService();
  });

  it('closes the platform client on shutdown (Rule 39)', async () => {
    await service.onModuleDestroy();
    expect(client.$disconnect).toHaveBeenCalledTimes(1);
  });

  describe('cursor codec', () => {
    it('round-trips a microsecond timestamp and a log id', () => {
      const c = encodeAuditCursor(KEY_A, LOG_A);
      expect(c).not.toMatch(/[+/=]/); // base64url
      expect(decodeAuditCursor(c)).toEqual({ occurredAt: KEY_A, logId: LOG_A });
    });

    it.each([
      ['not base64 of anything', '!!!'],
      ['no separator', Buffer.from(KEY_A).toString('base64url')],
      ['empty id', Buffer.from(`${KEY_A}|`).toString('base64url')],
      ['three parts', Buffer.from(`${KEY_A}|${LOG_A}|x`).toString('base64url')],
      [
        'millisecond timestamp',
        Buffer.from(`2026-09-15T10:00:00.123Z|${LOG_A}`).toString('base64url'),
      ],
      ['id not a uuid', Buffer.from(`${KEY_A}|42`).toString('base64url')],
      [
        'an impossible date of the right shape',
        Buffer.from(`2026-02-30T10:00:00.000000Z|${LOG_A}`).toString('base64url'),
      ],
      [
        'an impossible time of the right shape',
        Buffer.from(`2026-09-15T99:99:99.000000Z|${LOG_A}`).toString('base64url'),
      ],
    ])('rejects %s', (_label, cursor) => {
      expect(decodeAuditCursor(cursor)).toBeNull();
    });
  });

  describe('redactCredentialUrls', () => {
    it('replaces credentialed and postgres URLs anywhere in the value, and nothing else', () => {
      expect(
        redactCredentialUrls({
          justification: 'moved to postgresql://db.internal/x today',
          nested: ['https://u:p@host/path', 'https://example.com/ok', 3, null],
          host: 'db-ent-042.cos.internal',
        }),
      ).toEqual({
        justification: 'moved to [REDACTED] today',
        nested: ['[REDACTED]', 'https://example.com/ok', 3, null],
        host: 'db-ent-042.cos.internal',
      });
    });
  });

  describe('listTenantAuditLogs (R17.4)', () => {
    it('reads newest first, returns the row shape and the 30-day count, then audits the read', async () => {
      const page = await service.listTenantAuditLogs(TENANT, ACTOR, {});

      expect(page).toEqual({
        rows: [
          {
            log_id: LOG_A,
            occurred_at: '2026-09-15T10:00:00.123Z',
            tenant_id: TENANT,
            tenant_code: 'acme',
            tenant_name: 'ACME',
            action: 'tenant.deactivate',
            resource_type: 'tenant',
            resource_id: TENANT,
            actor_id: ACTOR,
            actor_email: 'ops@example.com',
            actor_name: 'Operator',
            ip_address: '10.0.0.1',
            user_agent: 'Mozilla',
            justification: 'Contract ended (OPS-1)',
            metadata: { justification: 'Contract ended (OPS-1)' },
          },
        ],
        next_cursor: null,
        summary: { total_30d: 7 },
      });

      const q = calls(tx.$queryRaw);
      const select = q.find((c) => c.sql.includes('LEFT JOIN platform.users'))!;
      expect(select.sql).toContain('ORDER BY a.occurred_at DESC, a.log_id DESC');
      expect(select.sql).toContain('a.tenant_id = $1::uuid');
      expect(select.values).toEqual([TENANT, 51]); // default 50, plus the probe row

      // The read happens BEFORE the audit write, in the same transaction.
      const order = [
        ...tx.$queryRaw.mock.invocationCallOrder,
        ...tx.$executeRawUnsafe.mock.invocationCallOrder,
        ...tx.$executeRaw.mock.invocationCallOrder,
      ];
      expect(Math.max(...tx.$queryRaw.mock.invocationCallOrder)).toBeLessThan(
        tx.$executeRaw.mock.invocationCallOrder[0]!,
      );
      expect(order).toHaveLength(q.length + 2);
      expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
        `SET LOCAL app.current_tenant_id = '${TENANT}'`,
      );

      const [insert] = calls(tx.$executeRaw);
      expect(insert!.sql).toContain('INSERT INTO platform.audit_logs');
      expect(insert!.values.slice(0, 3)).toEqual([TENANT, ACTOR, 'audit.read']);
      expect(JSON.parse(insert!.values[3] as string)).toEqual({
        scope: 'tenant',
        view: 'list',
        filters: { tenant_id: TENANT, actor_id: null, action: null, from: null, to: null, q: null },
        limit: 50,
        after_cursor: false,
      });
    });

    it('issues next_cursor from the last kept row when a probe row came back', async () => {
      wire({
        rows: [rawRow(), rawRow({ log_id: LOG_B, occurred_at_key: '2026-09-15T09:00:00.000001Z' })],
      });
      const page = await service.listTenantAuditLogs(TENANT, ACTOR, { limit: 1 });
      expect(page.rows).toHaveLength(1);
      expect(decodeAuditCursor(page.next_cursor!)).toEqual({ occurredAt: KEY_A, logId: LOG_A });
    });

    it('a limit of 0 keeps nothing and issues no cursor', async () => {
      const page = await service.listTenantAuditLogs(TENANT, ACTOR, { limit: 0 });
      expect(page).toMatchObject({ rows: [], next_cursor: null });
    });

    it('continues strictly after the cursor position, bound as parameters', async () => {
      const cursor = encodeAuditCursor(KEY_A, LOG_A);
      await service.listTenantAuditLogs(TENANT, ACTOR, { cursor, limit: 10 });
      const select = calls(tx.$queryRaw).find((c) => c.sql.includes('LEFT JOIN'))!;
      expect(select.sql).toContain('(a.occurred_at, a.log_id) < ($2::timestamptz, $3::uuid)');
      expect(select.values).toEqual([TENANT, KEY_A, LOG_A, 11]);
      const [insert] = calls(tx.$executeRaw);
      expect(JSON.parse(insert!.values[3] as string)).toMatchObject({
        limit: 10,
        after_cursor: true,
      });
    });

    it('searches action, actor email and justification literally — % and _ escaped, never in the SQL', async () => {
      await service.listTenantAuditLogs(TENANT, ACTOR, { q: '50%_off!' });
      const select = calls(tx.$queryRaw).find((c) => c.sql.includes('LEFT JOIN'))!;
      expect(select.sql).toContain("a.action ILIKE $2 ESCAPE '!'");
      expect(select.sql).toContain("u.email ILIKE $3 ESCAPE '!'");
      expect(select.sql).toContain("(a.metadata->>'justification') ILIKE $4 ESCAPE '!'");
      expect(select.sql).not.toContain('50');
      expect(select.values.slice(1, 4)).toEqual(Array(3).fill('%50!%!_off!!%'));
    });

    it('404 when the tenant does not exist, and nothing is audited', async () => {
      wire({ tenantExists: false });
      await expect(service.listTenantAuditLogs(TENANT, ACTOR, {})).rejects.toThrow(
        NotFoundException,
      );
      expect(tx.$executeRaw).not.toHaveBeenCalled();
    });

    it('a malformed cursor is 400 before any transaction opens', async () => {
      await expect(
        service.listTenantAuditLogs(TENANT, ACTOR, { cursor: 'garbage' }),
      ).rejects.toThrow(BadRequestException);
      expect(client.$transaction).not.toHaveBeenCalled();
    });

    it('a failed audit write fails the read — the rows are not returned', async () => {
      tx.$executeRaw.mockRejectedValue(new Error('insert or update violates foreign key'));
      await expect(service.listTenantAuditLogs(TENANT, ACTOR, {})).rejects.toThrow(
        'violates foreign key',
      );
    });
  });

  describe('identity and connection guards', () => {
    it('401 when no actor can be named, before the database is touched', async () => {
      await expect(service.listTenantAuditLogs(TENANT, '', {})).rejects.toThrow(
        UnauthorizedException,
      );
      expect(client.$transaction).not.toHaveBeenCalled();
    });

    it('401 when the audit tenant is not a UUID (it is interpolated into SET LOCAL)', async () => {
      await expect(service.listAuditLogs('', ACTOR, {})).rejects.toThrow(UnauthorizedException);
      expect(client.$transaction).not.toHaveBeenCalled();
    });

    it.each([
      ['a role subject to RLS', false],
      ['no pg_roles row', null],
    ])('503 on %s: a cross-tenant read there would silently omit tenants', async (_l, bypass) => {
      wire({ bypass });
      await expect(service.listAuditLogs(HOME, ACTOR, {})).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(tx.$executeRaw).not.toHaveBeenCalled();
    });
  });

  describe('row shaping', () => {
    it.each([
      [null, {}, null],
      [['x'], { value: ['x'] }, null],
      ['scalar', { value: 'scalar' }, null],
      [{ justification: '   ' }, { justification: '   ' }, null],
      [{ justification: 42 }, { justification: 42 }, null],
      [
        { justification: 'see postgres://a:b@h/db' },
        { justification: 'see [REDACTED]' },
        'see [REDACTED]',
      ],
    ])('metadata %j → %j, justification %j', async (metadata, expected, justification) => {
      wire({ rows: [rawRow({ metadata })] });
      const { rows } = await service.listTenantAuditLogs(TENANT, ACTOR, {});
      expect(rows[0]!.metadata).toEqual(expected);
      expect(rows[0]!.justification).toBe(justification);
    });
  });

  describe('exportTenantAuditLogs (R17.4)', () => {
    it('reads up to the cap plus one, with a longer transaction timeout, and audits the export', async () => {
      const out = await service.exportTenantAuditLogs(TENANT, ACTOR, { q: 'x' });
      expect(out).toMatchObject({ row_cap: AUDIT_EXPORT_ROW_CAP, truncated: false });
      expect(out.rows).toHaveLength(1);
      const select = calls(tx.$queryRaw).find((c) => c.sql.includes('LEFT JOIN'))!;
      expect(select.values[select.values.length - 1]).toBe(AUDIT_EXPORT_ROW_CAP + 1);
      expect(client.$transaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 60_000 });
      const [insert] = calls(tx.$executeRaw);
      expect(insert!.values[2]).toBe('audit.export');
      expect(JSON.parse(insert!.values[3] as string)).toEqual({
        scope: 'tenant',
        view: 'export',
        filters: { tenant_id: TENANT, actor_id: null, action: null, from: null, to: null, q: 'x' },
        format: 'csv',
      });
    });

    it('says truncated when more rows matched than the cap', async () => {
      wire({ rows: Array.from({ length: AUDIT_EXPORT_ROW_CAP + 1 }, () => rawRow()) });
      const out = await service.exportTenantAuditLogs(TENANT, ACTOR, {});
      expect(out.truncated).toBe(true);
      expect(out.rows).toHaveLength(AUDIT_EXPORT_ROW_CAP);
    });

    it('404 when the tenant does not exist', async () => {
      wire({ tenantExists: false });
      await expect(service.exportTenantAuditLogs(TENANT, ACTOR, {})).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('listAuditLogs (R17.6)', () => {
    it('with no filters: every tenant, no tenant predicate, audited against the caller`s own tenant', async () => {
      await service.listAuditLogs(HOME, ACTOR, {});
      const q = calls(tx.$queryRaw);
      expect(q.some((c) => c.sql.includes('FROM platform.tenants WHERE'))).toBe(false);
      const select = q.find((c) => c.sql.includes('LEFT JOIN'))!;
      expect(select.sql).not.toContain('a.tenant_id =');
      expect(select.values).toEqual([51]);
      expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
        `SET LOCAL app.current_tenant_id = '${HOME}'`,
      );
      expect(calls(tx.$executeRaw)[0]!.values[0]).toBe(HOME);
    });

    it('binds every filter; an exact action is `=`, and the audit row names the filtered tenant', async () => {
      await service.listAuditLogs(HOME, ACTOR, {
        tenantId: TENANT,
        actorId: ACTOR,
        action: 'tenant.deactivate',
        from: '2026-09-01',
        to: '2026-09-15T00:00:00Z',
        q: 'ops',
        limit: 5,
      });
      const select = calls(tx.$queryRaw).find((c) => c.sql.includes('LEFT JOIN'))!;
      expect(select.sql).toContain(
        'a.occurred_at >= $1::timestamptz AND a.occurred_at < $2::timestamptz',
      );
      expect(select.sql).toContain('a.tenant_id = $3::uuid');
      expect(select.sql).toContain('a.actor_id = $4::uuid');
      expect(select.sql).toContain('a.action = $5');
      expect(select.values).toEqual([
        '2026-09-01T00:00:00.000Z',
        '2026-09-15T00:00:00.000Z',
        TENANT,
        ACTOR,
        'tenant.deactivate',
        '%ops%',
        '%ops%',
        '%ops%',
        6,
      ]);
      const [insert] = calls(tx.$executeRaw);
      expect(insert!.values[0]).toBe(TENANT);
      expect(JSON.parse(insert!.values[3] as string)).toEqual({
        scope: 'global',
        view: 'list',
        filters: {
          tenant_id: TENANT,
          actor_id: ACTOR,
          action: 'tenant.deactivate',
          from: '2026-09-01',
          to: '2026-09-15T00:00:00Z',
          q: 'ops',
        },
        limit: 5,
        after_cursor: false,
      });
    });

    it('an action ending in a dot is a prefix match, escaped', async () => {
      await service.listAuditLogs(HOME, ACTOR, { action: 'tenant_x.' });
      const select = calls(tx.$queryRaw).find((c) => c.sql.includes('LEFT JOIN'))!;
      expect(select.sql).toContain("a.action LIKE $1 ESCAPE '!'");
      expect(select.values[0]).toBe('tenant!_x.%');
    });

    it('404 when the tenantId filter names no tenant', async () => {
      wire({ tenantExists: false });
      await expect(service.listAuditLogs(HOME, ACTOR, { tenantId: TENANT })).rejects.toThrow(
        NotFoundException,
      );
    });

    it.each([
      ['from after to', { from: '2026-09-15', to: '2026-09-01' }, 'from must not be later than to'],
      ['a from Date cannot read', { from: '2026-W38' }, 'from must be an ISO 8601'],
      ['a to Date cannot read', { to: '2026-W38' }, 'to must be an ISO 8601'],
    ])('400 on %s, before any transaction', async (_l, window, message) => {
      await expect(service.listAuditLogs(HOME, ACTOR, window)).rejects.toThrow(message);
      expect(client.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('summarizeAuditLogs (R17.6)', () => {
    it('returns the five counts as numbers, with the window bound in total, with_justification and privileged only', async () => {
      const out = await service.summarizeAuditLogs(HOME, ACTOR, {
        from: '2026-09-01',
        to: '2026-09-02',
      });
      expect(out).toEqual({
        total: 9,
        today: 2,
        with_justification: 4,
        privileged: 6,
        privileged_7d: 5,
      });
      const summary = calls(tx.$queryRaw).find((c) => c.sql.includes('FILTER'))!;
      expect(summary.values).toEqual([
        '2026-09-01T00:00:00.000Z',
        '2026-09-02T00:00:00.000Z',
        '2026-09-01T00:00:00.000Z',
        '2026-09-02T00:00:00.000Z',
        '2026-09-01T00:00:00.000Z',
        '2026-09-02T00:00:00.000Z',
      ]);
      expect(summary.sql).toContain("a.action LIKE 'tenant.%'");
      expect(summary.sql).toContain("NULLIF(btrim(a.metadata->>'justification'), '') IS NOT NULL");
      expect(summary.sql).toContain("now() - interval '7 days'");
      const [insert] = calls(tx.$executeRaw);
      expect(insert!.values.slice(0, 3)).toEqual([HOME, ACTOR, 'audit.read']);
      expect(JSON.parse(insert!.values[3] as string)).toMatchObject({
        scope: 'global',
        view: 'summary',
      });
    });

    it('with no window, total counts every row (the condition is TRUE)', async () => {
      await service.summarizeAuditLogs(HOME, ACTOR, {});
      const summary = calls(tx.$queryRaw).find((c) => c.sql.includes('FILTER'))!;
      expect(summary.sql).toContain('FILTER (WHERE TRUE)');
      expect(summary.values).toEqual([]);
    });
  });

  describe('exportAuditLogs (R17.6)', () => {
    it('audits the export with its format, against the caller`s tenant when unfiltered', async () => {
      const out = await service.exportAuditLogs(HOME, ACTOR, {}, 'json');
      expect(out.truncated).toBe(false);
      const [insert] = calls(tx.$executeRaw);
      expect(insert!.values.slice(0, 3)).toEqual([HOME, ACTOR, 'audit.export']);
      expect(JSON.parse(insert!.values[3] as string)).toMatchObject({ format: 'json' });
    });

    it('checks the filtered tenant exists and records the row against it', async () => {
      await service.exportAuditLogs(HOME, ACTOR, { tenantId: TENANT }, 'csv');
      expect(calls(tx.$queryRaw).some((c) => c.sql.includes('FROM platform.tenants WHERE'))).toBe(
        true,
      );
      expect(calls(tx.$executeRaw)[0]!.values[0]).toBe(TENANT);
    });
  });
});
