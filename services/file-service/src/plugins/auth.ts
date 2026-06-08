// Auth plugin — extracts tenant_id and user_id from Kong-forwarded headers.
// Kong validates the JWT at ingress; this plugin reads the verified claims.
// Source: context/00_master_construction_os.md §Global Technology Decision Map — API Gateway

import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { buildError } from '../errors';

export const authPlugin = fp(async (app: FastifyInstance) => {
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.headers['x-tenant-id'] as string | undefined;
    const userId = request.headers['x-user-id'] as string | undefined;

    if (!tenantId || !userId) {
      const body = buildError('MISSING_TENANT_HEADER', request.traceId ?? 'unknown');
      return reply.status(401).send(body);
    }

    request.tenantId = tenantId;
    request.userId = userId;
    request.userRole = (request.headers['x-user-role'] as string | undefined) ?? '';
  });
});
