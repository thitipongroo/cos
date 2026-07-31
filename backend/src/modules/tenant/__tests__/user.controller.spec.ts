// Unit tests for UserController — delegates to UserService

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

const mockUserService = {
  listUsers: jest.fn(),
  createUser: jest.fn(),
  changeRole: jest.fn(),
  getUserRoles: jest.fn(),
  setUserRoles: jest.fn(),
  resetPassword: jest.fn(),
  sendPasswordResetLink: jest.fn(),
  deactivateUser: jest.fn(),
};

import { UserController } from '../user.controller';
import { CosRole } from '@cos/types';

const TENANT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const USER_ID = 'aaaaaaaa-0000-0000-0000-000000000003';

const fakeReq = (tenantId = TENANT_ID, userId = 'actor-1') => ({ tenantId, userId }) as never;

describe('UserController', () => {
  let controller: UserController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new UserController(mockUserService as never);
  });

  describe('list', () => {
    const paginatedEmpty = { data: [], pagination: { limit: 50, offset: 0, page: 1, total: 0 } };

    it('uses default limit=50 offset=0 when no query params', async () => {
      mockUserService.listUsers.mockResolvedValue(paginatedEmpty);
      const result = await controller.list(fakeReq());
      expect(mockUserService.listUsers).toHaveBeenCalledWith(TENANT_ID, { limit: 50, offset: 0 });
      expect(result).toBe(paginatedEmpty);
    });

    it('passes parsed limit and offset from query string', async () => {
      mockUserService.listUsers.mockResolvedValue(paginatedEmpty);
      await controller.list(fakeReq(), '20', '40');
      expect(mockUserService.listUsers).toHaveBeenCalledWith(TENANT_ID, { limit: 20, offset: 40 });
    });

    it('clamps limit to max 200', async () => {
      mockUserService.listUsers.mockResolvedValue(paginatedEmpty);
      await controller.list(fakeReq(), '999');
      expect(mockUserService.listUsers).toHaveBeenCalledWith(TENANT_ID, { limit: 200, offset: 0 });
    });

    it('clamps invalid limit to default 50', async () => {
      mockUserService.listUsers.mockResolvedValue(paginatedEmpty);
      await controller.list(fakeReq(), 'abc');
      expect(mockUserService.listUsers).toHaveBeenCalledWith(TENANT_ID, { limit: 50, offset: 0 });
    });
  });

  describe('create', () => {
    it('delegates to userService.createUser and returns created user', async () => {
      const dto = {
        display_name: 'สมชาย',
        phone_number: '+66812345678',
        role: CosRole.SITE_ENGINEER,
      };
      const created = { user_id: USER_ID, role: CosRole.SITE_ENGINEER };
      mockUserService.createUser.mockResolvedValue(created);

      const result = await controller.create(dto as never, fakeReq());
      expect(mockUserService.createUser).toHaveBeenCalledWith(dto, TENANT_ID, 'actor-1');
      expect(result).toBe(created);
    });

    it('falls back to "system" actor when req.userId is undefined', async () => {
      const dto = {
        display_name: 'สมชาย',
        phone_number: '+66812345678',
        role: CosRole.SITE_ENGINEER,
      };
      mockUserService.createUser.mockResolvedValue({});
      await controller.create(dto as never, { tenantId: TENANT_ID, userId: undefined } as never);
      expect(mockUserService.createUser).toHaveBeenCalledWith(dto, TENANT_ID, 'system');
    });
  });

  describe('changeRole', () => {
    it('delegates to userService.changeRole', async () => {
      mockUserService.changeRole.mockResolvedValue(undefined);
      const dto = { role: CosRole.FINANCE };
      await controller.changeRole(USER_ID, dto as never, fakeReq());
      expect(mockUserService.changeRole).toHaveBeenCalledWith(USER_ID, dto, TENANT_ID, 'actor-1');
    });

    it('falls back to "system" actor when req.userId is undefined', async () => {
      mockUserService.changeRole.mockResolvedValue(undefined);
      const dto = { role: CosRole.FINANCE };
      await controller.changeRole(
        USER_ID,
        dto as never,
        { tenantId: TENANT_ID, userId: undefined } as never,
      );
      expect(mockUserService.changeRole).toHaveBeenCalledWith(USER_ID, dto, TENANT_ID, 'system');
    });
  });

  describe('getRoles', () => {
    it('delegates to userService.getUserRoles and returns the result', async () => {
      const roles = { primary: CosRole.FINANCE, additional: [CosRole.SITE_ENGINEER] };
      mockUserService.getUserRoles.mockResolvedValue(roles);
      const result = await controller.getRoles(USER_ID, fakeReq());
      expect(mockUserService.getUserRoles).toHaveBeenCalledWith(USER_ID, TENANT_ID);
      expect(result).toBe(roles);
    });
  });

  describe('setRoles', () => {
    it('delegates to userService.setUserRoles', async () => {
      mockUserService.setUserRoles.mockResolvedValue(undefined);
      const dto = { primary: CosRole.FINANCE, additional: [CosRole.SITE_ENGINEER] };
      await controller.setRoles(USER_ID, dto as never, fakeReq());
      expect(mockUserService.setUserRoles).toHaveBeenCalledWith(USER_ID, dto, TENANT_ID, 'actor-1');
    });

    it('falls back to "system" actor when req.userId is undefined', async () => {
      mockUserService.setUserRoles.mockResolvedValue(undefined);
      const dto = { primary: CosRole.FINANCE, additional: [] };
      await controller.setRoles(
        USER_ID,
        dto as never,
        { tenantId: TENANT_ID, userId: undefined } as never,
      );
      expect(mockUserService.setUserRoles).toHaveBeenCalledWith(USER_ID, dto, TENANT_ID, 'system');
    });
  });

  describe('resetPassword', () => {
    it('delegates to userService.resetPassword and returns the temp password', async () => {
      const issued = { temporary_password: 'Xk9!temp', must_change: true };
      mockUserService.resetPassword.mockResolvedValue(issued);
      const result = await controller.resetPassword(USER_ID, fakeReq());
      expect(mockUserService.resetPassword).toHaveBeenCalledWith(USER_ID, TENANT_ID, 'actor-1');
      expect(result).toBe(issued);
    });

    it('falls back to "system" actor when req.userId is undefined', async () => {
      mockUserService.resetPassword.mockResolvedValue({});
      await controller.resetPassword(USER_ID, { tenantId: TENANT_ID, userId: undefined } as never);
      expect(mockUserService.resetPassword).toHaveBeenCalledWith(USER_ID, TENANT_ID, 'system');
    });
  });

  describe('sendResetEmail', () => {
    it('delegates to userService.sendPasswordResetLink and returns the result', async () => {
      const sent = { emailed: true };
      mockUserService.sendPasswordResetLink.mockResolvedValue(sent);
      const result = await controller.sendResetEmail(USER_ID, fakeReq());
      expect(mockUserService.sendPasswordResetLink).toHaveBeenCalledWith(
        USER_ID,
        TENANT_ID,
        'actor-1',
      );
      expect(result).toBe(sent);
    });

    it('falls back to "system" actor when req.userId is undefined', async () => {
      mockUserService.sendPasswordResetLink.mockResolvedValue({});
      await controller.sendResetEmail(USER_ID, { tenantId: TENANT_ID, userId: undefined } as never);
      expect(mockUserService.sendPasswordResetLink).toHaveBeenCalledWith(
        USER_ID,
        TENANT_ID,
        'system',
      );
    });
  });

  describe('deactivate', () => {
    it('delegates to userService.deactivateUser', async () => {
      mockUserService.deactivateUser.mockResolvedValue(undefined);
      await controller.deactivate(USER_ID, fakeReq());
      expect(mockUserService.deactivateUser).toHaveBeenCalledWith(USER_ID, TENANT_ID, 'actor-1');
    });

    it('falls back to "system" actor when req.userId is undefined', async () => {
      mockUserService.deactivateUser.mockResolvedValue(undefined);
      await controller.deactivate(USER_ID, { tenantId: TENANT_ID, userId: undefined } as never);
      expect(mockUserService.deactivateUser).toHaveBeenCalledWith(USER_ID, TENANT_ID, 'system');
    });
  });
});
