// Unit tests for MfaService — validates TOTP enrollment and authentication logic
// without real Redis, Prisma, or otplib randomness.

import { BadRequestException, UnauthorizedException } from '@nestjs/common';

// ── Redis mock ────────────────────────────────────────────────────────────────
const redisMock: Record<string, string> = {};

jest.mock('ioredis', () => ({
  Redis: jest.fn().mockImplementation(() => ({
    set: jest.fn(async (key: string, value: string) => {
      redisMock[key] = value;
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
    quit: jest.fn().mockResolvedValue(undefined),
  })),
}));

// secret-cipher is exercised by its own spec; here we stub it so MFA tests stay deterministic.
// `enc:` prefix models encryption; decrypt of an un-prefixed value is a no-op (legacy/plain secret).
jest.mock('../../../shared/crypto/secret-cipher', () => ({
  encryptSecret: (s: string) => `enc:${s}`,
  decryptSecret: (s: string) => (s.startsWith('enc:') ? s.slice(4) : s),
}));

// ── Prisma mock ───────────────────────────────────────────────────────────────
const mockExecuteRaw = jest.fn().mockResolvedValue(1);
const mockQueryRaw = jest.fn();

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    $executeRaw: mockExecuteRaw,
    $queryRaw: mockQueryRaw,
    $disconnect: jest.fn().mockResolvedValue(undefined),
  })),
}));

// ── otplib mock ───────────────────────────────────────────────────────────────
const mockGenerateSecret = jest.fn().mockReturnValue('MOCKSECRET32CHARS');
const mockKeyuri = jest
  .fn()
  .mockReturnValue(
    'otpauth://totp/Construction%20OS:user@example.com?secret=MOCKSECRET32CHARS&issuer=Construction%20OS',
  );
const mockVerify = jest.fn();

jest.mock('otplib', () => ({
  authenticator: {
    generateSecret: () => mockGenerateSecret(),
    keyuri: (email: string, issuer: string, secret: string) => mockKeyuri(email, issuer, secret),
    verify: (opts: { token: string; secret: string }) => mockVerify(opts),
  },
}));

import { MfaService } from '../mfa/mfa.service';

