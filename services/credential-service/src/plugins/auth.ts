// Auth — establishes tenant/user identity with in-service JWT verification (defense-in-depth,
// spec §5.9.4), like file-service. Kong verifies + injects identity headers at ingress; this service
// ALSO verifies the bearer token itself and derives tenant from the claim — never trusting a header
// alone (credential-service holds tenant issuer keys). Public paths (health + did:web + status-list
// resolution) are exempt: those are fetched by third parties with no platform identity (BG-001).
import type { FastifyInstance } from 'fastify';
import { buildError } from '../errors.js';
import { verifyBearer } from './jwt-verify.js';

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

    const headerTenant = request.headers['x-tenant-id'];
    // The token is authoritative; a Kong-injected header must agree with it (fail closed).
    if (verified && typeof headerTenant === 'string' && verified.tenantId !== headerTenant) {
      return reply.status(401).send(buildError('INVALID_TOKEN', request.traceId ?? 'unknown'));
    }

    const headerUser = request.headers['x-user-id'];
    const tenantId = verified?.tenantId ?? (typeof headerTenant === 'string' ? headerTenant : '');
    const userId = verified?.userId || (typeof headerUser === 'string' ? headerUser : '');
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
}
