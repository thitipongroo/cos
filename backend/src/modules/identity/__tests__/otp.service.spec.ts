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
    expire: jest.fn(),
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
    service = new OtpService();
  });

  it('requestOtp returns expiresInSeconds', async () => {
    const result = await service.requestOtp('+66812345678');
    expect(result.expiresInSeconds).toBe(300);
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
