// The backend's own credential for calling the internal services (TDD OQ-46).
//
// WHY THIS EXISTS
// ---------------
// `FileServiceClient` and `CredentialClientService` used to call their services with three headers
// and nothing else — `x-tenant-id`, `x-user-id`, `x-user-role`, read from the ambient CLS context.
// The receiving plugins accepted them: `verifyBearer` returns null when there is no Authorization
// header, and both fell through to `verified?.tenantId ?? headerTenant`. file-service does the same
// for the ROLE, so an unauthenticated request could claim `x-user-role: SYSTEM_ADMIN`.
//
// The justification was Kong: verify at the edge, strip any client-supplied identity headers, inject
// the verified ones. Kong is deployed nowhere — no ArgoCD Application references
// `infrastructure/kubernetes/kong/`, there are no `KongPlugin` CRDs, no chart carries an Ingress
// template, and the only `kind: Ingress` in the repository names `ingressClassName: nginx`. Both
// services are ClusterIP with no NetworkPolicy and no mesh, so the headers had no verifier in front
// of them and every pod in the namespace could send them.
//
// WHAT THIS IS, AND WHAT IT IS NOT
// --------------------------------
// A trusted-subsystem credential. The token proves **who is calling** — the backend — and the
// headers continue to say **on whose behalf**. It is deliberately not a propagated user token: the
// backend calls these services from Temporal activities and Kafka consumers as well as from
// requests, and those have no user token to forward.
//
// So it is one of two layers, not a replacement for the other. The NetworkPolicies added alongside it
// answer "which pods may connect"; this answers "and can they prove they are who they claim". Spec
// §5.4's Istio mTLS, which would answer both at the transport, still exists nowhere.
//
// THE TOKEN
// ---------
// `client_credentials` against the `cos-backend` client, which is already confidential with
// `serviceAccountsEnabled: true` and a secret — no realm change was needed, and ADR-067's ban on
// hand-editing the realm's authentication flows is untouched. Verified against a live Keycloak
// 26.6.4: the token carries `aud: [cos-backend, realm-management, account]` (so the services'
// existing `audience: 'cos-backend'` check passes), `azp: cos-backend`,
// `preferred_username: service-account-cos-backend`, `expires_in: 900` — and **no `tenant_id`
// claim**, which is exactly what lets the receiver tell a service token from a user token.

import { Injectable } from '@nestjs/common';
import { createLogger } from '@cos/logger';

const logger = createLogger('service-token');

/**
 * Refresh this many seconds before the token actually expires. A request that starts with four
 * seconds left can still arrive after the token is dead; 60 s is longer than any of these calls
 * (`REQUEST_TIMEOUT_MS` is 10 s) plus a retry.
 */
const EXPIRY_MARGIN_SECONDS = 60;

const TOKEN_REQUEST_TIMEOUT_MS = 5_000;

interface TokenResponse {
  access_token: string;
  expires_in: number;
}

@Injectable()
export class ServiceTokenService {
  private readonly baseUrl: string;
  private readonly realm: string;
  private readonly clientId: string;
  private readonly clientSecret: string;

  private token: string | null = null;
  private expiresAt = 0;
  /** In-flight fetch, so N concurrent callers on a cold cache make ONE token request, not N. */
  private inFlight: Promise<string> | null = null;

  constructor() {
    // Same four variables KeycloakAdminService reads, and the same defaults, so there is one
    // credential for the backend rather than two that can drift apart.
    this.baseUrl = process.env['KEYCLOAK_URL'] ?? 'http://localhost:8090';
    this.realm = process.env['KEYCLOAK_REALM'] ?? 'construction-os-dev';
    this.clientId = process.env['KEYCLOAK_ADMIN_CLIENT_ID'] ?? 'cos-backend';
    const secret = process.env['KEYCLOAK_ADMIN_CLIENT_SECRET'];
    if (!secret && process.env['NODE_ENV'] === 'production') {
      throw new Error('KEYCLOAK_ADMIN_CLIENT_SECRET must be set in production');
    }
    this.clientSecret = secret ?? 'cos-backend-secret-dev';
  }

  /**
   * A valid bearer token for internal service calls.
   *
   * Throws when Keycloak cannot issue one. That is deliberate and differs from the outbox's
   * never-throw rule: an event is a side effect of work that already succeeded, whereas a file read
   * that cannot authenticate has not happened and must not be reported as though it had.
   */
  async getToken(): Promise<string> {
    const now = Date.now();
    if (this.token && now < this.expiresAt) return this.token;
    // Coalesce: whoever arrives while a fetch is running awaits that one.
    this.inFlight ??= this.fetchToken().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  /** Drop the cached token — for a caller that got a 401 and wants one retry with a fresh one. */
  invalidate(): void {
    this.token = null;
    this.expiresAt = 0;
  }

  private async fetchToken(): Promise<string> {
    const url = `${this.baseUrl}/realms/${this.realm}/protocol/openid-connect/token`;
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(TOKEN_REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      logger.error({ err: (err as Error).message }, 'service-token.request-failed');
      throw new Error('Could not reach Keycloak for a service token');
    }

    if (!res.ok) {
      // Never log the body: an error from the token endpoint can echo the request back.
      logger.error({ status: res.status }, 'service-token.rejected');
      throw new Error(`Keycloak refused the service token (${res.status})`);
    }

    const json = (await res.json()) as TokenResponse;
    this.token = json.access_token;
    this.expiresAt = Date.now() + Math.max(0, json.expires_in - EXPIRY_MARGIN_SECONDS) * 1000;
    logger.debug({ expires_in: json.expires_in }, 'service-token.issued');
    return this.token;
  }
}
