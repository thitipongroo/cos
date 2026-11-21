import { reportSessionSettled, resetSessionSettled, sessionSettled, tokenFor } from '../client';

// Plan DM (product owner 2026-11-21): a request sent while the session is loading waits for the provider's own session
// fetch — never a second one (single-use refresh tokens; found by /doubt) — so it carries the token.
describe('tokenFor', () => {
  it('while loading with no token: waits for the session and uses its token', async () => {
    const wait = jest.fn().mockResolvedValue('tok-1');
    await expect(tokenFor('loading', undefined, wait)).resolves.toBe('tok-1');
    expect(wait).toHaveBeenCalledTimes(1);
  });

  it('signed in: its own token, no wait', async () => {
    const wait = jest.fn();
    await expect(tokenFor('authenticated', 'tok-2', wait)).resolves.toBe('tok-2');
    expect(wait).not.toHaveBeenCalled();
  });

  it('signed out: no token and no wait', async () => {
    const wait = jest.fn();
    await expect(tokenFor('unauthenticated', undefined, wait)).resolves.toBeUndefined();
    expect(wait).not.toHaveBeenCalled();
  });
});

describe('sessionSettled', () => {
  beforeEach(() => resetSessionSettled());
  afterEach(() => {
    resetSessionSettled();
    jest.useRealTimers();
  });

  it("releases every waiting request with the provider's token once it settles", async () => {
    const a = sessionSettled();
    const b = sessionSettled();
    reportSessionSettled('tok-3');
    await expect(Promise.all([a, b])).resolves.toEqual(['tok-3', 'tok-3']);
  });

  it('answers at once once settled — signed out included', async () => {
    reportSessionSettled(undefined);
    await expect(sessionSettled()).resolves.toBeUndefined();
    reportSessionSettled('tok-4');
    await expect(sessionSettled()).resolves.toBe('tok-4');
  });

  it('gives up after the timeout, so a stalled session fetch cannot hold a request forever', async () => {
    jest.useFakeTimers();
    const p = sessionSettled(1000);
    jest.advanceTimersByTime(1000);
    await expect(p).resolves.toBeUndefined();
    reportSessionSettled('late'); // the waiter was removed: nothing to release, nothing thrown
  });
});

// The wiring has no component test (apps/web's jest is node-only, by design — jest.config.js), so its source is held
// here (found by /doubt): without the reporter mounted, every hard-load request would wait the full timeout.
describe('the wiring (source)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readFileSync } = require('node:fs') as typeof import('node:fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { join } = require('node:path') as typeof import('node:path');
  const read = (rel: string) => readFileSync(join(__dirname, rel), 'utf8');

  it('mounts SessionSettledReporter inside SessionProvider, reporting the settled token', () => {
    const src = read('../../../app/providers.tsx');
    expect(src).toMatch(/<SessionProvider>\s*<SessionSettledReporter \/>/);
    expect(src).toContain("if (status !== 'loading') reportSessionSettled(data?.accessToken);");
  });

  it('has useApi, useUpload and useOfflineApi wait through sessionSettled', () => {
    const src = read('../client.ts');
    expect(src.match(/tokenFor\(status, token, sessionSettled\)/g)).toHaveLength(3);
  });
});
