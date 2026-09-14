// Auth — establishes tenant/user identity from a verified token (spec §5.9.4), like file-service.
//
// **A verified bearer token is required** (TDD OQ-46). It was optional: `verifyBearer` returns null
// when there is no Authorization header, and this hook fell through to
// `verified?.tenantId ?? headerTenant` and `verified?.role || header['x-user-role']`. The premise was
// that Kong verified at ingress and stripped client-supplied copies; Kong is deployed nowhere (see
// jwt-verify.ts), and this service is ClusterIP with no NetworkPolicy and no mesh. It holds every
// tenant's issuer key material.
//
//   no token      → 401.
//   user token    → identity from the BACKEND (ADR-107), never from the claims: they are Keycloak user
//                   attributes. Backend refuses → 401; unavailable → 503. x-tenant-id may only agree.
//   service token → authenticated as the backend; the identity headers say on whose behalf.
//
// Public paths (health + did:web + status-list resolution) stay exempt: those are fetched by third
// parties with no platform identity at all (BG-001).
import type { FastifyInstance } from 'fastify';
import { buildError } from '../errors.js';
import { verifyBearer } from './jwt-verify.js';
import { IdentityRejectedError, resolveUserIdentity } from '@cos/service-identity';

const DID_WEB_PATH = /^\/tenants\/[^/]+\/did\.json(\?.*)?$/;
// Status List 2021 publication (CS-6): the URL embedded in every revocable VC's `credentialStatus`.
// An offline verifier holding only the VC fetches it with no platform identity, exactly like did.json.
const STATUS_LIST_PATH = /^\/tenants\/[^/]+\/status-lists\/[^/]+(\?.*)?$/;

export function isPublicPath(method: string, url: string): boolean {
  if (url === '/health') return true;
  if (method !== 'GET') return false;
  return DID_WEB_PATH.test(url) || STATUS_LIST_PATH.test(url);
}

export function registerAuth(app: FastifyInstance): void {
  app.addHook('onRequest', async (request, reply) => {
    if (isPublicPath(request.method, request.url)) return;

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

    const headerTenant = request.headers['x-tenant-id'];
    const headerUser = request.headers['x-user-id'];
    let tenantId: string;
    let userId: string;
    let userRole: string;

    if (verified.kind === 'user') {
      let identity;
      try {
        identity = await resolveUserIdentity(
          request.headers['authorization'] as string,
          verified.exp,
        );
      } catch (err) {
        if (err instanceof IdentityRejectedError) {
          return reply.status(401).send(buildError('INVALID_TOKEN', request.traceId ?? 'unknown'));
        }
        request.log.error(
          { reason: err instanceof Error ? err.message : String(err) },
          'auth.identity.unavailable — backend could not confirm the caller; refusing rather than trusting claims',
        );
        return reply
          .status(503)
          .send(buildError('IDENTITY_UNAVAILABLE', request.traceId ?? 'unknown'));
      }
      // The backend's answer wins outright. A header may accompany it but may not change it.
      if (typeof headerTenant === 'string' && identity.tenantId !== headerTenant) {
        return reply.status(401).send(buildError('INVALID_TOKEN', request.traceId ?? 'unknown'));
      }
      tenantId = identity.tenantId;
      userId = identity.userId;
      userRole = identity.role;
    } else {
      // Trusted subsystem: authenticated as the backend, acting for the principal in the headers.
      tenantId = typeof headerTenant === 'string' ? headerTenant : '';
      userId = typeof headerUser === 'string' ? headerUser : '';
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
}
