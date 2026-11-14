import { errors } from '@opensearch-project/opensearch';
import pino from 'pino';
import { searchFailureLog } from '../search-failure-log';

// The query body the client puts on its errors (`err.meta.meta.request.params.body`), with a name in it.
const Q = 'นายสมชาย ใจดี';
const requestMeta = {
  meta: {
    request: {
      params: {
        method: 'POST',
        path: '/site-issues/_search',
        body: JSON.stringify({ query: { multi_match: { query: Q } } }),
      },
    },
  },
};

/** The line pino would write for `logger.warn(obj, msg)`. */
const logged = (obj: object): string => {
  const lines: string[] = [];
  const log = pino({}, { write: (l: string) => void lines.push(l) });
  log.warn(obj, 'opensearch.search.failed');
  return lines.join('');
};

describe('searchFailureLog', () => {
  it('a ConnectionError (OpenSearch down): name and length only — the query body is not logged', () => {
    const err = new errors.ConnectionError(
      'connect ECONNREFUSED 127.0.0.1:1',
      requestMeta as never,
    );
    const out = searchFailureLog(Q, err);
    expect(out).toEqual({ q_length: Q.length, err_name: 'ConnectionError' });
    expect(logged(out)).not.toContain('สมชาย');
    // CONTROL: logging `err` itself, as the services did, writes the name.
    expect(logged({ err })).toContain('สมชาย');
  });

  it("a ResponseError: OpenSearch's status and error type, not its message or body", () => {
    const err = new errors.ResponseError({
      statusCode: 400,
      body: { error: { type: 'search_phase_execution_exception', reason: `bad query ${Q}` } },
      ...requestMeta,
    } as never);
    const out = searchFailureLog(Q, err);
    expect(out).toEqual({
      q_length: Q.length,
      err_name: 'ResponseError',
      status: 400,
      os_error_type: 'search_phase_execution_exception',
    });
    expect(logged(out)).not.toContain('สมชาย');
  });

  it('anything else thrown: its type, nothing from it', () => {
    expect(searchFailureLog('abc', 'boom')).toEqual({ q_length: 3, err_name: 'string' });
    expect(searchFailureLog('abc', new TypeError(Q))).toEqual({
      q_length: 3,
      err_name: 'TypeError',
    });
  });
});
