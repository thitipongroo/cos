// CredentialService HTTP routes (ADR-067; CS-8). Public did:web resolution + tenant-scoped verify.
// Issue/revoke (issuer-signing flow) land in the next increment. Uses app.pool with tenant RLS.
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { withTenant } from '../db.js';
import { getIssuer } from '../credential-repository.js';
import {
  verifyCredential,
  buildDidKeySuite,
  buildDidWebSuite,
  issueCredential,
} from '../vc-service.js';
import { generateEphemeralSignerKey, decryptIssuerPrivateKey } from '../key-manager.js';
import { getOrProvisionIssuer } from '../issuer-service.js';
import {
  saveVerifiableCredential,
  revokeVerifiableCredential,
  writeAuditLog,
} from '../credential-repository.js';
import { CREDENTIAL_TYPES } from '../credential-context.js';
import { buildError } from '../errors.js';

export async function credentialRoutes(app: FastifyInstance): Promise<void> {
  // Public did:web resolution — third parties resolve the issuer DID document (BG-001).
  app.get('/tenants/:tenantId/did.json', async (request: FastifyRequest, reply: FastifyReply) => {
    const { tenantId } = request.params as { tenantId: string };
    const issuer = await withTenant(app.pool, tenantId, (client) => getIssuer(client, tenantId));
    if (!issuer) {
      return reply.status(404).send(buildError('ISSUER_NOT_FOUND', request.traceId));
    }
    return issuer.didDocument;
  });

  // Verify a VC (offline, cryptographic). Tenant-scoped (auth plugin enforces identity).
  app.post('/credentials/verify', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { credential?: unknown } | undefined;
    if (!body || body.credential === undefined) {
      return reply.status(400).send(buildError('INVALID_REQUEST', request.traceId));
    }
    // Bound did:web resolution to this platform's issuer domain (SSRF guard, §5.9.8).
    const result = await verifyCredential(body.credential, [app.config.issuer.didWebBaseDomain]);
    return { verified: result.verified };
  });

  // Issue a VC. CONTRACT_SIGNATURE = ephemeral did:key signer; worker types = persistent did:web issuer
  // (TENANT_ADMIN only). Fine-grained contract-signing RBAC is enforced by the caller (backend).
  app.post('/credentials/issue', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as
      | {
          credentialType?: string;
          subjectId?: string;
          claims?: Record<string, unknown>;
          documentHash?: string;
        }
      | undefined;
    if (
      !body ||
      !body.credentialType ||
      !body.subjectId ||
      !(body.credentialType in CREDENTIAL_TYPES)
    ) {
      return reply.status(400).send(buildError('INVALID_REQUEST', request.traceId));
    }
    const credentialType = body.credentialType as keyof typeof CREDENTIAL_TYPES;
    const vcType = CREDENTIAL_TYPES[credentialType];
    const isContractSig = credentialType === 'CONTRACT_SIGNATURE';
    if (!isContractSig && request.userRole !== 'TENANT_ADMIN') {
      return reply.status(403).send(buildError('FORBIDDEN', request.traceId));
    }
    const issuanceDate = new Date().toISOString();
    let credential: unknown;
    let issuerDid: string;
    if (isContractSig) {
      const { suite, did } = await buildDidKeySuite(await generateEphemeralSignerKey());
      issuerDid = did;
      const claims = {
        ...(body.documentHash ? { documentHash: body.documentHash } : {}),
        ...(body.claims ?? {}),
      };
      credential = await issueCredential({
        suite,
        issuerDid: did,
        subjectId: body.subjectId,
        issuanceDate,
        types: [vcType],
        claims,
      });
    } else {
      const issuer = await getOrProvisionIssuer(
        app.pool,
        request.tenantId,
        app.config.issuer.didWebBaseDomain,
      );
      const { suite } = await buildDidWebSuite({
        did: issuer.did,
        publicKeyMultibase: issuer.publicKeyMultibase,
        privateKeyMultibase: decryptIssuerPrivateKey(issuer.encryptedPrivateKey),
      });
      issuerDid = issuer.did;
      credential = await issueCredential({
        suite,
        issuerDid,
        subjectId: body.subjectId,
        issuanceDate,
        types: [vcType],
        claims: body.claims ?? {},
        allowedIssuerDomains: [app.config.issuer.didWebBaseDomain],
      });
    }
    const vcId = await withTenant(app.pool, request.tenantId, async (client) => {
      const id = await saveVerifiableCredential(client, {
        tenantId: request.tenantId,
        credentialType,
        issuerDid,
        subjectDid: body.subjectId,
        credential,
        documentHash: body.documentHash,
      });
      // Immutable audit in the same tx — no un-audited issuance (QM-4, §5.9.8).
      await writeAuditLog(client, {
        tenantId: request.tenantId,
        actorId: request.userId,
        action: 'CREDENTIAL_ISSUED',
        resourceType: 'verifiable_credential',
        resourceId: id,
        metadata: { credentialType, issuerDid },
      });
      return id;
    });
    return reply.status(201).send({ vcId, credential });
  });

  // Revoke a VC (TENANT_ADMIN).
  app.post('/credentials/:vcId/revoke', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.userRole !== 'TENANT_ADMIN') {
      return reply.status(403).send(buildError('FORBIDDEN', request.traceId));
    }
    const { vcId } = request.params as { vcId: string };
    const revoked = await withTenant(app.pool, request.tenantId, async (client) => {
      const ok = await revokeVerifiableCredential(client, request.tenantId, vcId);
      if (ok) {
        await writeAuditLog(client, {
          tenantId: request.tenantId,
          actorId: request.userId,
          action: 'CREDENTIAL_REVOKED',
          resourceType: 'verifiable_credential',
          resourceId: vcId,
        });
      }
      return ok;
    });
    if (!revoked) {
      return reply.status(404).send(buildError('VC_NOT_FOUND', request.traceId));
    }
    return { revoked: true };
  });
}
