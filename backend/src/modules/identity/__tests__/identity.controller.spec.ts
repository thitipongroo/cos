// Unit tests for IdentityController — delegates to OtpService, IdentityService, MfaService

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

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { IdentityController } from '../identity.controller';

describe('IdentityController', () => {
  let controller: IdentityController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new IdentityController(
      mockOtpService as never,
      mockIdentityService as never,
      mockMfaService as never,
    );
  });

  describe('requestOtp', () => {
    it('delegates to otpService.requestOtp and returns result', async () => {
      mockOtpService.requestOtp.mockResolvedValue({ expiresInSeconds: 300 });
      const result = await controller.requestOtp({ phoneNumber: '+66812345678' });
      expect(mockOtpService.requestOtp).toHaveBeenCalledWith('+66812345678');
      expect(result).toEqual({ expiresInSeconds: 300 });
    });
  });

  describe('verifyOtp', () => {
    it('verifies OTP then issues tokens', async () => {
      const tokens = { access_token: 'at', refresh_token: 'rt' };
      mockOtpService.verifyOtp.mockResolvedValue(undefined);
      mockIdentityService.issueTokensForPhone.mockResolvedValue(tokens);

      const result = await controller.verifyOtp({ phoneNumber: '+66812345678', otp: '123456' });

      expect(mockOtpService.verifyOtp).toHaveBeenCalledWith('+66812345678', '123456');
      expect(mockIdentityService.issueTokensForPhone).toHaveBeenCalledWith('+66812345678');
      expect(result).toBe(tokens);
    });
  });

  describe('refresh', () => {
    it('delegates to identityService.refreshAccessToken', async () => {
      mockIdentityService.refreshAccessToken.mockResolvedValue({ access_token: 'new-at' });
      const result = await controller.refresh('old-refresh-token');
      expect(mockIdentityService.refreshAccessToken).toHaveBeenCalledWith('old-refresh-token');
      expect(result).toEqual({ access_token: 'new-at' });
    });
  });

  describe('logout', () => {
    it('delegates to identityService.logout', async () => {
      mockIdentityService.logout.mockResolvedValue(undefined);
      await controller.logout('refresh-token');
      expect(mockIdentityService.logout).toHaveBeenCalledWith('refresh-token');
    });
  });

  const fakeReq = (userId: string, sub: string) => ({ user: { user_id: userId, sub } }) as never;

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
      await controller.mfaVerify(fakeReq('user-1', 'user@example.com'), '123456');
      expect(mockMfaService.verifyAndActivate).toHaveBeenCalledWith('user-1', '123456');
    });
  });

  describe('mfaAuthenticate', () => {
    it('delegates to mfaService.authenticate', async () => {
      mockMfaService.authenticate.mockResolvedValue(undefined);
      await controller.mfaAuthenticate(fakeReq('user-1', 'user@example.com'), '654321');
      expect(mockMfaService.authenticate).toHaveBeenCalledWith('user-1', '654321');
    });
  });
});
