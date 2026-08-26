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
    // refundDailyLimit() is the only eval() caller: "DECR the key only if it still exists". The mock
    // implements that contract rather than a Lua interpreter — an unconditional DECR here would pass
    // while hiding the expiry race the real script exists to close.
    eval: jest.fn(async (_script: string, _numKeys: number, key: string) => {
      if (!(key in redisMock)) return 0;
      redisMock[key] = String(parseInt(redisMock[key]!, 10) - 1);
      return parseInt(redisMock[key]!, 10);
    }),
    quit: jest.fn().mockResolvedValue(undefined),
  })),
}));

// Force dev mode so SMS is not sent
process.env['NODE_ENV'] = 'development';

import { OtpService } from '../otp/otp.service';
import type { SmsSender } from '../otp/sms-sender';

// SNS is no longer this service's concern — delivery moved behind the ADR-040 SmsSender port, so the
// double here is the port, not the AWS SDK. That is the point of the refactor: OtpService's tests no
// longer assert anything about a cloud vendor, and the same suite covers an on-prem deployment.
let smsSender: jest.Mocked<SmsSender>;

describe('OtpService', () => {
  let service: OtpService;

  beforeEach(() => {
    Object.keys(redisMock).forEach((k) => delete redisMock[k]);
    Object.keys(expiryMock).forEach((k) => delete expiryMock[k]);
    smsSender = { sendSms: jest.fn().mockResolvedValue(undefined) };
    service = new OtpService(smsSender);
  });

  it('delivers the code through the SmsSender port, never a vendor SDK (ADR-040)', async () => {
    await service.requestOtp('+66812345678');
    expect(smsSender.sendSms).toHaveBeenCalledTimes(1);
    const [phone, message] = smsSender.sendSms.mock.calls[0]!;
    expect(phone).toBe('+66812345678');
    expect(message).toMatch(/Construction OS verification code/);
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

  // Security review F6 — the attempt budget used to be read, compared, then incremented only on a
  // miss, so a concurrent burst all observed the same pre-increment value and every one of them got
  // to guess. The budget is now claimed with a single atomic INCR before the comparison.
  it('verifyOtp lets no more than OTP_MAX_ATTEMPTS concurrent guesses through', async () => {
    await service.requestOtp('+66812345678');

    // Fire 20 wrong guesses simultaneously. Pre-fix all 20 passed the `attempts >= 3` check because
    // none of them had incremented yet; post-fix exactly 3 reach the comparison (400) and the rest
    // are refused outright (429).
    const outcomes = await Promise.all(
      Array.from({ length: 20 }, () =>
        service
          .verifyOtp('+66812345678', '000000')
          .then(() => 'accepted')
          .catch((err: { status?: number }) => (err.status === 429 ? 'refused' : 'guessed')),
      ),
    );

    expect(outcomes.filter((o) => o === 'guessed')).toHaveLength(3);
    expect(outcomes).not.toContain('accepted');
  });

  it('verifyOtp still accepts the correct OTP on the last permitted attempt', async () => {
    await service.requestOtp('+66812345678');
    const otp = redisMock['otp:value:+66812345678']!;
    await expect(service.verifyOtp('+66812345678', '000000')).rejects.toThrow(BadRequestException);
    await expect(service.verifyOtp('+66812345678', '000000')).rejects.toThrow(BadRequestException);
    // Third and final attempt — the budget is spent by this call, but a correct code still wins.
    await expect(service.verifyOtp('+66812345678', otp)).resolves.toBe(true);
  });

  it('requestOtp throws TooManyRequestsException after daily limit', async () => {
    // Simulate 10 requests already made today
    const dailyKey = `otp:daily:+66812345678:${new Date().toISOString().slice(0, 10)}`;
    redisMock[dailyKey] = '10';
    await expect(service.requestOtp('+66812345678')).rejects.toMatchObject({ status: 429 });
  });

  // ── the two numbers master:1786-1787 states, asserted as numbers ────────
  //
  // Both were only implied before. "TTL 5 minutes" was checked through the `expiresInSeconds` the
  // response CLAIMS, which is a separate return statement from the `EX` the key is actually stored
  // with — the two can diverge and the client would count down five minutes for a code that already
  // died. And "10 per phone per day" was checked by seeding the counter at 10 and expecting a
  // refusal, which is equally true of a limit of 3: nothing pinned the number.

  it('stores the code with a 5-minute expiry, not just a 5-minute promise (master:1786)', async () => {
    const phone = '+66812345601';
    const result = await service.requestOtp(phone);

    // What the caller is TOLD…
    expect(result.expiresInSeconds).toBe(300);
    // …and what the key is actually stored with. The attempts counter shares the window on purpose:
    // an attempts key that outlived the code would carry failures into the next request.
    expect(expiryMock[`otp:value:${phone}`]).toBe(300);
    expect(expiryMock[`otp:attempts:${phone}`]).toBe(300);
  });

  it('allows the tenth request of the day and refuses the eleventh (master:1787)', async () => {
    // The boundary is the requirement. Seeding the counter at the limit and expecting a refusal
    // passes for any limit at or below 10; only the pair of assertions fixes it at ten.
    const phone = '+66812345602';
    const dailyKey = `otp:daily:${phone}:${new Date().toISOString().slice(0, 10)}`;

    // Nine already spent — the tenth must go through.
    redisMock[dailyKey] = '9';
    await expect(service.requestOtp(phone)).resolves.toMatchObject({ expiresInSeconds: 300 });
    expect(redisMock[dailyKey]).toBe('10');

    // The cooldown is a separate rule and would mask the daily one; clear it so this test is about
    // the daily limit alone.
    delete redisMock[`otp:cooldown:${phone}`];
    delete expiryMock[`otp:cooldown:${phone}`];

    await expect(service.requestOtp(phone)).rejects.toMatchObject({ status: 429 });
  });
});

describe('OtpService — delivery is env-independent now (ADR-040)', () => {
  const originalEnv = process.env['NODE_ENV'];

  beforeEach(() => {
    Object.keys(redisMock).forEach((k) => delete redisMock[k]);
    Object.keys(expiryMock).forEach((k) => delete expiryMock[k]);
    smsSender = { sendSms: jest.fn().mockResolvedValue(undefined) };
  });

  afterEach(() => {
    process.env['NODE_ENV'] = originalEnv;
  });

  // This test used to reach into `service.sns` and assert PublishCommand was sent, which coupled the
  // OTP suite to the AWS SDK and to NODE_ENV. Both moved to AwsSnsSmsAdapter, which owns the dev-mode
  // short-circuit and has its own spec. What OtpService still owes is: hand every code to the port,
  // in production and in development alike — the ONE behaviour that would silently break Path A login
  // if the port were bypassed again.
  it('hands the code to the port regardless of NODE_ENV', async () => {
    process.env['NODE_ENV'] = 'production';
    const prodService = new OtpService(smsSender);
    await prodService.requestOtp('+66812345678');
    expect(smsSender.sendSms).toHaveBeenCalledTimes(1);
  });

  it('propagates a gateway failure instead of reporting a code that was never sent', async () => {
    process.env['NODE_ENV'] = 'production';
    smsSender.sendSms.mockRejectedValueOnce(new Error('gateway down'));
    // A resolved requestOtp() on a failed send is the on-prem failure mode ADR-040 calls out: the
    // endpoint looks healthy while every field worker waits for a code that never arrives.
    await expect(new OtpService(smsSender).requestOtp('+66812345678')).rejects.toThrow(
      'gateway down',
    );
  });

  // The E2E bypass claims no daily slot at all, so a failed send there has nothing to hand back —
  // and must not invent a refund against a key it never charged.
  it('refunds nothing when the E2E bypass skipped the daily limit in the first place', async () => {
    process.env['NODE_ENV'] = 'test';
    process.env['E2E_AUTH_BYPASS'] = 'true';
    try {
      const phone = '+66812345688';
      const dailyKey = `otp:daily:${phone}:${new Date().toISOString().slice(0, 10)}`;
      smsSender.sendSms.mockRejectedValueOnce(new Error('gateway down'));

      await expect(new OtpService(smsSender).requestOtp(phone)).rejects.toThrow('gateway down');
      expect(redisMock[dailyKey]).toBeUndefined();
    } finally {
      delete process.env['E2E_AUTH_BYPASS'];
    }
  });

  // The daily slot is claimed before the send so the limit stays atomic under concurrency. That made
  // a gateway outage spend the caller's quota on codes that never arrived — ten failures and the
  // worker cannot log in until UTC midnight, with SMS OTP their only login method.
  it('refunds the daily slot when the gateway fails, so a failed send costs no quota', async () => {
    process.env['NODE_ENV'] = 'production';
    const phone = '+66812345699';
    const dailyKey = `otp:daily:${phone}:${new Date().toISOString().slice(0, 10)}`;
    const service = new OtpService(smsSender);

    smsSender.sendSms.mockRejectedValueOnce(new Error('gateway down'));
    await expect(service.requestOtp(phone)).rejects.toThrow('gateway down');
    expect(redisMock[dailyKey]).toBe('0');

    // And a slot that WAS delivered still counts — the refund must not swallow successful sends.
    delete redisMock[`otp:cooldown:${phone}`];
    await service.requestOtp(phone);
    expect(redisMock[dailyKey]).toBe('1');
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
    await new OtpService(smsSender).requestOtp('+66800000001');
    expect(redisMock['otp:value:+66800000001']).toBe('123456');
  });

  it('skips resend-cooldown ENFORCEMENT under bypass so suites can re-request back-to-back', async () => {
    process.env['E2E_AUTH_BYPASS'] = 'true';
    process.env['NODE_ENV'] = 'development';
    delete process.env['E2E_TEST_OTP'];
    const svc = new OtpService(smsSender);
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
    await new OtpService(smsSender).requestOtp('+66800000002');
    expect(redisMock['otp:value:+66800000002']).toBe('999999');
  });

  it('hard-gates the bypass OFF in production even if E2E_AUTH_BYPASS=true', async () => {
    process.env['E2E_AUTH_BYPASS'] = 'true';
    process.env['NODE_ENV'] = 'production';
    process.env['E2E_TEST_OTP'] = '123456';
    // No SNS stub needed any more — delivery is the injected port, which never touches the network.
    const svc = new OtpService(smsSender);
    await svc.requestOtp('+66800000003');
    // Bypass returned null (production gate) → a random 6-digit OTP was generated, not the fixed one.
    expect(redisMock['otp:value:+66800000003']).toMatch(/^\d{6}$/);
    expect(redisMock['otp:value:+66800000003']).not.toBe('123456');
  });
});

describe('OtpService onModuleDestroy', () => {
  it('quits the Redis connection on shutdown', async () => {
    const svc = new OtpService(smsSender);
    await svc.onModuleDestroy();
    expect((svc as unknown as { redis: { quit: jest.Mock } }).redis.quit).toHaveBeenCalledTimes(1);
  });
});
