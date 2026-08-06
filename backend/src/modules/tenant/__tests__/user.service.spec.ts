// Unit tests for UserService — user lifecycle within a tenant

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
    $transaction: jest.fn(),
    $disconnect: jest.fn(),
  })),
}));

jest.mock('@cos/shared', () => ({
  KafkaProducer: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    publish: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { UserService } from '../user.service';
import { KeycloakAdminService } from '../../identity/keycloak-admin.service';
import { PrismaClient } from '@prisma/client';
import {
  ConflictException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { CosRole } from '@cos/types';

const TENANT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const ACTOR_ID = 'aaaaaaaa-0000-0000-0000-000000000002';
const USER_ID = 'aaaaaaaa-0000-0000-0000-000000000003';
const KC_USER_ID = 'kc-uuid-1';
const REALM = 'tenant-acme';

const mockUserRow = {
  user_id: USER_ID,
  tenant_id: TENANT_ID,
  keycloak_user_id: KC_USER_ID,
  email: '',
  display_name: 'สมชาย ใจดี',
  is_active: true,
  mfa_enabled: false,
  created_at: new Date(),
  updated_at: new Date(),
};

describe('UserService', () => {
  let service: UserService;
  let keycloakAdmin: jest.Mocked<KeycloakAdminService>;
  let prismaMock: jest.Mocked<PrismaClient>;

  beforeEach(() => {
    keycloakAdmin = {
      provisionPhoneUser: jest.fn().mockResolvedValue({ keycloakUserId: KC_USER_ID }),
      createEmailUser: jest.fn().mockResolvedValue({ keycloakUserId: KC_USER_ID }),
      deleteUser: jest.fn().mockResolvedValue(undefined),
      // Security review F1/F2 — deactivation must disable the Keycloak account, and a role change must
      // rewrite the `role` user attribute the JWT claim is mapped from.
      disableUser: jest.fn().mockResolvedValue(undefined),
      syncUserRole: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<KeycloakAdminService>;

    service = new UserService(keycloakAdmin);
    prismaMock = (service as unknown as { prisma: jest.Mocked<PrismaClient> }).prisma;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── listUsers ───────────────────────────────────────────────────────────

  describe('listUsers', () => {
    it('returns paginated users with total count', async () => {
      (prismaMock.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([{ ...mockUserRow, role: CosRole.SITE_ENGINEER }]) // data rows
        .mockResolvedValueOnce([{ count: BigInt(1) }]); // COUNT(*)

      const result = await service.listUsers(TENANT_ID, { limit: 50, offset: 0 });

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.role).toBe(CosRole.SITE_ENGINEER);
      expect(result.pagination).toEqual({ limit: 50, offset: 0, page: 1, total: 1 });
    });

    it('calculates correct page number for non-zero offset', async () => {
      (prismaMock.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([{ ...mockUserRow, role: CosRole.SITE_WORKER }])
        .mockResolvedValueOnce([{ count: BigInt(25) }]);

      const result = await service.listUsers(TENANT_ID, { limit: 10, offset: 10 });

      expect(result.pagination.page).toBe(2);
      expect(result.pagination.total).toBe(25);
    });

    it('returns empty data array and zero total when tenant has no users', async () => {
      (prismaMock.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([]) // no rows
        .mockResolvedValueOnce([{ count: BigInt(0) }]); // count

      const result = await service.listUsers(TENANT_ID, { limit: 50, offset: 0 });

      expect(result.data).toEqual([]);
      expect(result.pagination.total).toBe(0);
    });

    it('returns total=0 when count query returns empty array (covers countResult[0]?.count ?? 0 false branch)', async () => {
      (prismaMock.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([]) // no rows
        .mockResolvedValueOnce([]); // count query returns empty — countResult[0] undefined

      const result = await service.listUsers(TENANT_ID, { limit: 50, offset: 0 });

      expect(result.pagination.total).toBe(0);
    });
  });

  // ─── createUser ──────────────────────────────────────────────────────────

  describe('createUser', () => {
    function mockCreateSetup(userRow: typeof mockUserRow) {
      (prismaMock.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([]) // conflict guard
        .mockResolvedValueOnce([{ keycloak_realm: REALM }]); // tenant lookup
      (prismaMock.$transaction as jest.Mock).mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            $queryRaw: jest
              .fn()
              .mockResolvedValueOnce([userRow]) // INSERT users → RETURNING
              .mockResolvedValueOnce([{}]), // INSERT memberships
          };
          return fn(tx);
        },
      );
    }

    it('creates Path A user (phone) via KeycloakAdminService.provisionPhoneUser', async () => {
      mockCreateSetup(mockUserRow);

      const dto = {
        display_name: 'สมชาย',
        phone_number: '+66812345678',
        role: CosRole.SITE_ENGINEER,
      };
      const result = await service.createUser(dto, TENANT_ID, ACTOR_ID);

      expect(keycloakAdmin.provisionPhoneUser).toHaveBeenCalledWith(
        '+66812345678',
        'สมชาย',
        REALM,
        TENANT_ID,
        expect.any(String), // userIdPlaceholder UUID
        CosRole.SITE_ENGINEER,
      );
      expect(result.user_id).toBe(USER_ID);
      expect(result.role).toBe(CosRole.SITE_ENGINEER);
    });

    it('creates Path B user (email) via KeycloakAdminService.createEmailUser', async () => {
      const emailRow = { ...mockUserRow, email: 'w@a.com', keycloak_user_id: KC_USER_ID };
      mockCreateSetup(emailRow);

      const dto = { display_name: 'วิชัย', email: 'w@a.com', role: CosRole.PROJECT_MANAGER };
      const result = await service.createUser(dto, TENANT_ID, ACTOR_ID);

      expect(keycloakAdmin.createEmailUser).toHaveBeenCalledWith(
        'w@a.com',
        'วิชัย',
        REALM,
        TENANT_ID,
        expect.any(String),
        CosRole.PROJECT_MANAGER,
      );
      expect(result.role).toBe(CosRole.PROJECT_MANAGER);
    });

    it('rolls back Keycloak user when COS DB transaction fails', async () => {
      (prismaMock.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([]) // conflict guard
        .mockResolvedValueOnce([{ keycloak_realm: REALM }]); // tenant lookup
      (prismaMock.$transaction as jest.Mock).mockRejectedValueOnce(new Error('DB error'));

      const dto = {
        display_name: 'สมชาย',
        phone_number: '+66812345678',
        role: CosRole.SITE_ENGINEER,
      };
      await expect(service.createUser(dto, TENANT_ID, ACTOR_ID)).rejects.toThrow('DB error');
      expect(keycloakAdmin.deleteUser).toHaveBeenCalledWith(KC_USER_ID, REALM);
    });

    it('logs error but still throws original error when Keycloak deleteUser also fails (covers rollback .catch branch)', async () => {
      (prismaMock.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([]) // conflict guard
        .mockResolvedValueOnce([{ keycloak_realm: REALM }]); // tenant lookup
      (prismaMock.$transaction as jest.Mock).mockRejectedValueOnce(new Error('DB error'));
      keycloakAdmin.deleteUser.mockRejectedValueOnce(new Error('Keycloak unreachable'));

      const dto = {
        display_name: 'สมชาย',
        phone_number: '+66812345678',
        role: CosRole.SITE_ENGINEER,
      };
      await expect(service.createUser(dto, TENANT_ID, ACTOR_ID)).rejects.toThrow('DB error');
      expect(keycloakAdmin.deleteUser).toHaveBeenCalledWith(KC_USER_ID, REALM);
    });

    it('throws BadRequestException when neither phone_number nor email provided', async () => {
      const dto = { display_name: 'Test', role: CosRole.SITE_ENGINEER };
      await expect(service.createUser(dto as never, TENANT_ID, ACTOR_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when both phone_number and email provided', async () => {
      const dto = {
        display_name: 'Test',
        phone_number: '+66812345678',
        email: 'a@b.com',
        role: CosRole.SITE_ENGINEER,
      };
      await expect(service.createUser(dto, TENANT_ID, ACTOR_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws ConflictException when identity already exists', async () => {
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValueOnce([{ user_id: USER_ID }]);
      const dto = {
        display_name: 'สมชาย',
        phone_number: '+66812345678',
        role: CosRole.SITE_ENGINEER,
      };
      await expect(service.createUser(dto, TENANT_ID, ACTOR_ID)).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException when tenant is not found or inactive (covers !tenant branch)', async () => {
      (prismaMock.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([]) // conflict guard — no existing user
        .mockResolvedValueOnce([]); // tenant lookup returns empty — tenant not found
      const dto = {
        display_name: 'สมชาย',
        phone_number: '+66812345678',
        role: CosRole.SITE_ENGINEER,
      };
      await expect(service.createUser(dto, TENANT_ID, ACTOR_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects assigning SYSTEM_ADMIN — a tenant admin must not mint a cross-tenant platform admin', async () => {
      // Privilege-escalation guard (spec §6.7): SYSTEM_ADMIN is validated by @IsEnum(CosRole) at the
      // DTO but must never be tenant-assignable. Rejected before any Keycloak/DB write.
      const dto = {
        display_name: 'attacker',
        phone_number: '+66812345678',
        role: CosRole.SYSTEM_ADMIN,
      };
      await expect(service.createUser(dto, TENANT_ID, ACTOR_ID)).rejects.toThrow(
        ForbiddenException,
      );
      expect(keycloakAdmin.provisionPhoneUser).not.toHaveBeenCalled();
      expect(keycloakAdmin.createEmailUser).not.toHaveBeenCalled();
    });
  });

  // ─── changeRole ──────────────────────────────────────────────────────────

  describe('changeRole', () => {
    it('updates membership role, re-syncs the Keycloak role attribute, and emits user.role_changed', async () => {
      (prismaMock.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([
          { role: CosRole.SITE_ENGINEER, keycloak_user_id: KC_USER_ID, keycloak_realm: REALM },
        ]) // SELECT membership + keycloak identifiers
        .mockResolvedValueOnce([{}]); // UPDATE

      await expect(
        service.changeRole(USER_ID, { role: CosRole.PROJECT_MANAGER }, TENANT_ID, ACTOR_ID),
      ).resolves.toBeUndefined();

      // Security review F2 — without this the JWT `role` claim keeps the OLD role forever, so a
      // demotion never takes effect for anything reading the token.
      expect(keycloakAdmin.syncUserRole).toHaveBeenCalledWith(
        KC_USER_ID,
        REALM,
        CosRole.PROJECT_MANAGER,
      );
    });

    it('throws NotFoundException when user not in tenant', async () => {
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([]);
      await expect(
        service.changeRole(USER_ID, { role: CosRole.FINANCE }, TENANT_ID, ACTOR_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects changing a role to SYSTEM_ADMIN — privilege-escalation guard', async () => {
      // Rejected before the membership lookup/update, so no DB write occurs.
      await expect(
        service.changeRole(USER_ID, { role: CosRole.SYSTEM_ADMIN }, TENANT_ID, ACTOR_ID),
      ).rejects.toThrow(ForbiddenException);
      expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
    });
  });

  // ─── deactivateUser ──────────────────────────────────────────────────────

  describe('deactivateUser', () => {
    it('deactivates an active user AND disables the Keycloak account', async () => {
      (prismaMock.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([{ keycloak_user_id: KC_USER_ID }]) // UPDATE ... RETURNING
        .mockResolvedValueOnce([{ keycloak_realm: REALM }]); // SELECT realm

      await expect(service.deactivateUser(USER_ID, TENANT_ID, ACTOR_ID)).resolves.toBeUndefined();

      // Security review F1 — the COS flag alone revoked nothing: the Keycloak account stayed enabled,
      // so the user could log in again and be issued a brand-new valid token indefinitely.
      expect(keycloakAdmin.disableUser).toHaveBeenCalledWith(KC_USER_ID, REALM);
    });

    it('throws NotFoundException when user not found or already inactive', async () => {
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([]);
      await expect(service.deactivateUser(USER_ID, TENANT_ID, ACTOR_ID)).rejects.toThrow(
        NotFoundException,
      );
      expect(keycloakAdmin.disableUser).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the tenant row is missing or inactive', async () => {
      (prismaMock.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([{ keycloak_user_id: KC_USER_ID }])
        .mockResolvedValueOnce([]); // no active tenant
      await expect(service.deactivateUser(USER_ID, TENANT_ID, ACTOR_ID)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── publishEvent error handling ─────────────────────────────────────────

  describe('publishEvent error handling', () => {
    it('logs error but does not throw when Kafka publish fails (covers catch branch)', async () => {
      (prismaMock.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([]) // conflict guard
        .mockResolvedValueOnce([{ keycloak_realm: REALM }]); // tenant lookup
      (prismaMock.$transaction as jest.Mock).mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            $queryRaw: jest.fn().mockResolvedValueOnce([mockUserRow]).mockResolvedValueOnce([{}]),
          };
          return fn(tx);
        },
      );
      const kafkaMock = (
        service as unknown as {
          kafka: { connect: jest.Mock; publish: jest.Mock; disconnect: jest.Mock };
        }
      ).kafka;
      kafkaMock.publish.mockRejectedValueOnce(new Error('Kafka unavailable'));

      const dto = {
        display_name: 'สมชาย',
        phone_number: '+66812345678',
        role: CosRole.SITE_ENGINEER,
      };
      await expect(service.createUser(dto, TENANT_ID, ACTOR_ID)).resolves.toBeDefined();
    });
  });
});

describe('UserService onModuleDestroy', () => {
  it('disconnects Prisma on shutdown', async () => {
    const svc = new UserService({} as never);
    await svc.onModuleDestroy();
    expect(
      (svc as unknown as { prisma: { $disconnect: jest.Mock } }).prisma.$disconnect,
    ).toHaveBeenCalledTimes(1);
  });
});

// Self-service reads/writes. Unlike the rest of this service these are not TENANT_ADMIN-gated, so
// the tenant+user scoping in the SQL is the only thing keeping a caller on their own row.
describe('UserService self-service', () => {
  let service: UserService;
  let prismaMock: jest.Mocked<PrismaClient>;

  beforeEach(() => {
    service = new UserService({} as never);
    prismaMock = (service as unknown as { prisma: jest.Mocked<PrismaClient> }).prisma;
  });

  describe('getMe', () => {
    it('returns the caller’s own row', async () => {
      const me = { ...mockUserRow, role: CosRole.SITE_ENGINEER, employee_code: 'EMP-001' };
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValueOnce([me]);

      expect(await service.getMe(TENANT_ID, USER_ID)).toBe(me);
    });

    it('reads employee_code from workforce.workers with a LEFT join', async () => {
      // An inner join would turn "no worker record" into "user not found" — a 404 on your own
      // profile — and most accounts genuinely have none (1 of 19 workers is linked in the dev seed).
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValueOnce([mockUserRow]);
      await service.getMe(TENANT_ID, USER_ID);

      const sql = (prismaMock.$queryRaw as jest.Mock).mock.calls[0]?.[0] as {
        join(s: string): string;
      };
      const text = Array.isArray(sql) ? sql.join('?') : String(sql);
      expect(text).toContain('LEFT JOIN workforce.workers');
      expect(text).toContain('w.employee_code');
      // Tenant-scoped as well as user-scoped: this client connects as the owning role, so the RLS
      // policy on workforce.workers does not apply and the predicate here IS the isolation.
      expect(text).toContain('w.tenant_id = u.tenant_id');
    });

    it('returns a null employee_code for an account with no worker record', async () => {
      // The common case: office roles have no row in workforce.workers. It must read as "no code
      // issued", never as a missing field the screen should hide.
      const officeUser = { ...mockUserRow, employee_code: null };
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValueOnce([officeUser]);

      await expect(service.getMe(TENANT_ID, USER_ID)).resolves.toHaveProperty(
        'employee_code',
        null,
      );
    });

    it('throws COS-USER-404 when the row is missing', async () => {
      // A JWT whose user was deleted, or pointed at another tenant: not found, never someone else's row.
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValueOnce([]);

      await expect(service.getMe(TENANT_ID, USER_ID)).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateMyPhoto', () => {
    it('writes the photo URL then returns the refreshed row', async () => {
      const updated = {
        ...mockUserRow,
        photo_url: 'https://files/p.jpg',
        role: CosRole.SITE_WORKER,
      };
      (prismaMock.$executeRaw as jest.Mock).mockResolvedValueOnce(1);
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValueOnce([updated]);

      const r = await service.updateMyPhoto(TENANT_ID, USER_ID, 'https://files/p.jpg');

      expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(1);
      expect(r).toBe(updated);
    });

    it('accepts null to clear the photo and fall back to initials', async () => {
      const cleared = { ...mockUserRow, photo_url: null, role: CosRole.SITE_WORKER };
      (prismaMock.$executeRaw as jest.Mock).mockResolvedValueOnce(1);
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValueOnce([cleared]);

      const r = await service.updateMyPhoto(TENANT_ID, USER_ID, null);

      expect(r.photo_url).toBeNull();
    });

    it('propagates the 404 when the row vanished before the re-read', async () => {
      (prismaMock.$executeRaw as jest.Mock).mockResolvedValueOnce(0);
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValueOnce([]);

      await expect(service.updateMyPhoto(TENANT_ID, USER_ID, null)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});

// ─── getUserRoles ──────────────────────────────────────────────────────────
// Primary role from tenant_memberships + additional roles from user_additional_roles (union model).
describe('UserService getUserRoles', () => {
  let service: UserService;
  let prismaMock: jest.Mocked<PrismaClient>;

  beforeEach(() => {
    service = new UserService({} as never);
    prismaMock = (service as unknown as { prisma: jest.Mocked<PrismaClient> }).prisma;
  });

  it('returns the primary role plus mapped additional roles', async () => {
    (prismaMock.$queryRaw as jest.Mock)
      .mockResolvedValueOnce([{ role: CosRole.SITE_ENGINEER }]) // SELECT membership
      .mockResolvedValueOnce([{ role: CosRole.FINANCE }, { role: CosRole.SITE_WORKER }]); // additional

    const result = await service.getUserRoles(USER_ID, TENANT_ID);

    expect(result).toEqual({
      primary_role: CosRole.SITE_ENGINEER,
      additional_roles: [CosRole.FINANCE, CosRole.SITE_WORKER],
    });
  });

  it('returns an empty additional_roles array when the user has no extra roles', async () => {
    (prismaMock.$queryRaw as jest.Mock)
      .mockResolvedValueOnce([{ role: CosRole.PROJECT_MANAGER }]) // SELECT membership
      .mockResolvedValueOnce([]); // no additional roles

    const result = await service.getUserRoles(USER_ID, TENANT_ID);

    expect(result).toEqual({ primary_role: CosRole.PROJECT_MANAGER, additional_roles: [] });
  });

  it('throws NotFoundException when the user has no membership in the tenant', async () => {
    (prismaMock.$queryRaw as jest.Mock).mockResolvedValueOnce([]); // no membership

    await expect(service.getUserRoles(USER_ID, TENANT_ID)).rejects.toThrow(NotFoundException);
  });
});

// ─── setUserRoles ──────────────────────────────────────────────────────────
// Primary lands on tenant_memberships; additional roles (deduped, primary excluded) replace
// user_additional_roles. Emits role_changed only when the primary actually changes.
describe('UserService setUserRoles', () => {
  let service: UserService;
  let prismaMock: jest.Mocked<PrismaClient>;
  let kafkaMock: { connect: jest.Mock; publish: jest.Mock; disconnect: jest.Mock };
  let keycloakAdmin: jest.Mocked<KeycloakAdminService>;

  beforeEach(() => {
    keycloakAdmin = {
      syncUserRole: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<KeycloakAdminService>;
    service = new UserService(keycloakAdmin);
    prismaMock = (service as unknown as { prisma: jest.Mocked<PrismaClient> }).prisma;
    kafkaMock = (
      service as unknown as {
        kafka: { connect: jest.Mock; publish: jest.Mock; disconnect: jest.Mock };
      }
    ).kafka;
  });

  // The whole role change runs inside one $transaction — mirror that here so the tx-scoped calls are
  // observable. `membership` is what the leading SELECT ... FOR UPDATE returns ([] = no membership).
  // The row now also carries the Keycloak identifiers used for the post-commit attribute sync (F2).
  function mockRoleTx(membership: Array<{ role: CosRole }>): jest.Mock {
    const txQueryRaw = jest.fn().mockResolvedValue([]);
    txQueryRaw.mockResolvedValueOnce(
      membership.map((m) => ({
        ...m,
        keycloak_user_id: KC_USER_ID,
        keycloak_realm: REALM,
      })),
    ); // SELECT membership FOR UPDATE
    (prismaMock.$transaction as jest.Mock).mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => fn({ $queryRaw: txQueryRaw }),
    );
    return txQueryRaw;
  }

  it('updates the primary role, replaces additional roles (deduped + primary filtered), and emits role_changed when the primary changes', async () => {
    const txQueryRaw = mockRoleTx([{ role: CosRole.SITE_ENGINEER }]);

    const dto = {
      primary_role: CosRole.PROJECT_MANAGER,
      // duplicate FINANCE is deduped; PROJECT_MANAGER equals the primary and is filtered out →
      // effective additional = [FINANCE], bound as a single array parameter.
      additional_roles: [CosRole.FINANCE, CosRole.FINANCE, CosRole.PROJECT_MANAGER],
    };

    await expect(service.setUserRoles(USER_ID, dto, TENANT_ID, ACTOR_ID)).resolves.toBeUndefined();

    // SELECT membership + UPDATE primary + DELETE additional + one set-based INSERT
    expect(txQueryRaw).toHaveBeenCalledTimes(4);
    // Every write went through the transaction, never straight at the client.
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
    // oldRole (SITE_ENGINEER) !== primary (PROJECT_MANAGER) → role_changed published
    expect(kafkaMock.publish).toHaveBeenCalledTimes(1);
  });

  it('does not emit role_changed when the primary is unchanged (actor "system" → assigned_by null)', async () => {
    const txQueryRaw = mockRoleTx([{ role: CosRole.SITE_ENGINEER }]);

    const dto = { primary_role: CosRole.SITE_ENGINEER, additional_roles: [] };

    await expect(service.setUserRoles(USER_ID, dto, TENANT_ID, 'system')).resolves.toBeUndefined();

    // Still 4 statements: unnest() over an empty array inserts zero rows, so there is no empty-case
    // branch to skip — the INSERT is issued unconditionally.
    expect(txQueryRaw).toHaveBeenCalledTimes(4);
    // oldRole === primary → no event
    expect(kafkaMock.publish).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when the user has no membership (falsy actorId → assigned_by null)', async () => {
    const txQueryRaw = mockRoleTx([]); // no membership

    const dto = { primary_role: CosRole.SITE_ENGINEER, additional_roles: [CosRole.FINANCE] };

    await expect(service.setUserRoles(USER_ID, dto, TENANT_ID, '')).rejects.toThrow(
      NotFoundException,
    );
    // Aborted on the SELECT — nothing was mutated, so the rollback has nothing to undo.
    expect(txQueryRaw).toHaveBeenCalledTimes(1);
    expect(kafkaMock.publish).not.toHaveBeenCalled();
  });

  it('publishes no role_changed event when the transaction fails (all-or-nothing)', async () => {
    (prismaMock.$transaction as jest.Mock).mockRejectedValueOnce(new Error('DB error'));

    const dto = { primary_role: CosRole.PROJECT_MANAGER, additional_roles: [CosRole.FINANCE] };

    await expect(service.setUserRoles(USER_ID, dto, TENANT_ID, ACTOR_ID)).rejects.toThrow(
      'DB error',
    );
    expect(kafkaMock.publish).not.toHaveBeenCalled();
  });

  it('rejects a SYSTEM_ADMIN primary role before any DB write (privilege-escalation guard)', async () => {
    const dto = { primary_role: CosRole.SYSTEM_ADMIN, additional_roles: [] };

    await expect(service.setUserRoles(USER_ID, dto, TENANT_ID, ACTOR_ID)).rejects.toThrow(
      ForbiddenException,
    );
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('rejects SYSTEM_ADMIN in additional_roles before any DB write', async () => {
    const dto = { primary_role: CosRole.SITE_ENGINEER, additional_roles: [CosRole.SYSTEM_ADMIN] };

    await expect(service.setUserRoles(USER_ID, dto, TENANT_ID, ACTOR_ID)).rejects.toThrow(
      ForbiddenException,
    );
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});

// ─── resetPassword / sendPasswordResetLink ─────────────────────────────────
// Admin-triggered password resets. resetPassword hands back a one-time temporary password;
// sendPasswordResetLink emails a single-use action-token link. Both emit password_reset.v1.
describe('UserService password resets', () => {
  let service: UserService;
  let prismaMock: jest.Mocked<PrismaClient>;
  let keycloakAdmin: jest.Mocked<KeycloakAdminService>;
  let kafkaMock: { connect: jest.Mock; publish: jest.Mock; disconnect: jest.Mock };

  beforeEach(() => {
    keycloakAdmin = {
      setTemporaryPassword: jest.fn().mockResolvedValue(undefined),
      sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<KeycloakAdminService>;
    service = new UserService(keycloakAdmin);
    prismaMock = (service as unknown as { prisma: jest.Mocked<PrismaClient> }).prisma;
    kafkaMock = (
      service as unknown as {
        kafka: { connect: jest.Mock; publish: jest.Mock; disconnect: jest.Mock };
      }
    ).kafka;
  });

  describe('resetPassword', () => {
    it('sets a generated temporary password on Keycloak and returns it once with the display name', async () => {
      (prismaMock.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([{ keycloak_user_id: KC_USER_ID, display_name: 'สมชาย ใจดี' }]) // user
        .mockResolvedValueOnce([{ keycloak_realm: REALM }]); // tenant

      const result = await service.resetPassword(USER_ID, TENANT_ID, ACTOR_ID);

      // generateTempPassword shape: 4 upper · 4 lower · 3 digit, hyphen-grouped.
      expect(result.temporary_password).toMatch(/^[A-Z]{4}-[a-z]{4}-[0-9]{3}$/);
      expect(result.display_name).toBe('สมชาย ใจดี');
      // The plaintext returned is exactly what was pushed to Keycloak (temporary=true).
      expect(keycloakAdmin.setTemporaryPassword).toHaveBeenCalledWith(
        KC_USER_ID,
        REALM,
        result.temporary_password,
      );
      expect(kafkaMock.publish).toHaveBeenCalledTimes(1);
    });

    it('throws NotFoundException when the user is not found (or inactive) in the tenant', async () => {
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValueOnce([]); // no user

      await expect(service.resetPassword(USER_ID, TENANT_ID, ACTOR_ID)).rejects.toThrow(
        NotFoundException,
      );
      expect(keycloakAdmin.setTemporaryPassword).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the tenant is not found or inactive', async () => {
      (prismaMock.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([{ keycloak_user_id: KC_USER_ID, display_name: 'สมชาย ใจดี' }]) // user
        .mockResolvedValueOnce([]); // tenant not found

      await expect(service.resetPassword(USER_ID, TENANT_ID, ACTOR_ID)).rejects.toThrow(
        BadRequestException,
      );
      expect(keycloakAdmin.setTemporaryPassword).not.toHaveBeenCalled();
    });
  });

  describe('sendPasswordResetLink', () => {
    it('sends a 15-minute reset email via Keycloak and returns the target email', async () => {
      (prismaMock.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([{ keycloak_user_id: KC_USER_ID, email: 'w@a.com' }]) // user
        .mockResolvedValueOnce([{ keycloak_realm: REALM }]); // tenant

      const result = await service.sendPasswordResetLink(USER_ID, TENANT_ID, ACTOR_ID);

      expect(result).toEqual({ email: 'w@a.com' });
      expect(keycloakAdmin.sendPasswordResetEmail).toHaveBeenCalledWith(KC_USER_ID, REALM, 900);
      expect(kafkaMock.publish).toHaveBeenCalledTimes(1);
    });

    it('throws NotFoundException when the user is not found (or inactive) in the tenant', async () => {
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValueOnce([]); // no user

      await expect(service.sendPasswordResetLink(USER_ID, TENANT_ID, ACTOR_ID)).rejects.toThrow(
        NotFoundException,
      );
      expect(keycloakAdmin.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the user has no email on file (email null)', async () => {
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValueOnce([
        { keycloak_user_id: KC_USER_ID, email: null },
      ]); // user with no email

      await expect(service.sendPasswordResetLink(USER_ID, TENANT_ID, ACTOR_ID)).rejects.toThrow(
        BadRequestException,
      );
      expect(keycloakAdmin.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the tenant is not found or inactive', async () => {
      (prismaMock.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([{ keycloak_user_id: KC_USER_ID, email: 'w@a.com' }]) // user
        .mockResolvedValueOnce([]); // tenant not found

      await expect(service.sendPasswordResetLink(USER_ID, TENANT_ID, ACTOR_ID)).rejects.toThrow(
        BadRequestException,
      );
      expect(keycloakAdmin.sendPasswordResetEmail).not.toHaveBeenCalled();
    });
  });
});
