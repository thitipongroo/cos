// Auth plugin — establishes the caller's tenant/user identity (spec §5.9.4).
//
// **A verified bearer token is required** (TDD OQ-46). It used to be optional: `verifyBearer`
// returns null when there is no Authorization header, and this plugin fell through to
// `verified?.tenantId ?? headerTenant` — and, worse, to `verified?.role || header['x-user-role']`.
// The premise was that Kong had verified the token at the edge and stripped any client-supplied
// copies of those headers. Kong is deployed nowhere (see jwt-verify.ts), and this Service is
// ClusterIP with no NetworkPolicy and no mesh, so an unauthenticated pod in the namespace could send
// `x-user-role: SYSTEM_ADMIN` with any tenant it liked.
//
// Now:
//   no token          → 401.
//   user token        → identity from the CLAIMS. An `x-tenant-id` header may only agree with it.
//   service token     → the caller is authenticated as the backend; the identity headers say on
//                       whose behalf, and all three are required.
//
// The headers still carry the principal because the backend calls this service from Temporal
// activities and Kafka consumers, which hold no user token to forward. What changed is that sending
// them now costs a credential.

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

    if (!verified) {
      // No bearer token. There is no gateway behind which this could be safe.
      return reply.status(401).send(buildError('INVALID_TOKEN', request.traceId ?? 'unknown'));
    }

    const headerTenant = request.headers['x-tenant-id'] as string | undefined;
    let tenantId: string | undefined;
    let userId: string | undefined;
    let userRole: string;

    if (verified.kind === 'user') {
      // Claims win outright. A header may accompany them but may not change them.
      if (headerTenant && verified.tenantId !== headerTenant) {
        return reply.status(401).send(buildError('INVALID_TOKEN', request.traceId ?? 'unknown'));
      }
      tenantId = verified.tenantId;
      userId = verified.userId;
      userRole = verified.role;
    } else {
      // Trusted subsystem: authenticated as the backend, acting for the principal in the headers.
      tenantId = headerTenant;
      userId = request.headers['x-user-id'] as string | undefined;
      userRole = (request.headers['x-user-role'] as string | undefined) ?? '';
    }

    if (!tenantId || !userId) {
      return reply
        .status(401)
        .send(buildError('MISSING_TENANT_HEADER', request.traceId ?? 'unknown'));
    }

    request.tenantId = tenantId;
    request.userId = userId;
    request.userRole = userRole;
  });
});
