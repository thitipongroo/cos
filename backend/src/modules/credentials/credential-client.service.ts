// CredentialClientService — backend → CredentialService (services/credential-service/) REST client.
//
// Transport (ADR-019, decision 2026-07-21, option A): the backend calls CredentialService directly on
// the internal network (CREDENTIAL_SERVICE_URL) and forwards the acting principal as the identity
// headers the service's auth plugin trusts (x-tenant-id / x-user-id / x-user-role). Trust boundary is
// the internal mesh — mTLS at the infra layer (05 §5.4); CredentialService is not exposed to the edge
// for these routes. Identity is read from the ambient request context (CLS, ADR-031); a call with no
// tenant context fails closed (401) rather than issuing/revoking without a principal.
//
// The did:web resolution + verify endpoints are also reachable here; verify still carries tenant
// identity (it is not a public route on the service). Non-2xx from the service maps to an HttpException:
// 4xx passes through (the caller's fault — e.g. 403 non-admin, 404 unknown VC), 5xx / transport
// failure becomes 502 Bad Gateway.

import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { createLogger } from '@cos/logger';
import { clsTenantId, clsUserId, clsUserRole } from '../../shared/context/cls-context';

const logger = createLogger('credential-client');

/** Mirrors credential-service enum credentials."CredentialType". */
export type CredentialType =
  'LICENCE' | 'EQUIPMENT_CERT' | 'TRAINING_RECORD' | 'CONTRACT_SIGNATURE';

export interface IssueCredentialRequest {
  credentialType: CredentialType;
  /** Subject DID (did:key / did:web) the VC is issued to. */
  subjectId: string;
  /** Type-specific claims (e.g. licenceNumber); merged into credentialSubject. */
  claims?: Record<string, unknown>;
  /** SHA-256 hex of the signed document — set for CONTRACT_SIGNATURE. */
  documentHash?: string;
}

export interface IssueCredentialResult {
  vcId: string;
  credential: Record<string, unknown>;
}

export interface VerifyCredentialResult {
  /** Proof AND revocation status together (ADR-019 §Verification) — a revoked VC is never verified. */
  verified: boolean;
  /** Distinguishes "was valid, now revoked" from "bad proof". Always false for contract signatures,
   *  which are point-in-time and occupy no status-list bit. */
  revoked: boolean;
}

export interface RevokeCredentialResult {
  revoked: boolean;
}

const REQUEST_TIMEOUT_MS = 10_000;

@Injectable()
export class CredentialClientService {
  private readonly baseUrl =
    process.env['CREDENTIAL_SERVICE_URL'] ?? 'http://credential-service:3009';

  /** Issue a VC. CONTRACT_SIGNATURE → ephemeral did:key; worker types → tenant did:web issuer (TENANT_ADMIN). */
  async issue(request: IssueCredentialRequest): Promise<IssueCredentialResult> {
    return this.post<IssueCredentialResult>('/credentials/issue', request);
  }

  /** Verify a VC's Data Integrity proof (offline crypto on the service side). */
  async verify(credential: Record<string, unknown>): Promise<VerifyCredentialResult> {
    return this.post<VerifyCredentialResult>('/credentials/verify', { credential });
  }

  /** Revoke a worker VC (TENANT_ADMIN). Ephemeral contract signatures are point-in-time (non-revocable). */
  async revoke(vcId: string): Promise<RevokeCredentialResult> {
    return this.post<RevokeCredentialResult>(`/credentials/${encodeURIComponent(vcId)}/revoke`, {});
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const tenantId = clsTenantId();
    if (!tenantId) {
      // Fail closed: never call the credential service without a principal.
      throw new HttpException(
        'Missing tenant context for CredentialService call',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const url = `${this.baseUrl}${path}`;
    let res: Awaited<ReturnType<typeof fetch>>;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-tenant-id': tenantId,
          'x-user-id': clsUserId(),
          'x-user-role': clsUserRole(),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      logger.error({ err: (err as Error).message, path }, 'CredentialService request failed');
      throw new HttpException('CredentialService unreachable', HttpStatus.BAD_GATEWAY);
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      logger.warn({ status: res.status, path, detail }, 'CredentialService returned non-2xx');
      const status = res.status >= 400 && res.status < 500 ? res.status : HttpStatus.BAD_GATEWAY;
      throw new HttpException(`CredentialService error (${res.status})`, status);
    }

    return (await res.json()) as T;
  }
}
