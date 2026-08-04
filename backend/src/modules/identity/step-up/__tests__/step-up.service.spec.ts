// Step-up verification unit tests (ADR-078).
//
// The properties under test are the ones ADR-078 rejected alternatives to protect:
//   - the Redis namespace is `stepup:*`, NEVER `otp:*` — otherwise requesting a step-up clobbers a
//     pending login code, and a step-up code could satisfy /auth/otp/verify (privilege escalation)
//   - the minted token is bound to ONE user and ONE action, and is consumed on first read
//   - the attempt budget is claimed BEFORE the comparison (security review F6 ordering)
//   - a deactivated account cannot mint a token
//   - the channel follows the ACCOUNT, and the full destination is never returned

const redisStore = new Map<string, string>();
const redisMock = {
  set: jest.fn(async (k: string, v: string) => void redisStore.set(k, v)),
  get: jest.fn(async (k: string) => redisStore.get(k) ?? null),
  del: jest.fn(async (...keys: string[]) => keys.forEach((k) => redisStore.delete(k))),
  incr: jest.fn(async (k: string) => {
    const next = Number(redisStore.get(k) ?? '0') + 1;
    redisStore.set(k, String(next));
    return next;
  }),
  expire: jest.fn(),
  quit: jest.fn().mockResolvedValue(undefined),
};

const prismaMock = {
  user: { findUnique: jest.fn() },
  $disconnect: jest.fn().mockResolvedValue(undefined),
};

jest.mock('ioredis', () => ({ Redis: jest.fn(() => redisMock) }));
jest.mock('../../../../shared/prisma/create-prisma-client', () => ({
  createPrismaClient: () => prismaMock,
}));
jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { BadRequestException, HttpException } from '@nestjs/common';
import { StepUpService, maskDestination, STEP_UP_ACTIONS } from '../step-up.service';
import type { SmsSender } from '../../otp/sms-sender';
import type { SendGridAdapter } from '../../../notification/adapters/sendgrid.adapter';

const USER = 'user-1';
const PHONE_USER = { phoneNumber: '+66811234567', email: 'field@cos.app', isActive: true };
const EMAIL_USER = { phoneNumber: null, email: 'office@cos.app', isActive: true };

let sms: jest.Mocked<SmsSender>;
let email: jest.Mocked<Pick<SendGridAdapter, 'send'>>;

function make(): StepUpService {
  sms = { sendSms: jest.fn().mockResolvedValue(undefined) };
  email = { send: jest.fn().mockResolvedValue(undefined) };
  return new StepUpService(sms, email as unknown as SendGridAdapter);
}

/** Read the code the service stored, the way a real SMS recipient would learn it. */
const storedCode = (action = 'data-export'): string =>
  redisStore.get(`stepup:code:${USER}:${action}`)!;

beforeEach(() => {
  jest.clearAllMocks();
  redisStore.clear();
  prismaMock.user.findUnique.mockResolvedValue(PHONE_USER);
});

describe('maskDestination', () => {
  it('keeps only the last four characters', () => {
    expect(maskDestination('+66811234567')).toBe('••••4567');
    expect(maskDestination('office@cos.app')).toBe('••••.app');
  });
});

describe('STEP_UP_ACTIONS', () => {
  it('is a closed set — an open action string would let a caller bind a token to anything', () => {
    expect(STEP_UP_ACTIONS).toEqual(['data-export']);
  });
});

describe('request', () => {
  it('sends by SMS when the account has a phone, returning a MASKED destination', async () => {
    const svc = make();
    const res = await svc.request(USER, 'data-export');

    expect(sms.sendSms).toHaveBeenCalledTimes(1);
    expect(email.send).not.toHaveBeenCalled();
    expect(res).toEqual({
      channel: 'SMS',
      destinationHint: '••••4567',
      expiresInSeconds: 300,
    });
    // The full number must not travel back to the client.
    expect(JSON.stringify(res)).not.toContain('+66811234567');
  });

  it('falls back to email when the account has no phone (every Path B office account)', async () => {
    prismaMock.user.findUnique.mockResolvedValue(EMAIL_USER);
    const svc = make();
    const res = await svc.request(USER, 'data-export');

    expect(email.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'office@cos.app', subject: expect.any(String) }),
    );
    expect(sms.sendSms).not.toHaveBeenCalled();
    expect(res.channel).toBe('EMAIL');
  });

  it('stores the code under stepup:*, never under the login otp:* namespace', async () => {
    const svc = make();
    await svc.request(USER, 'data-export');

    const keys = [...redisStore.keys()];
    expect(keys).toEqual(expect.arrayContaining([`stepup:code:${USER}:data-export`]));
    // The whole point of ADR-078's separation: a step-up code must not be able to satisfy a login.
    expect(keys.some((k) => k.startsWith('otp:'))).toBe(false);
  });

  it('mints a 6-digit code', async () => {
    const svc = make();
    await svc.request(USER, 'data-export');
    expect(storedCode()).toMatch(/^\d{6}$/);
  });

  it('refuses a deactivated account', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ ...PHONE_USER, isActive: false });
    const svc = make();
    await expect(svc.request(USER, 'data-export')).rejects.toBeInstanceOf(BadRequestException);
    expect(sms.sendSms).not.toHaveBeenCalled();
  });

  it('refuses an unknown user', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    const svc = make();
    await expect(svc.request(USER, 'data-export')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('caps requests at 10 per user per day', async () => {
    const svc = make();
    for (let i = 0; i < 10; i++) await svc.request(USER, 'data-export');
    await expect(svc.request(USER, 'data-export')).rejects.toMatchObject({ status: 429 });
  });

  it('sets a 24h TTL on the daily counter the first time only', async () => {
    const svc = make();
    await svc.request(USER, 'data-export');
    await svc.request(USER, 'data-export');
    expect(redisMock.expire).toHaveBeenCalledTimes(1);
    expect(redisMock.expire).toHaveBeenCalledWith(expect.stringContaining('stepup:daily:'), 86_400);
  });
});

