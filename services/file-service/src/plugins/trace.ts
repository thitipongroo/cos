// Trace plugin — propagates W3C traceparent header and sets request.traceId.
// QM-8: all HTTP requests must propagate traceparent.

import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';

export const tracePlugin = fp(async (app: FastifyInstance) => {
  app.addHook('onRequest', async (request) => {
    const traceparent = request.headers['traceparent'] as string | undefined;
    if (traceparent) {
      // Extract trace-id from W3C traceparent: 00-{trace-id}-{parent-id}-{flags}
      const parts = traceparent.split('-');
      request.traceId = parts[1] ?? uuidv4().replace(/-/g, '');
    } else {
      request.traceId = uuidv4().replace(/-/g, '');
    }
  });

  app.addHook('onSend', async (request, reply) => {
    reply.header('traceparent', `00-${request.traceId}-0000000000000001-01`);
  });
});
