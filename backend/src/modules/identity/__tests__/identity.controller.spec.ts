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
  issueAttestationChallenge: jest.fn(),
};

const mockTrustScore = {
  report: jest.fn(),
};

const mockStepUp = {
  request: jest.fn(),
  verify: jest.fn(),
  consume: jest.fn(),
};

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { BadRequestException, NotFoundException } from '@nestjs/common';
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
      mockTrustScore as never,
      mockStepUp as never,
    );
  });

  // The trust score (ADR-081). What matters at this layer is that the identity comes from the JWT
  // and that a device the caller does not own is indistinguishable from one that does not exist.
  describe('GET devices/:deviceId/trust', () => {
    const req = { user: { user_id: 'u1', tenant_id: 't1' } } as never;

    it('scopes the lookup by the JWT’s own user and tenant', async () => {
      const report = { deviceId: 'd1', score: 82, scoredBy: 'RULES' };
      mockTrustScore.report.mockResolvedValue(report);

      await expect(controller.deviceTrustScore(req, 'd1')).resolves.toBe(report);
      expect(mockTrustScore.report).toHaveBeenCalledWith({
        tenantId: 't1',
        userId: 'u1',
        deviceId: 'd1',
      });
    });

    it('404s for another user’s device exactly as for an unknown one', async () => {
      // Both reach the service as "no row for this (user, device)" and must leave by the same door.
      // A 403-vs-404 distinction here would confirm that someone else's enrolment exists.
      mockTrustScore.report.mockResolvedValue(null);
      await expect(controller.deviceTrustScore(req, 'someone-elses')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // Step-up (ADR-078). What matters at this layer is that BOTH endpoints take the user id from the
  // JWT and never from the body: a step-up that could be requested "on behalf of" another user id
  // would mint that user's action token for whoever asked.
  describe('step-up', () => {
    const req = { user: { user_id: 'u1', tenant_id: 't1' } } as never;

    it('request delegates with the JWT user id and the requested action', async () => {
      const challenge = { channel: 'SMS', destinationHint: '••••4567', expiresInSeconds: 300 };
      mockStepUp.request.mockResolvedValue(challenge);

      await expect(controller.requestStepUp(req, { action: 'data-export' })).resolves.toBe(
        challenge,
      );
      expect(mockStepUp.request).toHaveBeenCalledWith('u1', 'data-export');
    });

    it('verify returns the action token under an explicit key', async () => {
      mockStepUp.verify.mockResolvedValue('TOKEN-123');
      await expect(
        controller.verifyStepUp(req, { action: 'data-export', code: '123456' }),
      ).resolves.toEqual({ actionToken: 'TOKEN-123' });
      expect(mockStepUp.verify).toHaveBeenCalledWith('u1', 'data-export', '123456');
    });

    it('propagates a rejected code rather than returning a token', async () => {
      mockStepUp.verify.mockRejectedValue(new BadRequestException('Invalid verification code'));
      await expect(
        controller.verifyStepUp(req, { action: 'data-export', code: '000000' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
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
        // Explicit nulls, not absent keys: a client with no Play Services omits these and the
        // service must be able to tell "not offered" apart from "offered and empty" (ADR-082).
        attestationToken: null,
        attestationChallenge: null,
        attestationKeyId: null,
      });
    });

    it('mints an attestation challenge for the JWT user, not a body-supplied one', async () => {
      // The device id comes from the body; the identity never does. Otherwise a caller could mint a
      // challenge bound to someone else's user and enrol against it.
      mockDeviceTrust.issueAttestationChallenge.mockResolvedValue('CHAL_B64U');
      await expect(
        controller.attestationChallenge(fakeReq('user-1', 'kc-1'), { deviceId: 'dev-1' }),
      ).resolves.toEqual({ challenge: 'CHAL_B64U' });
      expect(mockDeviceTrust.issueAttestationChallenge).toHaveBeenCalledWith('user-1', 'dev-1');
    });

    it('forwards the attestation token together with the challenge it answers', async () => {
      // The challenge is what makes the token non-replayable — both platforms are challenge-response
      // (ADR-083). Forwarding the token alone would hand the service a bearer credential.
      mockDeviceTrust.registerDevice.mockResolvedValue(undefined);
      await controller.registerDevice(fakeReq('user-1', 'kc-1', 'tenant-9'), {
        deviceId: 'dev-1',
        publicKey: 'PUB_B64U',
        platform: 'android',
        attestationToken: 'PLAY_INTEGRITY_TOKEN',
        attestationChallenge: 'CHAL_B64U',
      });
      expect(mockDeviceTrust.registerDevice).toHaveBeenCalledWith(
        expect.objectContaining({
          attestationToken: 'PLAY_INTEGRITY_TOKEN',
          attestationChallenge: 'CHAL_B64U',
        }),
      );
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

    it('revokeDevice passes the reason through — it is ADR-081’s only positive label', async () => {
      // Not defaulted anywhere along the path: whichever default were chosen would be wrong for the
      // other three cases, and a silently-labelled revocation is a silently-poisoned training set.
      mockDeviceTrust.revokeDevice.mockResolvedValue(undefined);
      await controller.revokeDevice(fakeReq('user-1', 'kc-1'), 'dev-1', {
        reason: 'COMPROMISED',
      });
      expect(mockDeviceTrust.revokeDevice).toHaveBeenCalledWith('user-1', 'dev-1', 'COMPROMISED');
    });

    it('passes an ordinary revocation through unchanged', async () => {
      mockDeviceTrust.revokeDevice.mockResolvedValue(undefined);
      await controller.revokeDevice(fakeReq('user-1', 'kc-1'), 'dev-1', {
        reason: 'LOST_OR_STOLEN',
      });
      expect(mockDeviceTrust.revokeDevice).toHaveBeenCalledWith(
        'user-1',
        'dev-1',
        'LOST_OR_STOLEN',
      );
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
