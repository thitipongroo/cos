// Unit tests — User self-service Controller (§14 User Management APIs, self-service addition).
//
// The point of this controller is that it is NOT @Roles(TENANT_ADMIN)-gated like UserController: any
// authenticated role can reach it. What keeps a caller on their own row is that both routes pass the
// JWT's tenantId/userId — never anything from the request body or query. These tests assert exactly
// that, because a regression there is an IDOR (QM-4 OWASP Top 10), not a cosmetic bug.

import { UserMeController } from '../user-me.controller';
import type { TenantRequest } from '../tenant.middleware';

const mockSvc = {
  getMe: jest.fn(),
  updateMyPhoto: jest.fn(),
};

const TENANT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const USER_ID = 'aaaaaaaa-0000-0000-0000-000000000002';

const req = { tenantId: TENANT_ID, userId: USER_ID } as TenantRequest;

describe('UserMeController', () => {
  let ctrl: UserMeController;

  beforeEach(() => {
    jest.clearAllMocks();
    ctrl = new UserMeController(mockSvc as never);
  });

  describe('GET /users/me', () => {
    it('returns the caller’s own row, scoped by the JWT identity', async () => {
      const me = { user_id: USER_ID, tenant_id: TENANT_ID, display_name: 'สมชาย ใจดี' };
      mockSvc.getMe.mockResolvedValue(me);

      expect(await ctrl.me(req)).toBe(me);
      // tenantId + userId come from the request context (JWT), never from the caller's input.
      expect(mockSvc.getMe).toHaveBeenCalledWith(TENANT_ID, USER_ID);
    });
  });

  describe('PATCH /users/me/photo', () => {
    it('passes the photo URL through for the signed-in user', async () => {
      const updated = { user_id: USER_ID, photo_url: 'https://files/p.jpg' };
      mockSvc.updateMyPhoto.mockResolvedValue(updated);

      expect(await ctrl.updatePhoto(req, { photo_url: 'https://files/p.jpg' })).toBe(updated);
      expect(mockSvc.updateMyPhoto).toHaveBeenCalledWith(TENANT_ID, USER_ID, 'https://files/p.jpg');
    });

    it('sends null when photo_url is explicitly null (clearing the photo)', async () => {
      mockSvc.updateMyPhoto.mockResolvedValue({ user_id: USER_ID, photo_url: null });

      await ctrl.updatePhoto(req, { photo_url: null });

      expect(mockSvc.updateMyPhoto).toHaveBeenCalledWith(TENANT_ID, USER_ID, null);
    });

    it('normalises an omitted photo_url to null rather than undefined', async () => {
      // `photo_url` is optional on the DTO, and clearing the photo is the only way back to initials —
      // an omitted field must reach the service as an explicit null, not undefined.
      mockSvc.updateMyPhoto.mockResolvedValue({ user_id: USER_ID, photo_url: null });

      await ctrl.updatePhoto(req, {});

      expect(mockSvc.updateMyPhoto).toHaveBeenCalledWith(TENANT_ID, USER_ID, null);
    });
  });
});
