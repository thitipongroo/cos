// CredentialService HTTP routes (ADR-019; CS-8). Public did:web resolution + tenant-scoped verify.
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
  getStatusListById,
} from '../credential-repository.js';
import {
  allocateStatusEntry,
  revokeStatusEntry,
  createDbStatusChecker,
  type StatusListEntry,
  type StatusListSigner,
} from '../status-list-service.js';
import { CREDENTIAL_TYPES } from '../credential-context.js';
import { buildError } from '../errors.js';
import { createLogger } from '../logger.js';

// QM-8 structured logging. Only ids, enums and booleans — see logger.ts for what must never be logged.
// pino's messageKey is `event`, so the message argument becomes the event name.
const logger = createLogger('credential-service.routes');

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
    const baseDomain = app.config.issuer.didWebBaseDomain;
    // ADR-019 §Verification = Data Integrity proof AND Status List. The checker reads the bit from
    // this tenant's stored list, so `verified` already accounts for revocation; `revoked` is returned
    // separately so a caller can tell "forged" from "was valid, now revoked".
    const result = await verifyCredential(
      body.credential,
      [baseDomain],
      createDbStatusChecker(app.pool, request.tenantId, baseDomain),
    );
    logger.info(
      {
        tenantId: request.tenantId,
        traceId: request.traceId,
        verified: result.verified,
        revoked: result.revoked,
      },
      'credential.verified',
    );
    return { verified: result.verified, revoked: result.revoked };
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
    // Hoisted: TypeScript drops the `!body.subjectId` narrowing inside the transaction callback.
    const subjectId = body.subjectId;
    const credentialType = body.credentialType as keyof typeof CREDENTIAL_TYPES;
    const vcType = CREDENTIAL_TYPES[credentialType];
    const isContractSig = credentialType === 'CONTRACT_SIGNATURE';
    if (!isContractSig && request.userRole !== 'TENANT_ADMIN') {
      return reply.status(403).send(buildError('FORBIDDEN', request.traceId));
    }
    const issuanceDate = new Date().toISOString();
    const baseDomain = app.config.issuer.didWebBaseDomain;
    let credential: unknown;
    let issuerDid = '';
    // Worker credentials are revocable → they claim a Status List bit and carry `credentialStatus`
    // (ADR-019). Contract-signature VCs are point-in-time and stay non-revocable.
    let signer: StatusListSigner | null = null;
    let statusEntry: StatusListEntry | null = null;
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
        subjectId,
        issuanceDate,
        types: [vcType],
        claims,
      });
    } else {
      const issuer = await getOrProvisionIssuer(app.pool, request.tenantId, baseDomain);
      const { suite } = await buildDidWebSuite({
        did: issuer.did,
        publicKeyMultibase: issuer.publicKeyMultibase,
        privateKeyMultibase: decryptIssuerPrivateKey(issuer.encryptedPrivateKey),
      });
      issuerDid = issuer.did;
      signer = { did: issuer.did, suite, allowedIssuerDomains: [baseDomain] };
    }
    const vcId = await withTenant(app.pool, request.tenantId, async (client) => {
      // Allocate the bit and sign inside the same transaction as the VC row: a claimed index can
      // never be orphaned by a later failure, and no two VCs can share one.
      if (signer) {
        statusEntry = await allocateStatusEntry(client, request.tenantId, baseDomain, signer);
        const url = statusEntry.statusListCredentialUrl;
        credential = await issueCredential({
          suite: signer.suite,
          issuerDid,
          subjectId,
          issuanceDate,
          types: [vcType],
          claims: body.claims ?? {},
          allowedIssuerDomains: [baseDomain],
          credentialStatus: {
            id: `${url}#${statusEntry.statusListIndex}`,
            type: 'StatusList2021Entry',
            statusPurpose: 'revocation',
            statusListIndex: String(statusEntry.statusListIndex),
            statusListCredential: url,
          },
        });
      }
      const id = await saveVerifiableCredential(client, {
        tenantId: request.tenantId,
        credentialType,
        issuerDid,
        subjectDid: subjectId,
        credential,
        documentHash: body.documentHash,
        ...(statusEntry
          ? {
              statusListId: statusEntry.statusListId,
              statusListIndex: statusEntry.statusListIndex,
            }
          : {}),
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
    logger.info(
      {
        tenantId: request.tenantId,
        userId: request.userId,
        traceId: request.traceId,
        vcId,
        credentialType,
        revocable: statusEntry !== null,
      },
      'credential.issued',
    );
    return reply.status(201).send({ vcId, credential });
  });

  // Revoke a VC (TENANT_ADMIN).
  app.post('/credentials/:vcId/revoke', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.userRole !== 'TENANT_ADMIN') {
      return reply.status(403).send(buildError('FORBIDDEN', request.traceId));
    }
    const { vcId } = request.params as { vcId: string };
    const baseDomain = app.config.issuer.didWebBaseDomain;
    // The issuer signs the republished status list, so resolve it before opening the transaction.
    const issuer = await getOrProvisionIssuer(app.pool, request.tenantId, baseDomain);
    const { suite } = await buildDidWebSuite({
      did: issuer.did,
      publicKeyMultibase: issuer.publicKeyMultibase,
      privateKeyMultibase: decryptIssuerPrivateKey(issuer.encryptedPrivateKey),
    });
    const entry = await withTenant(app.pool, request.tenantId, async (client) => {
      const revokedEntry = await revokeVerifiableCredential(client, request.tenantId, vcId);
      if (!revokedEntry) return null;
      // Flip the published bit in the same transaction — the DB status and the published list can
      // never disagree (ADR-019 §Revocation).
      if (revokedEntry.statusListId !== null && revokedEntry.statusListIndex !== null) {
        await revokeStatusEntry(client, {
          tenantId: request.tenantId,
          baseDomain,
          statusListId: revokedEntry.statusListId,
          statusListIndex: revokedEntry.statusListIndex,
          signer: { did: issuer.did, suite, allowedIssuerDomains: [baseDomain] },
        });
      }
      await writeAuditLog(client, {
        tenantId: request.tenantId,
        actorId: request.userId,
        action: 'CREDENTIAL_REVOKED',
        resourceType: 'verifiable_credential',
        resourceId: vcId,
        metadata: { statusListId: revokedEntry.statusListId },
      });
      return revokedEntry;
    });
    if (!entry) {
      return reply.status(404).send(buildError('VC_NOT_FOUND', request.traceId));
    }
    logger.info(
      {
        tenantId: request.tenantId,
        userId: request.userId,
        traceId: request.traceId,
        vcId,
        statusListId: entry.statusListId,
        published: entry.statusListId !== null,
      },
      'credential.revoked',
    );
    return { revoked: true };
  });

  // Public Status List 2021 publication (CS-6). An offline verifier fetches this URL — it is embedded
  // in every revocable worker VC's `credentialStatus` — and reads the revocation bit itself. Public by
  // design, like did.json: the payload is a signed credential holding an opaque compressed bitstring,
  // no subject identifiers (§5.9.8 Information Disclosure).
  app.get(
    '/tenants/:tenantId/status-lists/:statusListId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { tenantId, statusListId } = request.params as {
        tenantId: string;
        statusListId: string;
      };
      const list = await withTenant(app.pool, tenantId, (client) =>
        getStatusListById(client, tenantId, statusListId),
      );
      if (!list) {
        return reply.status(404).send(buildError('STATUS_LIST_NOT_FOUND', request.traceId));
      }
      return list.statusListCredential;
    },
  );
}
