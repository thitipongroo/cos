import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';

/** Set request.traceId from a W3C traceparent header, else a fresh id. */
export function registerTrace(app: FastifyInstance): void {
  app.addHook('onRequest', async (request) => {
    const tp = request.headers['traceparent'];
    const fromHeader = typeof tp === 'string' ? tp.split('-')[1] : undefined;
    request.traceId =
      fromHeader && fromHeader.length > 0 ? fromHeader : randomUUID().replace(/-/g, '');
  });
}
