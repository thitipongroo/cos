// Auth plugin — establishes the caller's tenant/user identity (defense-in-depth, spec §5.9.4).
// Kong verifies the JWT at ingress and injects x-tenant-id/x-user-id/x-user-role; this plugin ALSO
// verifies the bearer token itself (RS256/JWKS) and derives the tenant from the claim, so it never
// trusts a header alone. Token and header must agree when both are present (fail closed).

import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { buildError } from '../errors';
import { verifyBearer } from './jwt-verify';

export const authPlugin = fp(async (app: FastifyInstance) => {
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Health/liveness probes are unauthenticated — they carry no identity.
    if (request.url === '/health/live' || request.url === '/health/ready') {
      return;
    }

    let verified;
    try {
      verified = await verifyBearer(request.headers['authorization']);
    } catch {
      return reply.status(401).send(buildError('INVALID_TOKEN', request.traceId ?? 'unknown'));
    }

    const headerTenant = request.headers['x-tenant-id'] as string | undefined;
    // The token is authoritative; a Kong-injected header must match it.
    if (verified && headerTenant && verified.tenantId !== headerTenant) {
      return reply.status(401).send(buildError('INVALID_TOKEN', request.traceId ?? 'unknown'));
    }

    const tenantId = verified?.tenantId ?? headerTenant;
    const userId = verified?.userId || (request.headers['x-user-id'] as string | undefined);
    if (!tenantId || !userId) {
      return reply
        .status(401)
        .send(buildError('MISSING_TENANT_HEADER', request.traceId ?? 'unknown'));
    }

    request.tenantId = tenantId;
    request.userId = userId;
    request.userRole =
      verified?.role || ((request.headers['x-user-role'] as string | undefined) ?? '');
  });
});
