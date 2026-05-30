// Database retry helper — ADR-015
// Retries Prisma calls that fail with transient error codes.
// Retryable: P2034 (deadlock), P1001 (unreachable), P1002 (timeout).
// Strategy: exponential backoff with full jitter, max 3 retries, base 100ms.

import { Prisma } from '@prisma/client';

const RETRYABLE_CODES = new Set(['P2034', 'P1001', 'P1002']);
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 100;
const MAX_DELAY_MS = 5000;

function isRetryable(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return RETRYABLE_CODES.has(error.code);
  }
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return true;
  }
  return false;
}

function jitteredDelay(attempt: number, baseDelayMs: number): number {
  const ceiling = Math.min(baseDelayMs * Math.pow(2, attempt), MAX_DELAY_MS);
  return Math.floor(Math.random() * ceiling);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
}

/**
 * Wraps a Prisma operation with exponential backoff retry for transient errors.
 * The wrapped function must be idempotent — retrying a non-idempotent operation
 * can cause duplicate side-effects.
 *
 * @example
 * const result = await withRetry(() =>
 *   prisma.project.findMany({ where: { tenantId } })
 * );
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (!isRetryable(error) || attempt === maxRetries) {
        throw error;
      }

      await sleep(jitteredDelay(attempt, baseDelayMs));
    }
  }

  throw lastError;
}
