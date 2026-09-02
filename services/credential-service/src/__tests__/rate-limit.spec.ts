// The app-layer rate limit added 2026-09-03, and the two properties that make it worth having.
//
// This service had no rate limit of any kind while holding every tenant's encrypted issuer private
// keys, and two of its routes are unauthenticated by design — reachable by anyone who knows a tenant
// id, each costing a tenant-scoped database round trip. §5.9.8 recorded the mitigation as
// "IP-rate-limited", which was true only of the Kong route, and Kong is deployed nowhere.
//
// `src/main.ts` is excluded from `collectCoverageFrom`, so nothing here is chasing a coverage number.
// These assertions exist because a limiter registered in the wrong order is indistinguishable from
// one that works until the day it matters: register it before `/health` and Kubernetes probes start
// getting 429s under load; register it after the routes and it guards nothing.
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { jest } from '@jest/globals';

jest.unstable_mockModule('../plugins/jwt-verify.js', () => ({
  verifyBearer: jest.fn(async () => null),
  InvalidTokenError: class InvalidTokenError extends Error {},
}));

const { buildApp } = await import('../main.js');

/** Enough of a pg Pool for the public did.json route: it resolves, finds no issuer, and 404s. */
function emptyPool(): Pool {
  const query = jest.fn(async () => ({ rows: [] }));
  return { connect: jest.fn(async () => ({ query, release: jest.fn() })) } as unknown as Pool;
}

const MAX = 100; // §5.5 general limit — the number in main.ts, restated so a drift shows up here

describe('app-layer rate limit', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    ({ app } = await buildApp(emptyPool()));
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('throttles the unauthenticated public route once the per-minute limit is exceeded', async () => {
    const url = '/tenants/t1/did.json';
    // The route itself 404s (no issuer row); that is irrelevant here — a 404 still consumes a token,
    // which is the point. An attacker enumerating tenant ids gets no free pass for guessing wrong.
    for (let i = 0; i < MAX; i += 1) {
      const res = await app.inject({ method: 'GET', url, remoteAddress: '10.0.0.1' });
      expect(res.statusCode).toBe(404);
    }

    const limited = await app.inject({ method: 'GET', url, remoteAddress: '10.0.0.1' });
    expect(limited.statusCode).toBe(429);
    // QM-7: a 429 must say when to come back.
    expect(limited.headers['retry-after']).toBeDefined();
  });

  it('keys the bucket per caller, so one exhausted caller does not block another', async () => {
    const url = '/tenants/t1/did.json';
    let exhausted;
    for (let i = 0; i < MAX + 1; i += 1) {
      exhausted = await app.inject({ method: 'GET', url, remoteAddress: '10.0.0.1' });
    }
    // Assert the first caller is actually blocked before claiming the second one is unaffected.
    // Without it this test passes when there is no limiter at all, which is the state it exists to
    // rule out — a green assertion that cannot go red is worse than no assertion, because it is read
    // as coverage of the keyGenerator.
    expect(exhausted?.statusCode).toBe(429);

    // Same route, different source — an unauthenticated caller keys on IP (`request.userId` is empty
    // on a public route because the auth hook returns before setting it).
    const other = await app.inject({ method: 'GET', url, remoteAddress: '10.0.0.2' });
    expect(other.statusCode).toBe(404);
  });

  it('never throttles /health — it is registered before the limiter', async () => {
    // Registration order is the whole mechanism, and it is silent when wrong: a throttled liveness
    // probe fails a container that is perfectly healthy, under exactly the load that makes it matter.
    for (let i = 0; i < MAX + 5; i += 1) {
      const res = await app.inject({ method: 'GET', url: '/health', remoteAddress: '10.0.0.3' });
      expect(res.statusCode).toBe(200);
    }
  });
});
