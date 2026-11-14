/**
 * What to log when an OpenSearch search fails — never the search text.
 *
 * `q` is user-typed (an issue title or a report's blocker may name a person — PDPA), and the
 * OpenSearch client's errors carry it: ConnectionError / TimeoutError / ResponseError set
 * `err.meta` to the request result, whose `meta.request.params.body` is the serialized query, and
 * pino's `err` serializer copies every enumerable property. A ResponseError's message can quote the
 * query too (shard-exception reasons). So neither `err` nor its message is logged: only the length of
 * `q`, the error's class, and OpenSearch's status and error type when it answered.
 */
export interface SearchFailureLog {
  q_length: number;
  err_name: string;
  status?: number;
  os_error_type?: string;
}

export function searchFailureLog(q: string, err: unknown): SearchFailureLog {
  const e = (typeof err === 'object' && err !== null ? err : {}) as {
    name?: unknown;
    meta?: { statusCode?: unknown; body?: { error?: { type?: unknown } } };
  };
  const status = e.meta?.statusCode;
  const type = e.meta?.body?.error?.type;
  return {
    q_length: q.length,
    err_name: typeof e.name === 'string' ? e.name : typeof err,
    ...(typeof status === 'number' ? { status } : {}),
    ...(typeof type === 'string' ? { os_error_type: type } : {}),
  };
}