describe('MfaService', () => {
  let service: MfaService;

  beforeEach(() => {
    Object.keys(redisMock).forEach((k) => delete redisMock[k]);
    jest.clearAllMocks();
    mockGenerateSecret.mockReturnValue('MOCKSECRET32CHARS');
    mockKeyuri.mockReturnValue(
      'otpauth://totp/Construction%20OS:user@example.com?secret=MOCKSECRET32CHARS&issuer=Construction%20OS',
    );
    service = new MfaService();
  });

  // ── generateEnrollmentSecret ──────────────────────────────────────────────

  describe('generateEnrollmentSecret', () => {
    it('stores pending secret in Redis and returns otpAuthUrl + secret', async () => {
      const result = await service.generateEnrollmentSecret('user-1', 'user@example.com');

      expect(result.secret).toBe('MOCKSECRET32CHARS');
      expect(result.otpAuthUrl).toContain('otpauth://totp/');
      expect(redisMock['mfa:pending:user-1']).toBe('MOCKSECRET32CHARS');
    });

    it('calls keyuri with correct issuer "Construction OS"', async () => {
      await service.generateEnrollmentSecret('user-1', 'user@example.com');
      expect(mockKeyuri).toHaveBeenCalledWith(
        'user@example.com',
        'Construction OS',
        'MOCKSECRET32CHARS',
      );
    });
  });

  // ── verifyAndActivate ─────────────────────────────────────────────────────

  describe('verifyAndActivate', () => {
    beforeEach(() => {
      redisMock['mfa:pending:user-1'] = 'MOCKSECRET32CHARS';
    });

    it('activates MFA when token is valid', async () => {
      mockVerify.mockReturnValue(true);
      await service.verifyAndActivate('user-1', '123456');

      expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
      expect(redisMock['mfa:pending:user-1']).toBeUndefined();
    });

    it('throws BadRequestException when no pending enrollment in Redis', async () => {
      delete redisMock['mfa:pending:user-1'];
      await expect(service.verifyAndActivate('user-1', '123456')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws UnauthorizedException when TOTP token is invalid', async () => {
      mockVerify.mockReturnValue(false);
      await expect(service.verifyAndActivate('user-1', '000000')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('does NOT update DB when token is invalid', async () => {
      mockVerify.mockReturnValue(false);
      try {
        await service.verifyAndActivate('user-1', '000000');
      } catch {}
      expect(mockExecuteRaw).not.toHaveBeenCalled();
    });
  });

  // ── authenticate ──────────────────────────────────────────────────────────

  describe('authenticate', () => {
    it('resolves without error when TOTP token is valid', async () => {
      mockQueryRaw.mockResolvedValue([{ mfa_enabled: true, mfa_totp_secret: 'STORED_SECRET' }]);
      mockVerify.mockReturnValue(true);

      await expect(service.authenticate('user-1', '123456')).resolves.toBeUndefined();
    });

    it('throws BadRequestException when MFA not enrolled (mfa_enabled = false)', async () => {
      mockQueryRaw.mockResolvedValue([{ mfa_enabled: false, mfa_totp_secret: null }]);

      await expect(service.authenticate('user-1', '123456')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when user row not found', async () => {
      mockQueryRaw.mockResolvedValue([]);

      await expect(service.authenticate('user-1', '123456')).rejects.toThrow(BadRequestException);
    });

    it('throws UnauthorizedException when TOTP token is invalid against stored secret', async () => {
      mockQueryRaw.mockResolvedValue([{ mfa_enabled: true, mfa_totp_secret: 'STORED_SECRET' }]);
      mockVerify.mockReturnValue(false);

      await expect(service.authenticate('user-1', '000000')).rejects.toThrow(UnauthorizedException);
    });

    it('verifies token against the stored DB secret, not the pending Redis secret', async () => {
      mockQueryRaw.mockResolvedValue([{ mfa_enabled: true, mfa_totp_secret: 'DB_SECRET' }]);
      mockVerify.mockReturnValue(true);

      await service.authenticate('user-1', '123456');

      expect(mockVerify).toHaveBeenCalledWith({ token: '123456', secret: 'DB_SECRET' });
    });

    it('decrypts an encrypted stored secret before verifying', async () => {
      mockQueryRaw.mockResolvedValue([{ mfa_enabled: true, mfa_totp_secret: 'enc:REALSEED' }]);
      mockVerify.mockReturnValue(true);

      await service.authenticate('user-1', '123456');

      expect(mockVerify).toHaveBeenCalledWith({ token: '123456', secret: 'REALSEED' });
    });

    // ── brute-force lockout (QM-7) ──────────────────────────────────────────
    it('throws 429 and does not query the DB when already locked out (>= 5 failures)', async () => {
      redisMock['mfa:fail:user-1'] = '5';
      await expect(service.authenticate('user-1', '000000')).rejects.toMatchObject({ status: 429 });
      expect(mockQueryRaw).not.toHaveBeenCalled();
    });

    it('increments the failure counter and sets the lockout TTL on the first invalid token', async () => {
      mockQueryRaw.mockResolvedValue([{ mfa_enabled: true, mfa_totp_secret: 'enc:SEED' }]);
      mockVerify.mockReturnValue(false);

      await expect(service.authenticate('user-1', '000000')).rejects.toThrow(UnauthorizedException);
      expect(redisMock['mfa:fail:user-1']).toBe('1');
      const redis = (service as unknown as { redis: { expire: jest.Mock } }).redis;
      expect(redis.expire).toHaveBeenCalledWith('mfa:fail:user-1', 900);
    });

    it('does not reset the TTL on a subsequent invalid token (counter already exists)', async () => {
      redisMock['mfa:fail:user-1'] = '2';
      mockQueryRaw.mockResolvedValue([{ mfa_enabled: true, mfa_totp_secret: 'enc:SEED' }]);
      mockVerify.mockReturnValue(false);

      await expect(service.authenticate('user-1', '000000')).rejects.toThrow(UnauthorizedException);
      expect(redisMock['mfa:fail:user-1']).toBe('3');
      const redis = (service as unknown as { redis: { expire: jest.Mock } }).redis;
      expect(redis.expire).not.toHaveBeenCalled();
    });

    it('clears the failure counter on a successful authentication', async () => {
      redisMock['mfa:fail:user-1'] = '2';
      mockQueryRaw.mockResolvedValue([{ mfa_enabled: true, mfa_totp_secret: 'enc:SEED' }]);
      mockVerify.mockReturnValue(true);

      await service.authenticate('user-1', '123456');
      expect(redisMock['mfa:fail:user-1']).toBeUndefined();
    });
  });
});

describe('MfaService onModuleDestroy', () => {
  it('quits Redis and disconnects Prisma on shutdown', async () => {
    const svc = new MfaService();
    await svc.onModuleDestroy();
    const cast = svc as unknown as {
      redis: { quit: jest.Mock };
      prisma: { $disconnect: jest.Mock };
    };
    expect(cast.redis.quit).toHaveBeenCalledTimes(1);
    expect(cast.prisma.$disconnect).toHaveBeenCalledTimes(1);
  });
});
