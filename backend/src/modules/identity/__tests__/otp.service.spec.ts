// Unit tests for OtpService — validates OTP logic without real Redis or SNS.

import { BadRequestException } from '@nestjs/common';

// Mock ioredis before importing OtpService
const redisMock: Record<string, string> = {};
const expiryMock: Record<string, number> = {};

jest.mock('ioredis', () => ({
  Redis: jest.fn().mockImplementation(() => ({
    set: jest.fn(async (key: string, value: string, _ex?: string, ttl?: number) => {
      redisMock[key] = value;
      if (ttl) expiryMock[key] = ttl;
    }),
    get: jest.fn(async (key: string) => redisMock[key] ?? null),
    del: jest.fn(async (...keys: string[]) => {
      keys.forEach((k) => delete redisMock[k]);
    }),
    incr: jest.fn(async (key: string) => {
      redisMock[key] = String(parseInt(redisMock[key] ?? '0', 10) + 1);
      return parseInt(redisMock[key]!, 10);
    }),
    // Mirrors ioredis TTL semantics: seconds left, -1 (no expiry), or -2 (no key).
    ttl: jest.fn(async (key: string) =>
      key in expiryMock ? expiryMock[key] : key in redisMock ? -1 : -2,
    ),
    expire: jest.fn(),
    quit: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('@aws-sdk/client-sns', () => ({
  SNSClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({}),
  })),
  PublishCommand: jest.fn(),
}));

// Force dev mode so SMS is not sent
process.env['NODE_ENV'] = 'development';

import { OtpService } from '../otp/otp.service';

describe('OtpService', () => {
  let service: OtpService;

  beforeEach(() => {
    Object.keys(redisMock).forEach((k) => delete redisMock[k]);
    Object.keys(expiryMock).forEach((k) => delete expiryMock[k]);
    service = new OtpService();
  });

  it('requestOtp returns expiresInSeconds and the resend cooldown', async () => {
    const result = await service.requestOtp('+66812345678');
    expect(result.expiresInSeconds).toBe(300);
    expect(result.resendCooldownSeconds).toBe(60);
  });

  it('blocks a resend within the 60s cooldown, with retryAfterSeconds', async () => {
    await service.requestOtp('+66812345678'); // opens the cooldown window
    await expect(service.requestOtp('+66812345678')).rejects.toMatchObject({
      status: 429,
      response: { retryAfterSeconds: 60 },
    });
  });

  it('allows the next send once the cooldown key has expired', async () => {
    await service.requestOtp('+66812345678');
    // Simulate the cooldown key expiring (ioredis would return -2 once gone).
    delete redisMock['otp:cooldown:+66812345678'];
    delete expiryMock['otp:cooldown:+66812345678'];
    await expect(service.requestOtp('+66812345678')).resolves.toMatchObject({
      resendCooldownSeconds: 60,
    });
  });

  it('verifyOtp succeeds with correct OTP', async () => {
    await service.requestOtp('+66812345678');
    const otp = redisMock['otp:value:+66812345678']!;
    const result = await service.verifyOtp('+66812345678', otp);
    expect(result).toBe(true);
  });

  it('verifyOtp throws BadRequestException for wrong OTP', async () => {
    await service.requestOtp('+66812345678');
    await expect(service.verifyOtp('+66812345678', '000000')).rejects.toThrow(BadRequestException);
  });

  it('verifyOtp throws BadRequestException when OTP not requested', async () => {
    await expect(service.verifyOtp('+66812345679', '123456')).rejects.toThrow(BadRequestException);
  });

  it('verifyOtp throws BadRequestException for an OTP of the wrong length (constant-time guard)', async () => {
    await service.requestOtp('+66812345678');
    // 5-digit submission — exercises the length-mismatch branch before timingSafeEqual.
    await expect(service.verifyOtp('+66812345678', '12345')).rejects.toThrow(BadRequestException);
  });

  it('verifyOtp throws TooManyRequestsException after 3 failed attempts', async () => {
    await service.requestOtp('+66812345678');
    // 3 failed attempts
    for (let i = 0; i < 3; i++) {
      try {
        await service.verifyOtp('+66812345678', '000000');
      } catch {}
    }
    await expect(service.verifyOtp('+66812345678', '000000')).rejects.toMatchObject({
      status: 429,
    });
  });

  it('requestOtp throws TooManyRequestsException after daily limit', async () => {
    // Simulate 10 requests already made today
    const dailyKey = `otp:daily:+66812345678:${new Date().toISOString().slice(0, 10)}`;
    redisMock[dailyKey] = '10';
    await expect(service.requestOtp('+66812345678')).rejects.toMatchObject({ status: 429 });
  });
});

describe('OtpService — production SNS path (line 105)', () => {
  const originalEnv = process.env['NODE_ENV'];

  beforeEach(() => {
    Object.keys(redisMock).forEach((k) => delete redisMock[k]);
    Object.keys(expiryMock).forEach((k) => delete expiryMock[k]);
  });

  afterEach(() => {
    process.env['NODE_ENV'] = originalEnv;
  });

  it('calls SNS send when NODE_ENV is not development', async () => {
    process.env['NODE_ENV'] = 'production';
    // Re-create service so it picks up the new env
    const prodService = new OtpService();
    const snsMock = (prodService as unknown as { sns: { send: jest.Mock } }).sns;
    snsMock.send = jest.fn().mockResolvedValue({});

    await prodService.requestOtp('+66812345678');
    expect(snsMock.send).toHaveBeenCalledTimes(1);
  });
});

describe('OtpService — E2E auth bypass (double-gated)', () => {
  const orig = {
    bypass: process.env['E2E_AUTH_BYPASS'],
    testOtp: process.env['E2E_TEST_OTP'],
    env: process.env['NODE_ENV'],
  };

  beforeEach(() => {
    Object.keys(redisMock).forEach((k) => delete redisMock[k]);
    Object.keys(expiryMock).forEach((k) => delete expiryMock[k]);
  });

  afterEach(() => {
    const restore = (k: string, v: string | undefined) =>
      v === undefined ? delete process.env[k] : (process.env[k] = v);
    restore('E2E_AUTH_BYPASS', orig.bypass);
    restore('E2E_TEST_OTP', orig.testOtp);
    restore('NODE_ENV', orig.env);
  });

  it('stores the default fixed OTP 123456 when bypass is enabled (non-production)', async () => {
    process.env['E2E_AUTH_BYPASS'] = 'true';
    process.env['NODE_ENV'] = 'development';
    delete process.env['E2E_TEST_OTP'];
    await new OtpService().requestOtp('+66800000001');
    expect(redisMock['otp:value:+66800000001']).toBe('123456');
  });

  it('skips resend-cooldown ENFORCEMENT under bypass so suites can re-request back-to-back', async () => {
    process.env['E2E_AUTH_BYPASS'] = 'true';
    process.env['NODE_ENV'] = 'development';
    delete process.env['E2E_TEST_OTP'];
    const svc = new OtpService();
    await svc.requestOtp('+66800000009');
    // The second request must NOT throw a cooldown 429; the advertised duration is still returned.
    await expect(svc.requestOtp('+66800000009')).resolves.toMatchObject({
      resendCooldownSeconds: 60,
    });
  });

  it('honours the E2E_TEST_OTP override when bypass is enabled', async () => {
    process.env['E2E_AUTH_BYPASS'] = 'true';
    process.env['NODE_ENV'] = 'development';
    process.env['E2E_TEST_OTP'] = '999999';
    await new OtpService().requestOtp('+66800000002');
    expect(redisMock['otp:value:+66800000002']).toBe('999999');
  });

  it('hard-gates the bypass OFF in production even if E2E_AUTH_BYPASS=true', async () => {
    process.env['E2E_AUTH_BYPASS'] = 'true';
    process.env['NODE_ENV'] = 'production';
    process.env['E2E_TEST_OTP'] = '123456';
    const svc = new OtpService();
    (svc as unknown as { sns: { send: jest.Mock } }).sns.send = jest.fn().mockResolvedValue({});
    await svc.requestOtp('+66800000003');
    // Bypass returned null (production gate) → a random 6-digit OTP was generated, not the fixed one.
    expect(redisMock['otp:value:+66800000003']).toMatch(/^\d{6}$/);
  });
});

describe('OtpService onModuleDestroy', () => {
  it('quits the Redis connection on shutdown', async () => {
    const svc = new OtpService();
    await svc.onModuleDestroy();
    expect((svc as unknown as { redis: { quit: jest.Mock } }).redis.quit).toHaveBeenCalledTimes(1);
  });
});
