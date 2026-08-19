// Classifying a failed request — the one place that decides whether a sync attempt should be
// retried, abandoned, or treated as "we never reached the server at all".
//
// WHY IT DOES NOT IMPORT AXIOS. `axios.isAxiosError(x)` is defined as `isObject(x) && x.isAxiosError
// === true` (axios/lib/helpers/isAxiosError.js), so the duck-type below is exact rather than an
// approximation. Keeping axios out lets SyncManager — which takes an injected HttpClient precisely so
// it can be unit-tested without a transport — use the same classification the axios interceptor uses,
// instead of the two drifting apart.
//
// THREE OUTCOMES, because the queue must treat them differently:
//   - NETWORK   — no response at all. The mutation has certainly NOT been applied. Retry, and do not
//                 spend a retry: there was nothing wrong with the item.
//   - TIMEOUT   — the request was abandoned client-side. The server MAY have applied it. Retryable,
//                 but the caller must know it is not the same as "never sent" (see `mutate`).
//   - PERMANENT — the server answered with a 4xx it will answer identically to forever. Retrying is
//                 pure cost: five more rejections, then a discard that could have happened at once.

/** The shape both axios errors and hand-rolled test doubles satisfy. */
interface HttpErrorLike {
  response?: { status?: number };
  code?: string;
  isAxiosError?: boolean;
}

function asHttpError(err: unknown): HttpErrorLike | null {
  return typeof err === 'object' && err !== null ? (err as HttpErrorLike) : null;
}

/** The status the server answered with, or null when it never answered. */
export function responseStatus(err: unknown): number | null {
  const e = asHttpError(err);
  const status = e?.response?.status;
  return typeof status === 'number' ? status : null;
}

/**
 * The request was abandoned before the server answered (axios `ECONNABORTED`).
 *
 * Distinct from `isNetworkError` on purpose: a timeout is the one failure where the write may have
 * landed anyway, so a caller that replays it can produce a duplicate.
 */
export function isTimeout(err: unknown): boolean {
  const e = asHttpError(err);
  return !!e && e.response === undefined && e.code === 'ECONNABORTED';
}

/** No response reached us — offline, DNS failure, connection refused, or a timeout. */
export function isNetworkError(err: unknown): boolean {
  const e = asHttpError(err);
  if (!e || e.response !== undefined) return false;
  return e.code === 'ERR_NETWORK' || e.code === 'ECONNABORTED' || e.isAxiosError === true;
}

/**
 * A failure that repeating cannot fix: the server understood the request and refused it.
 *
 * 408 (Request Timeout) and 429 (Too Many Requests) are excluded — both explicitly invite the client
 * to come back — as is every 5xx, which is the server having a bad moment rather than a bad item.
 */
export function isPermanentFailure(err: unknown): boolean {
  const status = responseStatus(err);
  if (status === null) return false;
  if (status === 408 || status === 429) return false;
  return status >= 400 && status < 500;
}
