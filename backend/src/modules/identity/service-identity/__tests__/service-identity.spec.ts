jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import {
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  AUTHORITATIVE_ROLE_CHECK_FLAG,
  SUBJECT_BINDING_FLAG,
} from '../../strategies/keycloak-jwt.strategy';
import { ServiceIdentityController } from '../service-identity.controller';
import {
  IDENTITY_LIMIT_PER_MINUTE,
  IdentityThrottlerGuard,
  InternalOnlyGuard,
  ServiceIdentityAuthGuard,
  isTokenFault,
} from '../service-identity.guards';

const ORIGINAL_PORT = process.env['INTERNAL_PORT'];
afterEach(() => {
  if (ORIGINAL_PORT === undefined) delete process.env['INTERNAL_PORT'];
  else process.env['INTERNAL_PORT'] = ORIGINAL_PORT;
});

const httpContext = (req: unknown, res: unknown = { header: jest.fn() }) =>
  ({
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
    getClass: () => ServiceIdentityController,
    getHandler: () => ServiceIdentityController.prototype.getIdentity,
  }) as unknown as ExecutionContext;

describe('InternalOnlyGuard', () => {
  const guard = new InternalOnlyGuard();

  it('admits a request that arrived on the internal listener', () => {
    delete process.env['INTERNAL_PORT'];
    expect(guard.canActivate(httpContext({ raw: { socket: { localPort: 3100 } } }))).toBe(true);
  });

  it('answers the public port like a route that does not exist', () => {
    expect(() => guard.canActivate(httpContext({ raw: { socket: { localPort: 3000 } } }))).toThrow(
      NotFoundException,
    );
  });
});

describe('isTokenFault — token wrong vs backend unable to check (passport-jwt fail(info))', () => {
  const named = (name: string, message = 'x') => Object.assign(new Error(message), { name });

  it.each([
    ['no info at all', undefined],
    ['null', null],
    [
      'the strategy refusing an untrusted issuer',
      new UnauthorizedException('Token issuer is not trusted'),
    ],
    ['a bad signature', named('JsonWebTokenError')],
    ['an expired token', named('TokenExpiredError')],
    ['a token not yet valid', named('NotBeforeError')],
    ['a kid with no key', named('SigningKeyNotFoundError')],
    ['no bearer', new Error('No auth token')],
    ['a non-Error info object', { message: 'jwt malformed' }],
  ])('%s is the TOKEN', (_l, info) => {
    expect(isTokenFault(info)).toBe(true);
  });

  it.each([
    ['a JWKS endpoint failure', named('JwksError')],
    ['the JWKS rate limit', named('JwksRateLimitError')],
    ['a network error', named('TypeError', 'fetch failed')],
    ['a database error in the realm allowlist', new Error('Connection terminated')],
  ])('%s is the BACKEND', (_l, info) => {
    expect(isTokenFault(info)).toBe(false);
  });
});

