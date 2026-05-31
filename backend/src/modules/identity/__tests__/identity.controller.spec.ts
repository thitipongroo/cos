// Unit tests for IdentityController — delegates to OtpService and IdentityService

const mockOtpService = {
  requestOtp: jest.fn(),
  verifyOtp: jest.fn(),
};

const mockIdentityService = {
  issueTokensForPhone: jest.fn(),
  refreshAccessToken: jest.fn(),
  logout: jest.fn(),
};

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { IdentityController } from '../identity.controller';

describe('IdentityController', () => {
  let controller: IdentityController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new IdentityController(mockOtpService as never, mockIdentityService as never);
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
});
