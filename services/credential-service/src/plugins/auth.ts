// Auth — reads tenant/user identity from Kong-forwarded headers (JWT validated at ingress), like
// file-service. Public paths (health + did:web resolution) are exempt: did:web documents are resolved
// by third parties with no platform identity (BG-001).
import type { FastifyInstance } from 'fastify';
import { buildError } from '../errors.js';

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

    const tenantId = request.headers['x-tenant-id'];
    const userId = request.headers['x-user-id'];
    if (typeof tenantId !== 'string' || typeof userId !== 'string' || !tenantId || !userId) {
      return reply
        .status(401)
        .send(buildError('MISSING_TENANT_HEADER', request.traceId ?? 'unknown'));
    }
    request.tenantId = tenantId;
    request.userId = userId;
    request.userRole = (request.headers['x-user-role'] as string | undefined) ?? '';
  });
}
