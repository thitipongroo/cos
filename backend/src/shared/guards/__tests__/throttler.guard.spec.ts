// Unit tests for ThrottlerGuard wiring — spec §30.10 "Rate Limiting Guard (Unit Tests)"
// Mocks ThrottlerStorageRedisService (no real Redis connection in unit tests).
// ThrottlerGuard is instantiated directly (it's registered as APP_GUARD, not a named provider).

import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { ThrottlerStorage } from '@nestjs/throttler';

const TTL_MS = 60_000;
const DEFAULT_LIMIT = 100;
const AUTH_LIMIT = 10;
const FILE_LIMIT = 20;

function makeStorageMock(totalHits: number, timeToExpire = TTL_MS): jest.Mocked<ThrottlerStorage> {
  // @nestjs/throttler v6: increment(key, ttl, limit, blockDuration, name) resolves
  // { totalHits, timeToExpire, isBlocked, timeToBlockExpire } — the storage decides isBlocked from
  // the limit, and the guard throttles on isBlocked. Compute it from the injected limit arg.
  return {
    increment: jest.fn().mockImplementation(async (_key: string, _ttl: number, limit: number) => ({
      totalHits,
      timeToExpire,
      isBlocked: totalHits > limit,
      timeToBlockExpire: totalHits > limit ? timeToExpire : 0,
    })),
  } as unknown as jest.Mocked<ThrottlerStorage>;
}

function makeContext(ip = '127.0.0.1', url = '/api/v1/projects'): ExecutionContext {
  const req = { ip, url, headers: {}, connection: { remoteAddress: ip } };
  const res = { header: jest.fn() };
  return {
    switchToHttp: jest.fn().mockReturnValue({
      getRequest: () => req,
      getResponse: () => res,
    }),
    getClass: jest.fn().mockReturnValue(class {}),
    getHandler: jest.fn().mockReturnValue(() => {}),
    getType: jest.fn().mockReturnValue('http'),
    getArgs: jest.fn().mockReturnValue([]),
    getArgByIndex: jest.fn(),
    switchToRpc: jest.fn(),
    switchToWs: jest.fn(),
  } as unknown as ExecutionContext;
}

async function buildGuard(
  storage: ThrottlerStorage,
  limit = DEFAULT_LIMIT,
): Promise<ThrottlerGuard> {
  const reflector = new Reflector();
  const guard = new ThrottlerGuard(
    { throttlers: [{ ttl: TTL_MS, limit }], storage },
    storage,
    reflector,
  );
  await guard.onModuleInit();
  return guard;
}

describe('ThrottlerGuard', () => {
  // Test 1: request within limit returns true (no throw)
  it('allows request within the default limit', async () => {
    const storage = makeStorageMock(1);
    const guard = await buildGuard(storage);

    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
  });

  // Test 2: 101st hit exceeds default limit → throws (HTTP 429)
  it('throws when default limit (100 req/min) is exceeded', async () => {
    const storage = makeStorageMock(DEFAULT_LIMIT + 1);
    const guard = await buildGuard(storage);

    await expect(guard.canActivate(makeContext())).rejects.toThrow();
  });

  // Test 3: auth endpoint override — 11th hit within TTL → throws
  it('throws when auth endpoint limit (10 req/min) is exceeded', async () => {
    const storage = makeStorageMock(AUTH_LIMIT + 1);
    const guard = await buildGuard(storage, AUTH_LIMIT);

    await expect(
      guard.canActivate(makeContext('192.168.1.1', '/api/v1/auth/otp/request')),
    ).rejects.toThrow();
  });

  // Test 4: file upload override — 20th allowed, 21st throws
  it('allows 20th request and rejects 21st on file upload limit', async () => {
    const storageAllow = makeStorageMock(FILE_LIMIT);
    expect(
      await (
        await buildGuard(storageAllow, FILE_LIMIT)
      ).canActivate(makeContext('1.1.1.1', '/api/v1/files/upload')),
    ).toBe(true);

    const storageExceed = makeStorageMock(FILE_LIMIT + 1);
    await expect(
      (await buildGuard(storageExceed, FILE_LIMIT)).canActivate(
        makeContext('1.1.1.1', '/api/v1/files/upload'),
      ),
    ).rejects.toThrow();
  });

  // Test 5: Retry-After header — response.header() called on 429
  it('calls res.header() when limit is exceeded (Retry-After must be set)', async () => {
    const storage = makeStorageMock(DEFAULT_LIMIT + 1);
    const guard = await buildGuard(storage);
    const ctx = makeContext();
    const res = ctx.switchToHttp().getResponse() as { header: jest.Mock };

    await guard.canActivate(ctx).catch(() => {});

    // ThrottlerGuard sets X-RateLimit-* headers before throwing
    expect(res.header).toHaveBeenCalled();
  });

  // Test 6: counter resets after TTL — new window starts at totalHits=1 → allowed
  it('allows request when TTL has expired (totalHits resets to 1 in new window)', async () => {
    const storage = makeStorageMock(1, 0);
    const guard = await buildGuard(storage);

    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
  });

  // Test 7: storage.increment is called — confirms Redis storage (not in-memory) is used
  it('calls the injected storage increment on each request', async () => {
    const storage = makeStorageMock(1);
    const guard = await buildGuard(storage);

    await guard.canActivate(makeContext());

    expect(storage.increment).toHaveBeenCalledTimes(1);
    // v6 signature: increment(key, ttl, limit, blockDuration, throttlerName)
    expect(storage.increment).toHaveBeenCalledWith(
      expect.any(String),
      TTL_MS,
      expect.any(Number),
      expect.any(Number),
      'default',
    );
  });
});
