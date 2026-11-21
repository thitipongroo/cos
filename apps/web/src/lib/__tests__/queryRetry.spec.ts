import { ApiError } from '../api/client';
import { shouldRetryQuery } from '../queryRetry';

const apiError = (status: number) => new ApiError(status, `Request failed: ${status}`);

// Plan DL (product owner 2026-11-21): a 4xx is the server's answer — not retried, except 401, 408 and 429.
describe('shouldRetryQuery', () => {
  it.each([400, 403, 404, 409, 422])('does not retry a %i', (status) => {
    expect(shouldRetryQuery(0, apiError(status))).toBe(false);
  });

  it.each([
    // A query sent on a hard load before the session arrived: its retry carries the token.
    ['a 401', apiError(401)],
    ['a 408', apiError(408)],
    ['a 429', apiError(429)],
    ['a 500', apiError(500)],
    ['a 503', apiError(503)],
    ['a network failure', new TypeError('Failed to fetch')],
  ])('retries %s once, not twice', (_n, error) => {
    expect(shouldRetryQuery(0, error)).toBe(true);
    expect(shouldRetryQuery(1, error)).toBe(false);
  });
});