describe('ServiceIdentityAuthGuard.handleRequest', () => {
  const guard = new ServiceIdentityAuthGuard(
    { isActive: () => false, set: jest.fn() } as never,
    { touch: jest.fn() } as never,
  );
  const ctx = httpContext({});

  it('503 COS-AUTH-004 when the backend could not check the token', () => {
    let thrown: unknown;
    try {
      guard.handleRequest(
        undefined,
        false,
        Object.assign(new Error('x'), { name: 'JwksError' }),
        ctx,
      );
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(ServiceUnavailableException);
    expect(JSON.stringify((thrown as ServiceUnavailableException).getResponse())).toContain(
      'COS-AUTH-004',
    );
  });

  it('503 for a plain database error reaching the key provider as well', () => {
    expect(() =>
      guard.handleRequest(undefined, false, new Error('Connection terminated'), ctx),
    ).toThrow(ServiceUnavailableException);
  });

  it('401 when the token itself is at fault', () => {
    expect(() =>
      guard.handleRequest(
        undefined,
        false,
        Object.assign(new Error('jwt expired'), { name: 'TokenExpiredError' }),
        ctx,
      ),
    ).toThrow(UnauthorizedException);
  });

  it('passes an error from validate() through unchanged (already a 5xx or its own 401)', () => {
    const err = new Error('db down');
    expect(() => guard.handleRequest(err, false, undefined, ctx)).toThrow('db down');
  });

  it('returns the verified user', () => {
    const user = { tenant_id: 't', user_id: 'u', role: 'SITE_ENGINEER', tenantCode: 'X' };
    expect(guard.handleRequest(undefined, user, undefined, ctx)).toBe(user);
  });

  it('keeps the MFA refusal as its own 403', () => {
    const orig = process.env['MFA_ENFORCE'];
    process.env['MFA_ENFORCE'] = 'true';
    try {
      expect(() =>
        guard.handleRequest(
          undefined,
          { tenant_id: 't', user_id: 'u', role: 'TENANT_ADMIN', tenantCode: 'X' },
          undefined,
          ctx,
        ),
      ).toThrow(ForbiddenException);
    } finally {
      if (orig === undefined) delete process.env['MFA_ENFORCE'];
      else process.env['MFA_ENFORCE'] = orig;
    }
  });
});

describe('IdentityThrottlerGuard', () => {
  function build() {
    const hits = new Map<string, number>();
    const storage = {
      increment: jest.fn(
        async (key: string, ttl: number, limit: number, _block: number, _name: string) => {
          const total = (hits.get(key) ?? 0) + 1;
          hits.set(key, total);
          return {
            totalHits: total,
            timeToExpire: ttl,
            isBlocked: total > limit,
            timeToBlockExpire: 60,
          };
        },
      ),
    };
    const guard = new IdentityThrottlerGuard(
      { throttlers: [] } as never,
      storage as never,
      new Reflector(),
    );
    return { guard, storage };
  }

  it('keys the limit on the verified user, not the address', async () => {
    const { guard, storage } = build();
    const res = { header: jest.fn() };
    await expect(
      guard.canActivate(httpContext({ ip: '10.0.0.7', user: { user_id: 'u-1' } }, res)),
    ).resolves.toBe(true);
    const [key, ttl, limit, block, name] = storage.increment.mock.calls[0]!;
    expect([ttl, limit, block, name]).toEqual([
      60_000,
      IDENTITY_LIMIT_PER_MINUTE,
      60_000,
      'service-identity',
    ]);
    expect(res.header).toHaveBeenCalledWith('X-RateLimit-Limit-service-identity', 600);

    // The same pod address with another user is a different bucket; the same user is the same one.
    await guard.canActivate(httpContext({ ip: '10.0.0.7', user: { user_id: 'u-2' } }));
    await guard.canActivate(httpContext({ ip: '10.0.0.9', user: { user_id: 'u-1' } }));
    const keys = storage.increment.mock.calls.map((c) => c[0]);
    expect(keys[1]).not.toBe(key);
    expect(keys[2]).toBe(key);
  });

  it('refuses one user past 600 a minute, while another user is unaffected', async () => {
    const { guard } = build();
    for (let i = 0; i < IDENTITY_LIMIT_PER_MINUTE; i++) {
      await guard.canActivate(httpContext({ user: { user_id: 'busy' } }));
    }
    await expect(guard.canActivate(httpContext({ user: { user_id: 'busy' } }))).rejects.toThrow(
      /Too Many Requests/i,
    );
    await expect(guard.canActivate(httpContext({ user: { user_id: 'quiet' } }))).resolves.toBe(
      true,
    );
  });

  it('refuses a request with no verified user rather than counting it anonymously', async () => {
    const { guard } = build();
    await expect(guard.canActivate(httpContext({}))).rejects.toThrow(UnauthorizedException);
  });
});

describe('ServiceIdentityController', () => {
  const req = {
    user: { tenant_id: 't-1', user_id: 'u-1', role: 'SITE_ENGINEER', sub: 'kc' },
  } as never;
  const controller = (flags: Record<string, boolean>) =>
    new ServiceIdentityController({ isEnabled: (n: string) => flags[n] ?? true } as never);

  it('answers with the strategy-verified tenant, user and role', () => {
    expect(controller({}).getIdentity(req)).toEqual({
      tenant_id: 't-1',
      user_id: 'u-1',
      role: 'SITE_ENGINEER',
    });
  });

  it.each([SUBJECT_BINDING_FLAG, AUTHORITATIVE_ROLE_CHECK_FLAG])(
    '503 while %s is OFF — the claims are not verified then',
    (flag) => {
      expect(() => controller({ [flag]: false }).getIdentity(req)).toThrow(
        ServiceUnavailableException,
      );
    },
  );

  it('sits behind the three guards in order, with only the address-keyed limit skipped', () => {
    const reflector = new Reflector();
    const handler = ServiceIdentityController.prototype.getIdentity;
    expect(reflector.get('__guards__', handler)).toEqual([
      InternalOnlyGuard,
      ServiceIdentityAuthGuard,
      IdentityThrottlerGuard,
    ]);
    expect(Reflect.getMetadata('THROTTLER:SKIPdefault', handler)).toBe(true);
  });
});
