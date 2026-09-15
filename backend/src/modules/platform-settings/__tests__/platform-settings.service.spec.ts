// Unit tests for PlatformSettingsService — versioned read / save with an audit row in the same transaction.
// The SQL runs for real in test/platform-settings/01-platform-settings.integration.spec.ts; here the order
// of statements, the version check and the audit payload are proven on a mocked client.

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
    $executeRawUnsafe: jest.fn(),
    $transaction: jest.fn(),
    $disconnect: jest.fn(),
  })),
}));

import { ConflictException, UnauthorizedException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import {
  PlatformSettingsService,
  SETTINGS_KEY,
  VERSION_CONFLICT_CODE,
} from '../platform-settings.service';
import { defaultPlatformSettings, type PlatformSettings } from '../platform-settings.types';

const TENANT = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const JUSTIFICATION = 'Primary gateway moved to the new endpoint (ticket OPS-6001).';
const SAVED_AT = new Date('2026-09-15T04:00:00.000Z');
const ACTOR_ROW = { user_id: USER, email: 'sysadmin@example.com', name: 'Platform Operator' };

type Mocked = jest.Mocked<PrismaClient>;

/** The SQL text of a tagged-template call, joined, so a test can assert on what was issued. */
const sqlOf = (call: unknown[]): string => (call[0] as TemplateStringsArray).join('?');

function edited(): PlatformSettings {
  const s = defaultPlatformSettings();
  s.gateways.primary.url = 'https://gw.example.com';
  s.broadcast.channels = ['IN_APP_BANNER'];
  s.tiers.ENTERPRISE.storage_quota_gb = 500;
  return s;
}

describe('PlatformSettingsService', () => {
  let service: PlatformSettingsService;
  let prisma: Mocked;

  beforeEach(() => {
    service = new PlatformSettingsService();
    prisma = (service as unknown as { prisma: Mocked }).prisma;
    // The transaction client IS the mocked client, so one set of mocks records the whole sequence.
    (prisma.$transaction as jest.Mock).mockImplementation((fn: (tx: Mocked) => unknown) =>
      fn(prisma),
    );
  });

  it('onModuleDestroy disconnects its Prisma client (Rule 39)', async () => {
    await service.onModuleDestroy();
    expect(prisma.$disconnect).toHaveBeenCalledTimes(1);
  });

  describe('get', () => {
    it('with nothing saved: version 0, no saver, the all-null defaults, and the live counts', async () => {
      (prisma.$queryRaw as jest.Mock).mockImplementation((strings: TemplateStringsArray) =>
        strings.join('').includes('platform.tenants')
          ? Promise.resolve([{ shared: 7, dedicated: 2 }])
          : Promise.resolve([]),
      );

      await expect(service.get()).resolves.toEqual({
        version: 0,
        updated_at: null,
        updated_by: null,
        settings: defaultPlatformSettings(),
        counts: { shared_tenants: 7, dedicated_tenants: 2 },
      });
    });

    it('with a saved row: its version, ISO timestamp, saver and document', async () => {
      const settings = edited();
      (prisma.$queryRaw as jest.Mock).mockImplementation((strings: TemplateStringsArray) =>
        strings.join('').includes('platform.tenants')
          ? Promise.resolve([{ shared: 0, dedicated: 0 }])
          : Promise.resolve([
              { value: settings, version: 4, updated_at: SAVED_AT, updated_by: ACTOR_ROW },
            ]),
      );

      await expect(service.get()).resolves.toEqual({
        version: 4,
        updated_at: '2026-09-15T04:00:00.000Z',
        updated_by: ACTOR_ROW,
        settings,
        counts: { shared_tenants: 0, dedicated_tenants: 0 },
      });
    });

    it('reads without a row lock, and never selects the dedicated DB URL itself', async () => {
      (prisma.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ shared: 1, dedicated: 1 }]);
      await service.get();

      const [read, count] = (prisma.$queryRaw as jest.Mock).mock.calls;
      expect(sqlOf(read)).not.toContain('FOR UPDATE');
      expect(read.slice(1)).toEqual([SETTINGS_KEY]);
      expect(sqlOf(count)).toContain('WHERE is_active = true');
      expect(sqlOf(count)).not.toMatch(/SELECT[^,]*dedicated_db_url\s*(,|FROM)/);
    });
  });

  describe('update', () => {
    const actor = { userId: USER, tenantId: TENANT };

    /** Queue: the FOR UPDATE read, the in-transaction re-read, then the tenant count. */
    function queueReads(current: unknown[], saved: unknown[]): void {
      (prisma.$queryRaw as jest.Mock)
        .mockResolvedValueOnce(current)
        .mockResolvedValueOnce(saved)
        .mockResolvedValueOnce([{ shared: 3, dedicated: 1 }]);
    }

    it('first save (version 0): locks, upserts version 1, audits against the defaults, returns the saved row', async () => {
      const settings = edited();
      queueReads(
        [],
        [{ value: settings, version: 1, updated_at: SAVED_AT, updated_by: ACTOR_ROW }],
      );
      (prisma.$executeRaw as jest.Mock).mockResolvedValue(1);

      const result = await service.update(0, settings, JUSTIFICATION, actor);

      expect(result).toEqual({
        version: 1,
        updated_at: '2026-09-15T04:00:00.000Z',
        updated_by: ACTOR_ROW,
        settings,
        counts: { shared_tenants: 3, dedicated_tenants: 1 },
      });

      const reads = (prisma.$queryRaw as jest.Mock).mock.calls;
      expect(sqlOf(reads[0])).toContain('FOR UPDATE OF s');
      expect(sqlOf(reads[1])).not.toContain('FOR UPDATE');

      const [upsert, audit] = (prisma.$executeRaw as jest.Mock).mock.calls;
      expect(sqlOf(upsert)).toContain('ON CONFLICT (settings_key) DO UPDATE');
      expect(sqlOf(upsert)).toContain('WHERE s.version = ');
      // key, document, new version, actor, expected version
      expect(upsert.slice(1)).toEqual([SETTINGS_KEY, JSON.stringify(settings), 1, USER, 0]);

      expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
        `SET LOCAL app.current_tenant_id = '${TENANT}'`,
      );
      expect(sqlOf(audit)).toContain('INSERT INTO platform.audit_logs');
      const [tenantId, actorId, action, resourceType, metadata] = audit.slice(1);
      expect([tenantId, actorId, action, resourceType]).toEqual([
        TENANT,
        USER,
        'platform.settings.update',
        'platform_settings',
      ]);
      expect(JSON.parse(metadata as string)).toEqual({
        justification: JUSTIFICATION,
        before: defaultPlatformSettings(),
        after: settings,
      });
    });

    it('SET LOCAL runs before the audit INSERT, and both after the upsert', async () => {
      const order: string[] = [];
      queueReads([], [{ value: edited(), version: 1, updated_at: SAVED_AT, updated_by: null }]);
      (prisma.$executeRaw as jest.Mock).mockImplementation((s: TemplateStringsArray) => {
        order.push(s.join('').includes('audit_logs') ? 'audit' : 'upsert');
        return Promise.resolve(1);
      });
      (prisma.$executeRawUnsafe as jest.Mock).mockImplementation(() => {
        order.push('set-local');
        return Promise.resolve(0);
      });

      const result = await service.update(0, edited(), JUSTIFICATION, actor);

      expect(order).toEqual(['upsert', 'set-local', 'audit']);
      expect(result.updated_by).toBeNull();
    });

    it('a later save audits the STORED document as `before`', async () => {
      const stored = edited();
      const next = edited();
      next.limits.shared_tenant_cap = 250;
      queueReads(
        [{ value: stored, version: 3, updated_at: SAVED_AT, updated_by: ACTOR_ROW }],
        [{ value: next, version: 4, updated_at: SAVED_AT, updated_by: ACTOR_ROW }],
      );
      (prisma.$executeRaw as jest.Mock).mockResolvedValue(1);

      const result = await service.update(3, next, JUSTIFICATION, actor);

      expect(result.version).toBe(4);
      const [upsert, audit] = (prisma.$executeRaw as jest.Mock).mock.calls;
      expect(upsert.slice(1)).toEqual([SETTINGS_KEY, JSON.stringify(next), 4, USER, 3]);
      expect(JSON.parse(audit.slice(1)[4] as string)).toEqual({
        justification: JUSTIFICATION,
        before: stored,
        after: next,
      });
    });

    it.each([
      ['a stale version against a stored row', [{ value: edited(), version: 5 }], 4, 5],
      ['a non-zero version when nothing is stored', [], 2, 0],
      ['version 0 when a row already exists', [{ value: edited(), version: 1 }], 0, 1],
    ])(
      '409 COS-PSET-001 on %s — nothing written, nothing audited',
      async (_l, current, sent, stored) => {
        (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce(current);

        const error = await service
          .update(sent, edited(), JUSTIFICATION, actor)
          .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ConflictException);
        expect((error as ConflictException).getResponse()).toEqual({
          error: expect.objectContaining({
            code: VERSION_CONFLICT_CODE,
            messageKey: 'admin.settings.error.versionConflict',
            details: { expected_version: sent, stored_version: stored },
          }),
        });
        expect(prisma.$executeRaw).not.toHaveBeenCalled();
        expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
      },
    );

    it('409 when the upsert writes nothing (lost the first-save race) — and the audit row is not written', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([]);
      (prisma.$executeRaw as jest.Mock).mockResolvedValueOnce(0);

      const error = await service
        .update(0, edited(), JUSTIFICATION, actor)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect(
        ((error as ConflictException).getResponse() as { error: { details: unknown } }).error
          .details,
      ).toEqual({ expected_version: 0, stored_version: null });
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
      expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
    });

    it('refuses a home tenant id that is not a UUID before opening a transaction (QM-4)', async () => {
      await expect(
        service.update(0, edited(), JUSTIFICATION, {
          userId: USER,
          tenantId: "x'; DROP TABLE t; --",
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
