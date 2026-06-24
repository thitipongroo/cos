jest.mock('../client', () => ({
  apiClient: { post: jest.fn() },
}));

import { requestOtp, verifyOtp } from '../auth';
import { apiClient } from '../client';

const post = apiClient.post as jest.Mock;

describe('auth API (Path A)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('requestOtp POSTs the phone number and returns the body', async () => {
    post.mockResolvedValue({ data: { expiresInSeconds: 300 } });
    const res = await requestOtp('+66800000001');
    expect(post).toHaveBeenCalledWith('/auth/otp/request', { phoneNumber: '+66800000001' });
    expect(res).toEqual({ expiresInSeconds: 300 });
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
