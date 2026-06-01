// Unit tests for UserController — delegates to UserService

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

const mockUserService = {
  listUsers: jest.fn(),
  createUser: jest.fn(),
  changeRole: jest.fn(),
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
    it('delegates to userService.listUsers with tenantId from request', async () => {
      mockUserService.listUsers.mockResolvedValue([]);
      const result = await controller.list(fakeReq());
      expect(mockUserService.listUsers).toHaveBeenCalledWith(TENANT_ID);
      expect(result).toEqual([]);
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
  });

  describe('changeRole', () => {
    it('delegates to userService.changeRole', async () => {
      mockUserService.changeRole.mockResolvedValue(undefined);
      const dto = { role: CosRole.FINANCE };
      await controller.changeRole(USER_ID, dto as never, fakeReq());
      expect(mockUserService.changeRole).toHaveBeenCalledWith(USER_ID, dto, TENANT_ID, 'actor-1');
    });
  });

  describe('deactivate', () => {
    it('delegates to userService.deactivateUser', async () => {
      mockUserService.deactivateUser.mockResolvedValue(undefined);
      await controller.deactivate(USER_ID, fakeReq());
      expect(mockUserService.deactivateUser).toHaveBeenCalledWith(USER_ID, TENANT_ID, 'actor-1');
    });
  });
});