describe('verify', () => {
  it('returns an action token for the correct code', async () => {
    const svc = make();
    await svc.request(USER, 'data-export');

    const token = await svc.verify(USER, 'data-export', storedCode());
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(20);
    // The code is spent — it cannot mint a second token.
    expect(redisStore.get(`stepup:code:${USER}:data-export`)).toBeUndefined();
  });

  it('rejects when no code was requested', async () => {
    const svc = make();
    await expect(svc.verify(USER, 'data-export', '123456')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a wrong code', async () => {
    const svc = make();
    await svc.request(USER, 'data-export');
    const wrong = storedCode() === '000000' ? '111111' : '000000';
    await expect(svc.verify(USER, 'data-export', wrong)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a code of the wrong length without a timing leak', async () => {
    const svc = make();
    await svc.request(USER, 'data-export');
    await expect(svc.verify(USER, 'data-export', '12345')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('lets no more than 3 concurrent guesses through (security review F6 ordering)', async () => {
    const svc = make();
    await svc.request(USER, 'data-export');
    const wrong = storedCode() === '000000' ? '111111' : '000000';

    const outcomes = await Promise.all(
      Array.from({ length: 20 }, () =>
        svc
          .verify(USER, 'data-export', wrong)
          .then(() => 'accepted')
          .catch((err: { status?: number }) => (err.status === 429 ? 'refused' : 'guessed')),
      ),
    );

    expect(outcomes.filter((o) => o === 'guessed')).toHaveLength(3);
    expect(outcomes).not.toContain('accepted');
  });

  it('throws 429 and burns the code once the budget is spent', async () => {
    const svc = make();
    await svc.request(USER, 'data-export');
    const code = storedCode();
    const wrong = code === '000000' ? '111111' : '000000';

    for (let i = 0; i < 3; i++) {
      await expect(svc.verify(USER, 'data-export', wrong)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }
    await expect(svc.verify(USER, 'data-export', wrong)).rejects.toBeInstanceOf(HttpException);
    // The correct code is gone too — a spent budget must not leave a live credential behind.
    await expect(svc.verify(USER, 'data-export', code)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('consume — single use, bound to one user and one action', () => {
  async function mintToken(svc: StepUpService, user = USER): Promise<string> {
    prismaMock.user.findUnique.mockResolvedValue(PHONE_USER);
    await svc.request(user, 'data-export');
    return svc.verify(user, 'data-export', redisStore.get(`stepup:code:${user}:data-export`)!);
  }

  it('accepts the token for the user and action it was minted for', async () => {
    const svc = make();
    const token = await mintToken(svc);
    expect(await svc.consume(token, USER, 'data-export')).toBe(true);
  });

  it('cannot be replayed — the second use fails', async () => {
    const svc = make();
    const token = await mintToken(svc);
    expect(await svc.consume(token, USER, 'data-export')).toBe(true);
    expect(await svc.consume(token, USER, 'data-export')).toBe(false);
  });

  it('rejects a token presented by a DIFFERENT user, and consumes it anyway', async () => {
    const svc = make();
    const token = await mintToken(svc);

    expect(await svc.consume(token, 'attacker', 'data-export')).toBe(false);
    // Consumed on the failed attempt: leaving it alive would let an attacker keep trying it.
    expect(await svc.consume(token, USER, 'data-export')).toBe(false);
  });

  it('rejects an unknown token', async () => {
    const svc = make();
    expect(await svc.consume('never-minted', USER, 'data-export')).toBe(false);
  });
});

describe('shutdown (ADR-034 / Rule 39)', () => {
  it('closes both the Redis and Prisma handles', async () => {
    const svc = make();
    await svc.onModuleDestroy();
    expect(redisMock.quit).toHaveBeenCalledTimes(1);
    expect(prismaMock.$disconnect).toHaveBeenCalledTimes(1);
  });
});
