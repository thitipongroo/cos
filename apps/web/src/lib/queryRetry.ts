/**
 * Whether a failed query is tried again (plan DL) — the QueryClient's `queries.retry` (app/providers.tsx).
 *
 * It was `retry: 1` for every failure: a 403 or 404 was asked twice and the page waited for both before showing
 * it. Product owner, 2026-11-21: a refusal (4xx) is the server's answer and is not retried — except 408 (timed out)
 * and 429 (too many requests), which say "try again" (as the mobile app's `isPermanentFailure`), and 401: on a hard
 * page load a query can go out before the session has arrived (SessionProvider gets none from the server), and its
 * retry is what picks up the token (found by /doubt; the retry re-reads the query's current fetcher). A 5xx or a
 * network failure keeps its one retry.
 */
import { ApiError } from './api/client';

export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (
    error instanceof ApiError &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 401 &&
    error.status !== 408 &&
    error.status !== 429
  ) {
    return false;
  }
  return failureCount < 1;
}
