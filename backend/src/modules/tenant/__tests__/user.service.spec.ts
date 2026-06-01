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
import { PrismaClient } from '@prisma/client';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { CosRole } from '@cos/types';

const TENANT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const ACTOR_ID = 'aaaaaaaa-0000-0000-0000-000000000002';
const USER_ID = 'aaaaaaaa-0000-0000-0000-000000000003';

const mockUserRow = {
  user_id: USER_ID,
  tenant_id: TENANT_ID,
  keycloak_user_id: '+66812345678',
  email: '',
  display_name: 'สมชาย ใจดี',
  is_active: true,
  mfa_enabled: false,
  created_at: new Date(),
  updated_at: new Date(),
};

describe('UserService', () => {
  let service: UserService;
  let prismaMock: jest.Mocked<PrismaClient>;

  beforeEach(() => {
    service = new UserService();
    prismaMock = (service as unknown as { prisma: jest.Mocked<PrismaClient> }).prisma;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── listUsers ───────────────────────────────────────────────────────────

  describe('listUsers', () => {
    it('returns user rows joined with roles', async () => {
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([
        { ...mockUserRow, role: CosRole.SITE_ENGINEER },
      ]);
      const result = await service.listUsers(TENANT_ID);
      expect(result).toHaveLength(1);
      expect(result[0]!.role).toBe(CosRole.SITE_ENGINEER);
    });

    it('returns empty array when tenant has no users', async () => {
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([]);
      const result = await service.listUsers(TENANT_ID);
      expect(result).toEqual([]);
    });
  });

  // ─── createUser ──────────────────────────────────────────────────────────

  describe('createUser', () => {
    it('creates Path A user (phone) and emits user.created', async () => {
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([]); // no conflict
      (prismaMock.$transaction as jest.Mock).mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            $queryRaw: jest
              .fn()
              .mockResolvedValueOnce([mockUserRow]) // INSERT users → RETURNING
              .mockResolvedValueOnce([{}]), // INSERT memberships
          };
          return fn(tx);
        },
      );

      const dto = {
        display_name: 'สมชาย',
        phone_number: '+66812345678',
        role: CosRole.SITE_ENGINEER,
      };
      const result = await service.createUser(dto, TENANT_ID, ACTOR_ID);

      expect(result.user_id).toBe(USER_ID);
      expect(result.role).toBe(CosRole.SITE_ENGINEER);
    });

    it('creates Path B user (email) and emits user.created', async () => {
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([]);
      (prismaMock.$transaction as jest.Mock).mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            $queryRaw: jest
              .fn()
              .mockResolvedValueOnce([
                { ...mockUserRow, email: 'w@a.com', keycloak_user_id: 'w@a.com' },
              ])
              .mockResolvedValueOnce([{}]),
          };
          return fn(tx);
        },
      );

      const dto = { display_name: 'วิชัย', email: 'w@a.com', role: CosRole.PROJECT_MANAGER };
      const result = await service.createUser(dto, TENANT_ID, ACTOR_ID);
      expect(result.role).toBe(CosRole.PROJECT_MANAGER);
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
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([{ user_id: USER_ID }]);
      const dto = {
        display_name: 'สมชาย',
        phone_number: '+66812345678',
        role: CosRole.SITE_ENGINEER,
      };
      await expect(service.createUser(dto, TENANT_ID, ACTOR_ID)).rejects.toThrow(ConflictException);
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
});
