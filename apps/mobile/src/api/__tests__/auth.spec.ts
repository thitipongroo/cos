jest.mock('../client', () => ({
  apiClient: { post: jest.fn() },
}));

import { requestOtp, verifyOtp, attestDevice } from '../auth';
import { apiClient } from '../client';

const post = apiClient.post as jest.Mock;

describe('auth API (Path A)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('requestOtp POSTs the phone number and returns the body (with the resend cooldown)', async () => {
    post.mockResolvedValue({ data: { expiresInSeconds: 300, resendCooldownSeconds: 60 } });
    const res = await requestOtp('+66800000001');
    expect(post).toHaveBeenCalledWith('/auth/otp/request', { phoneNumber: '+66800000001' });
    expect(res).toEqual({ expiresInSeconds: 300, resendCooldownSeconds: 60 });
  });

  it('requestOtp includes the deviceId when supplied (device trust)', async () => {
    post.mockResolvedValue({ data: { expiresInSeconds: 300, challenge: 'CH' } });
    const res = await requestOtp('+66800000001', 'dev-1');
    expect(post).toHaveBeenCalledWith('/auth/otp/request', {
      phoneNumber: '+66800000001',
      deviceId: 'dev-1',
    });
    expect(res.challenge).toBe('CH');
  });

  it('attestDevice POSTs the signature and returns the trust verdict', async () => {
    post.mockResolvedValue({ data: { deviceTrusted: true } });
    const res = await attestDevice('+66800000001', 'dev-1', 'SIG');
    expect(post).toHaveBeenCalledWith('/auth/otp/attest', {
      phoneNumber: '+66800000001',
      deviceId: 'dev-1',
      signature: 'SIG',
    });
    expect(res).toEqual({ deviceTrusted: true });
  });

  it('verifyOtp POSTs phone + otp and returns the tokens', async () => {
    const tokens = { accessToken: 'a', refreshToken: 'r', expiresIn: 60, refreshExpiresIn: 120 };
    post.mockResolvedValue({ data: tokens });
    const res = await verifyOtp('+66800000001', '123456');
    expect(post).toHaveBeenCalledWith('/auth/otp/verify', {
      phoneNumber: '+66800000001',
      otp: '123456',
    });
    expect(res).toEqual(tokens);
  });
});
