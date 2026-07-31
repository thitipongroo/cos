// Unit tests for IdentityController — delegates to OtpService, IdentityService, MfaService,
// DeviceTrustService

const mockOtpService = {
  requestOtp: jest.fn(),
  verifyOtp: jest.fn(),
};

const mockIdentityService = {
  issueTokensForPhone: jest.fn(),
  refreshAccessToken: jest.fn(),
  logout: jest.fn(),
};

const mockMfaService = {
  generateEnrollmentSecret: jest.fn(),
  verifyAndActivate: jest.fn(),
  authenticate: jest.fn(),
};

const mockDeviceTrust = {
  issueChallenge: jest.fn(),
  evaluateTrust: jest.fn(),
  registerDevice: jest.fn(),
  listDevices: jest.fn(),
  revokeDevice: jest.fn(),
};

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { BadRequestException } from '@nestjs/common';
import { CosRole } from '@cos/types';
import { ROLE_PERMISSIONS } from '@cos/rbac';
import { IdentityController } from '../identity.controller';

describe('IdentityController', () => {
  let controller: IdentityController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new IdentityController(
      mockOtpService as never,
      mockIdentityService as never,
      mockMfaService as never,
      mockDeviceTrust as never,
    );
  });

  describe('requestOtp', () => {
    it('delegates to otpService.requestOtp and returns result', async () => {
      mockOtpService.requestOtp.mockResolvedValue({ expiresInSeconds: 300 });
      const result = await controller.requestOtp({ phoneNumber: '+66812345678' });
      expect(mockOtpService.requestOtp).toHaveBeenCalledWith('+66812345678');
      expect(result).toEqual({ expiresInSeconds: 300 });
      // No deviceId → no challenge minted.
      expect(mockDeviceTrust.issueChallenge).not.toHaveBeenCalled();
    });

    it('mints a device-trust challenge when a deviceId is supplied', async () => {
      mockOtpService.requestOtp.mockResolvedValue({ expiresInSeconds: 300 });
      mockDeviceTrust.issueChallenge.mockResolvedValue('CHALLENGE_B64U');
      const result = await controller.requestOtp({
        phoneNumber: '+66812345678',
        deviceId: 'dev-1',
      });
      expect(mockDeviceTrust.issueChallenge).toHaveBeenCalledWith('+66812345678', 'dev-1');
      expect(result).toEqual({ expiresInSeconds: 300, challenge: 'CHALLENGE_B64U' });
    });
  });

  describe('verifyOtp', () => {
    it('verifies OTP then issues tokens (login is plain — trust is a separate step)', async () => {
      const tokens = {
        accessToken: 'at',
        refreshToken: 'rt',
        expiresIn: 900,
        refreshExpiresIn: 604800,
      };
      mockOtpService.verifyOtp.mockResolvedValue(undefined);
      mockIdentityService.issueTokensForPhone.mockResolvedValue(tokens);

      const result = await controller.verifyOtp({ phoneNumber: '+66812345678', otp: '123456' });

      expect(mockOtpService.verifyOtp).toHaveBeenCalledWith('+66812345678', '123456');
      expect(mockIdentityService.issueTokensForPhone).toHaveBeenCalledWith('+66812345678');
      expect(mockDeviceTrust.evaluateTrust).not.toHaveBeenCalled();
      expect(result).toBe(tokens);
    });
  });

  describe('attestDevice', () => {
    it('reports the device-trust verdict for the OTP banner', async () => {
      mockDeviceTrust.evaluateTrust.mockResolvedValue(true);
      const result = await controller.attestDevice({
        phoneNumber: '+66812345678',
        deviceId: 'dev-1',
        signature: 'SIG_B64U',
      });
      expect(mockDeviceTrust.evaluateTrust).toHaveBeenCalledWith({
        phoneNumber: '+66812345678',
        deviceId: 'dev-1',
        signature: 'SIG_B64U',
      });
      expect(result).toEqual({ deviceTrusted: true });
    });

    it('returns deviceTrusted:false when the check fails', async () => {
      mockDeviceTrust.evaluateTrust.mockResolvedValue(false);
      const result = await controller.attestDevice({
        phoneNumber: '+66812345678',
        deviceId: 'dev-1',
        signature: 'BAD',
      });
      expect(result).toEqual({ deviceTrusted: false });
    });
  });

  describe('refresh', () => {
    it('delegates to identityService.refreshAccessToken and returns rotated tokens', async () => {
      const tokenResult = {
        accessToken: 'new-at',
        refreshToken: 'new-rt',
        expiresIn: 900,
        refreshExpiresIn: 604800,
      };
      mockIdentityService.refreshAccessToken.mockResolvedValue(tokenResult);
      const result = await controller.refresh({ refreshToken: 'old-refresh-token' });
      expect(mockIdentityService.refreshAccessToken).toHaveBeenCalledWith('old-refresh-token');
      expect(result).toEqual(tokenResult);
    });
  });

  describe('logout', () => {
    it('delegates to identityService.logout', async () => {
      mockIdentityService.logout.mockResolvedValue(undefined);
      await controller.logout({ refreshToken: 'refresh-token' });
      expect(mockIdentityService.logout).toHaveBeenCalledWith('refresh-token');
    });
  });

  const fakeReq = (userId: string, sub: string, tenantId = 'tenant-1') =>
    ({ user: { user_id: userId, tenant_id: tenantId, sub } }) as never;

  describe('device trust endpoints', () => {
    it('registerDevice delegates to deviceTrust.registerDevice with the JWT identity', async () => {
      mockDeviceTrust.registerDevice.mockResolvedValue(undefined);
      await controller.registerDevice(fakeReq('user-1', 'kc-1', 'tenant-9'), {
        deviceId: 'dev-1',
        publicKey: 'PUB_B64U',
        platform: 'android',
        model: 'Pixel 8',
      });
      expect(mockDeviceTrust.registerDevice).toHaveBeenCalledWith({
        userId: 'user-1',
        tenantId: 'tenant-9',
        deviceId: 'dev-1',
        publicKey: 'PUB_B64U',
        platform: 'android',
        model: 'Pixel 8',
      });
    });

    it('registerDevice passes null when model is omitted', async () => {
      mockDeviceTrust.registerDevice.mockResolvedValue(undefined);
      await controller.registerDevice(fakeReq('user-1', 'kc-1'), {
        deviceId: 'dev-1',
        publicKey: 'PUB_B64U',
        platform: 'ios',
      });
      expect(mockDeviceTrust.registerDevice).toHaveBeenCalledWith(
        expect.objectContaining({ model: null }),
      );
    });

    it('listDevices delegates for the authenticated user', async () => {
      const devices = [{ deviceId: 'dev-1', platform: 'android' }];
      mockDeviceTrust.listDevices.mockResolvedValue(devices);
      const res = await controller.listDevices(fakeReq('user-1', 'kc-1'));
      expect(mockDeviceTrust.listDevices).toHaveBeenCalledWith('user-1');
      expect(res).toBe(devices);
    });

    it('revokeDevice delegates for the authenticated user', async () => {
      mockDeviceTrust.revokeDevice.mockResolvedValue(undefined);
      await controller.revokeDevice(fakeReq('user-1', 'kc-1'), 'dev-1');
      expect(mockDeviceTrust.revokeDevice).toHaveBeenCalledWith('user-1', 'dev-1');
    });
  });

  describe('getRolePermissions', () => {
    it('returns the static RBAC grant set for a known role (§6.4)', () => {
      const result = controller.getRolePermissions(CosRole.FINANCE);
      expect(result).toEqual({
        role: CosRole.FINANCE,
        permissions: ROLE_PERMISSIONS[CosRole.FINANCE],
      });
    });

    it('rejects an unknown role with BadRequestException', () => {
      expect(() => controller.getRolePermissions('NOT_A_ROLE')).toThrow(BadRequestException);
      expect(() => controller.getRolePermissions('NOT_A_ROLE')).toThrow('Unknown role: NOT_A_ROLE');
    });
  });

  describe('mfaEnroll', () => {
    it('delegates to mfaService.generateEnrollmentSecret', async () => {
      const result = { otpAuthUrl: 'otpauth://...', secret: 'BASE32' };
      mockMfaService.generateEnrollmentSecret.mockResolvedValue(result);
      const res = await controller.mfaEnroll(fakeReq('user-1', 'user@example.com'));
      expect(mockMfaService.generateEnrollmentSecret).toHaveBeenCalledWith(
        'user-1',
        'user@example.com',
      );
      expect(res).toBe(result);
    });
  });

  describe('mfaVerify', () => {
    it('delegates to mfaService.verifyAndActivate', async () => {
      mockMfaService.verifyAndActivate.mockResolvedValue(undefined);
      await controller.mfaVerify(fakeReq('user-1', 'user@example.com'), { token: '123456' });
      expect(mockMfaService.verifyAndActivate).toHaveBeenCalledWith('user-1', '123456');
    });
  });

  describe('mfaAuthenticate', () => {
    it('delegates to mfaService.authenticate', async () => {
      mockMfaService.authenticate.mockResolvedValue(undefined);
      await controller.mfaAuthenticate(fakeReq('user-1', 'user@example.com'), { token: '654321' });
      expect(mockMfaService.authenticate).toHaveBeenCalledWith('user-1', '654321');
    });
  });
});
