// Unit tests for UserService — user lifecycle within a tenant

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    $queryRaw: jest.fn(),
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
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
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
  });

  // ─── changeRole ──────────────────────────────────────────────────────────

  describe('changeRole', () => {
    it('updates membership role and emits user.role_changed', async () => {
      (prismaMock.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([{ role: CosRole.SITE_ENGINEER }]) // SELECT membership
        .mockResolvedValueOnce([{}]); // UPDATE

      await expect(
        service.changeRole(USER_ID, { role: CosRole.PROJECT_MANAGER }, TENANT_ID, ACTOR_ID),
      ).resolves.toBeUndefined();
    });

    it('throws NotFoundException when user not in tenant', async () => {
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([]);
      await expect(
        service.changeRole(USER_ID, { role: CosRole.FINANCE }, TENANT_ID, ACTOR_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── deactivateUser ──────────────────────────────────────────────────────

  describe('deactivateUser', () => {
    it('deactivates an active user', async () => {
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([{ user_id: USER_ID }]);
      await expect(service.deactivateUser(USER_ID, TENANT_ID, ACTOR_ID)).resolves.toBeUndefined();
    });

    it('throws NotFoundException when user not found or already inactive', async () => {
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([]);
      await expect(service.deactivateUser(USER_ID, TENANT_ID, ACTOR_ID)).rejects.toThrow(
        NotFoundException,
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
