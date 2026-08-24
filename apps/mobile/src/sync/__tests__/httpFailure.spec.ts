import { isNetworkError, isPermanentFailure, isTimeout, responseStatus } from '../httpFailure';

// Shapes matching what axios actually produces. `axios.isAxiosError(x)` is defined as
// `isObject(x) && x.isAxiosError === true`, so these are the real thing, not an approximation.
const offline = { isAxiosError: true, code: 'ERR_NETWORK' };
const timedOut = { isAxiosError: true, code: 'ECONNABORTED' };
const answered = (status: number) => ({ isAxiosError: true, response: { status } });

describe('httpFailure', () => {
  describe('responseStatus', () => {
    it('reports the status the server answered with', () => {
      expect(responseStatus(answered(409))).toBe(409);
    });

    it('is null when the server never answered', () => {
      expect(responseStatus(offline)).toBeNull();
      expect(responseStatus(new Error('boom'))).toBeNull();
      expect(responseStatus(null)).toBeNull();
      expect(responseStatus('a string')).toBeNull();
    });

    it('is null when `status` is present but not a number', () => {
      expect(responseStatus({ response: { status: '500' } })).toBeNull();
    });
  });

  describe('isNetworkError', () => {
    it('is true when nothing came back', () => {
      expect(isNetworkError(offline)).toBe(true);
      expect(isNetworkError(timedOut)).toBe(true);
      expect(isNetworkError({ isAxiosError: true })).toBe(true);
    });

    it('is false once the server has answered, whatever it said', () => {
      expect(isNetworkError(answered(500))).toBe(false);
      expect(isNetworkError(answered(401))).toBe(false);
    });

    it('is false for anything that is not an error object', () => {
      expect(isNetworkError(null)).toBe(false);
      expect(isNetworkError(undefined)).toBe(false);
      expect(isNetworkError(42)).toBe(false);
      expect(isNetworkError(new Error('a plain error'))).toBe(false);
    });
  });

  describe('isTimeout', () => {
    it('separates an abandoned request from never having sent one', () => {
      // The distinction the queue needs: a timeout is the one failure where the write may already
      // have been applied server-side.
      expect(isTimeout(timedOut)).toBe(true);
      expect(isTimeout(offline)).toBe(false);
    });

    it('is false once a response exists, and for non-objects', () => {
      expect(isTimeout({ response: { status: 504 }, code: 'ECONNABORTED' })).toBe(false);
      expect(isTimeout(null)).toBe(false);
    });
  });

  describe('isPermanentFailure', () => {
    it('is true for a 4xx the server will repeat forever', () => {
      // /sync/push answers 400 for an entity_type it has no case for.
      expect(isPermanentFailure(answered(400))).toBe(true);
      expect(isPermanentFailure(answered(403))).toBe(true);
      expect(isPermanentFailure(answered(413))).toBe(true);
      expect(isPermanentFailure(answered(499))).toBe(true);
    });

    it('is false for the two 4xx that invite a retry', () => {
      expect(isPermanentFailure(answered(408))).toBe(false);
      expect(isPermanentFailure(answered(429))).toBe(false);
    });

    it('is false for 5xx — the server having a bad moment, not a bad item', () => {
      expect(isPermanentFailure(answered(500))).toBe(false);
      expect(isPermanentFailure(answered(503))).toBe(false);
    });

    it('is false below 400 and when nothing answered', () => {
      expect(isPermanentFailure(answered(302))).toBe(false);
      expect(isPermanentFailure(offline)).toBe(false);
    });
  });
});
