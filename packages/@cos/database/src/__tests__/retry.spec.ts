// Unit tests for withRetry — ADR-015
// Tests: success path, retry on P2034/P1001/P1002, max retries, non-retryable errors
//
// Uses jest.useFakeTimers() + jest.runAllTimersAsync() (Jest 29.1+).
// runAllTimersAsync() correctly interleaves timer firing with microtask draining,
// which is required for multi-retry chains where each sleep() is a Promise.

import { withRetry } from '../retry';

// Mock Prisma error classes
jest.mock('@prisma/client', () => {
  class PrismaClientKnownRequestError extends Error {
    code: string;
    clientVersion: string;
    constructor(message: string, { code, clientVersion }: { code: string; clientVersion: string }) {
      super(message);
      this.code = code;
      this.clientVersion = clientVersion;
      this.name = 'PrismaClientKnownRequestError';
    }
  }
  class PrismaClientInitializationError extends Error {
    clientVersion: string;
    constructor(message: string, clientVersion: string) {
      super(message);
      this.clientVersion = clientVersion;
      this.name = 'PrismaClientInitializationError';
    }
  }
  return { Prisma: { PrismaClientKnownRequestError, PrismaClientInitializationError } };
});

import { Prisma } from '@prisma/client';

describe('withRetry', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns result on first success without any retry', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, { baseDelayMs: 0 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on P2034 (write conflict/deadlock) — 1 retry', async () => {
    const deadlockError = new Prisma.PrismaClientKnownRequestError('write conflict', {
      code: 'P2034',
      clientVersion: '5',
    });
    const fn = jest.fn().mockRejectedValueOnce(deadlockError).mockResolvedValue('ok');

    const promise = withRetry(fn, { baseDelayMs: 0 });
    // runAllTimersAsync fires the sleep(0) timer AND drains microtasks
    // so withRetry resumes and completes its retry
    await jest.runAllTimersAsync();
    expect(await promise).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries on P1001 (unreachable) — 2 retries', async () => {
    const err = new Prisma.PrismaClientKnownRequestError('unreachable', {
      code: 'P1001',
      clientVersion: '5',
    });
    const fn = jest
      .fn()
      .mockRejectedValueOnce(err)
      .mockRejectedValueOnce(err)
      .mockResolvedValue('recovered');

    const promise = withRetry(fn, { baseDelayMs: 0 });
    // Must call twice: each call fires one sleep timer AND drains microtasks
    // so withRetry runs the next iteration after each call
    await jest.runAllTimersAsync();
    await jest.runAllTimersAsync();
    expect(await promise).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('retries on P1002 (timeout)', async () => {
    const err = new Prisma.PrismaClientKnownRequestError('timeout', {
      code: 'P1002',
      clientVersion: '5',
    });
    const fn = jest.fn().mockRejectedValueOnce(err).mockResolvedValue('ok');

    const promise = withRetry(fn, { baseDelayMs: 0 });
    await jest.runAllTimersAsync();
    expect(await promise).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws after max retries exceeded (3 retries)', async () => {
    const err = new Prisma.PrismaClientKnownRequestError('write conflict', {
      code: 'P2034',
      clientVersion: '5',
    });
    const fn = jest.fn().mockRejectedValue(err);

    const promise = withRetry(fn, { maxRetries: 3, baseDelayMs: 0 });
    // 3 retries = 3 sleep timers to run
    await jest.runAllTimersAsync();
    await jest.runAllTimersAsync();
    await jest.runAllTimersAsync();
    await expect(promise).rejects.toThrow('P2034');
    expect(fn).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
  });

  it('does NOT retry on non-retryable error — P2002 unique constraint', async () => {
    const err = new Prisma.PrismaClientKnownRequestError('unique constraint', {
      code: 'P2002',
      clientVersion: '5',
    });
    const fn = jest.fn().mockRejectedValue(err);

    // No timer needed — fails immediately without retry
    await expect(withRetry(fn, { baseDelayMs: 0 })).rejects.toThrow('P2002');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry on generic Error', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('generic error'));

    await expect(withRetry(fn, { baseDelayMs: 0 })).rejects.toThrow('generic error');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on PrismaClientInitializationError', async () => {
    const err = new Prisma.PrismaClientInitializationError('Connection failed', '5.0');
    const fn = jest.fn().mockRejectedValueOnce(err).mockResolvedValue('ok');

    const promise = withRetry(fn, { baseDelayMs: 0 });
    await jest.runAllTimersAsync();
    expect(await promise).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
