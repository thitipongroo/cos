// Guards the Kubernetes probe contract for apps/web.
//
// The bug this replaces: cos-web probed /api/health, a route that does not exist. next-auth's
// middleware matched it first and answered 307 → /api/auth/signin, and Kubernetes treats any 2xx/3xx
// as a passing probe — so liveness could never fail and a wedged pod would never be restarted
// (verified against a running `next dev`: /api/health → 307). ADR-039 listed this chart's probes as
// UNVERIFIED.
//
// Three things have to stay true together, and none of them is checked by tsc or `next build`:
//   1. the routes exist and return 200 JSON
//   2. they are EXCLUDED from the auth middleware matcher
//   3. the Helm chart probes exactly these paths

import { readFileSync } from 'fs';
import { join } from 'path';

import { config as middlewareConfig } from '../../../middleware';
import * as liveRoute from '../live/route';
import * as readyRoute from '../ready/route';

const { GET: live } = liveRoute;
const { GET: ready } = readyRoute;

const chartValues = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
  '..',
  'infrastructure',
  'helm',
  'cos-web',
  'values.yaml',
);

describe('health routes', () => {
  it.each([
    ['live', live],
    ['ready', ready],
  ])('/health/%s returns 200 with the standard COS body', async (_name, handler) => {
    const res = handler();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: 'ok', service: 'web' });
  });

  it.each([
    ['live', liveRoute],
    ['ready', readyRoute],
  ])('/health/%s is dynamic, not prerendered at build time', (_name, mod) => {
    // A statically prerendered health route reports the build, not the running server.
    expect(mod.dynamic).toBe('force-dynamic');
    expect(mod.GET).toBeInstanceOf(Function);
  });
});

describe('auth middleware', () => {
  // If `health` is dropped from the matcher exclusions, both probes start returning 307 to the
  // sign-in page and silently become meaningless.
  it('does not match /health/* (probes must be unauthenticated)', () => {
    const matcher = middlewareConfig.matcher[0];
    expect(matcher).toBeDefined();

    const re = new RegExp(`^${matcher!.replace(/^\//, '/')}$`);
    expect(re.test('/health/live')).toBe(false);
    expect(re.test('/health/ready')).toBe(false);
    // Sanity: a normal app route IS still protected, so the assertion above means something.
    expect(re.test('/projects')).toBe(true);
  });
});

describe('cos-web Helm chart', () => {
  const values = readFileSync(chartValues, 'utf8');

  it('probes paths this app actually serves', () => {
    const paths = [...values.matchAll(/path:\s*(\/\S+)/g)].map((m) => m[1]);
    expect(paths.length).toBeGreaterThan(0);
    paths.forEach((p) => expect(['/health/live', '/health/ready']).toContain(p));
  });

  it('uses the liveness path for liveness and the readiness path for readiness', () => {
    expect(values).toMatch(/livenessProbe:[\s\S]*?path:\s*\/health\/live/);
    expect(values).toMatch(/readinessProbe:[\s\S]*?path:\s*\/health\/ready/);
  });
});
