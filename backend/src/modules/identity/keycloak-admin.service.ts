import {
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createLogger } from '@cos/logger';

const logger = createLogger('keycloak-admin-service');

export interface KeycloakTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_expires_in: number;
  token_type: string;
}

/**
 * The name an erased Keycloak account carries (TDD OQ-48).
 *
 * NOT `[ERASED]`, which is what the database columns use. The realm's `person-name-prohibited-characters`
 * validator rejects square brackets on `firstName`/`lastName` — measured, not assumed. Keep the two
 * markers distinct rather than "harmonising" them: making this `[ERASED]` turns every erasure into a
 * 400 from Keycloak, half-way through an operation that cannot be retried.
 */
/**
 * A non-OK response from Keycloak's token endpoint, carrying the OAuth `error` code it returned.
 *
 * Exists so a caller can separate "the identity provider refused this grant" from "the identity
 * provider is broken" (TDD OQ-11). Both arrive here as a failed fetch; only the body says which.
 */
export class KeycloakTokenError extends Error {
  constructor(
    readonly oauthError: string | null,
    message: string,
  ) {
    super(message);
    this.name = 'KeycloakTokenError';
  }
}

/**
 * The `error` field of an OAuth error response, or null when the body is not one.
 *
 * Keycloak answers `{"error":"invalid_grant","error_description":"..."}`, but a proxy in front of it
 * can return HTML or nothing at all — so a parse failure means "not an OAuth refusal", which is
 * exactly the case that should stay a 503.
 */
function parseOAuthError(body: string): string | null {
  try {
    const parsed: unknown = JSON.parse(body);
    const code = (parsed as { error?: unknown }).error;
    return typeof code === 'string' ? code : null;
  } catch {
    return null;
  }
}

export const KEYCLOAK_ERASED_MARKER = 'ERASED';

/**
 * The scope that makes Path A's refresh token survive a day underground (TDD OQ-14).
 *
 * `00_master` § PHASE 2 promises "cached token valid 7 days without internet". The realm did not
 * deliver it and nothing said so. Measured against Keycloak 26.6.4 with this realm:
 *
 *   without a scope   refresh_expires_in = 1800   — THIRTY MINUTES, not seven days
 *   scope=offline_access   refresh_expires_in = 0  — does not expire; the token's `typ` is `Offline`
 *
 * The seven days is `ssoSessionMaxLifespan`, a ceiling. What actually kills the session is
 * `ssoSessionIdleTimeout = 1800`. So a worker who lost signal for half an hour came back to a dead
 * refresh token and had to redo SMS OTP — on a site where the reason they were offline is that there
 * is no signal to receive an SMS on. Proved by compressing the idle window to 60s and waiting 75s:
 * the plain refresh returned `Token is not active`, the offline one refreshed cleanly.
 *
 * PATH A ONLY, deliberately. This is issued to a field handset that is expected to be offline for
 * days; a non-expiring refresh token in a browser session belongs to nobody's threat model. Path B
 * keeps the 30-minute idle window.
 *
 * NOTHING ELSE HAD TO CHANGE. `offline_access` is already an optional scope on the `cos-backend`
 * client, and already a composite of `default-roles-construction-os` — so every user holds the role
 * (checked in the committed realm export, not assumed). `refreshToken()` needs no change either: the
 * rotation chain keeps `typ=Offline` and `refresh_expires_in=0` (measured over three rotations).
 *
 * REVOCATION STILL WORKS, and this is the part worth checking before trusting it. An admin
 * `users/{id}/logout` alone does NOT revoke an offline session — measured, the refresh still
 * succeeded afterwards. But `enabled: false` does (`User disabled`), and both `disableUser` and
 * `eraseUser` set that BEFORE they log out. Deactivation and PDPA erasure therefore still cut access.
 */
export const OFFLINE_ACCESS_SCOPE = 'offline_access';

@Injectable()
export class KeycloakAdminService {
  private readonly baseUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor() {
    this.baseUrl = process.env['KEYCLOAK_URL'] ?? 'http://localhost:8090';
    this.clientId = process.env['KEYCLOAK_ADMIN_CLIENT_ID'] ?? 'cos-backend';
    const secret = process.env['KEYCLOAK_ADMIN_CLIENT_SECRET'];
    // Fail-fast in production: the dev placeholder secret must never be used outside local/dev —
    // production injects the real secret via AWS Secrets Manager / Vault (QM-4).
    if (!secret && process.env['NODE_ENV'] === 'production') {
      throw new Error('KEYCLOAK_ADMIN_CLIENT_SECRET must be set in production');
    }
    this.clientSecret = secret ?? 'cos-backend-secret-dev';
  }

  // @keycloak/keycloak-admin-client is ESM-only and backend compiles to CommonJS
  // (module: Node16). Load it via dynamic import() so tsc never emits a require()
  // of an ES module (TS1479); the return type is inferred from the client instance.
  private async getAuthenticatedClient(realm: string) {
    const { default: KcAdminClientCtor } = await import('@keycloak/keycloak-admin-client');
    const client = new KcAdminClientCtor({ baseUrl: this.baseUrl, realmName: realm });
    await client.auth({
      grantType: 'client_credentials',
      clientId: this.clientId,
      clientSecret: this.clientSecret,
    });
    return client;
  }

  /**
   * Create Keycloak user for Path A (phone/OTP).
   * Called at user creation time. Returns Keycloak UUID to store in platform.users.keycloak_user_id.
   */
  async provisionPhoneUser(
    phone: string,
    displayName: string,
    realm: string,
    tenantId: string,
    userId: string,
    role: string,
  ): Promise<{ keycloakUserId: string }> {
    const client = await this.getAuthenticatedClient(realm);
    const { id } = await client.users.create({
      username: phone,
      firstName: displayName,
      enabled: true,
      attributes: { tenant_id: [tenantId], user_id: [userId], role: [role] },
    });
    logger.info({ userId, tenantId, realm }, 'keycloak.user.created (Path A)');
    return { keycloakUserId: id };
  }

  /**
   * Create Keycloak user for Path B (email/OIDC).
   * Called at user creation time. Returns Keycloak UUID to store in platform.users.keycloak_user_id.
   */
  async createEmailUser(
    email: string,
    displayName: string,
    realm: string,
    tenantId: string,
    userId: string,
    role: string,
  ): Promise<{ keycloakUserId: string }> {
    const client = await this.getAuthenticatedClient(realm);
    const { id } = await client.users.create({
      username: email,
      email,
      firstName: displayName,
      enabled: true,
      attributes: { tenant_id: [tenantId], user_id: [userId], role: [role] },
    });
    logger.info({ userId, tenantId, realm }, 'keycloak.user.created (Path B)');
    return { keycloakUserId: id };
  }

  /**
   * Set an ephemeral credential on a Path A Keycloak user and call Direct Grant.
   * Called at OTP login time. ephemeralCredential is a random UUID generated by caller;
   * it is overwritten on each login, effectively making it one-time-use.
   * Returns RS256 access token + refresh token from Keycloak.
   */
  async exchangeOtpForTokens(
    keycloakUserId: string,
    phone: string,
    realm: string,
    ephemeralCredential: string,
  ): Promise<KeycloakTokenResponse> {
    // The Keycloak leg is wrapped so an IDENTITY-PROVIDER failure stops looking like a crash
    // (PO decision 2026-08-06). Until now a tenant pointing at a realm that does not exist, an
    // account missing from the realm, and Keycloak being down all surfaced identically as
    // `500 COS-GENERAL-500` — indistinguishable from a bug in our own code, in the response, in the
    // logs and to any alerting.
    //
    // 503, matching what `AnalyticsService` already does when ClickHouse is unreachable: this is a
    // dependency the request cannot proceed without, not a fault in the caller's input. The realm is
    // logged because it is the field that is wrong in every misconfiguration case, and the one thing
    // an operator cannot recover from the response.
    //
    // The message stays generic — a caller must not learn from an error whether a given phone number
    // has a Keycloak account.
    try {
      const client = await this.getAuthenticatedClient(realm);

      await client.users.resetPassword({
        id: keycloakUserId,
        credential: { type: 'password', value: ephemeralCredential, temporary: false },
      });

      return await this.callTokenEndpoint(
        realm,
        new URLSearchParams({
          grant_type: 'password',
          client_id: this.clientId,
          client_secret: this.clientSecret,
          username: phone,
          password: ephemeralCredential,
          // OFFLINE_ACCESS_SCOPE is what makes the offline-first promise true. See the constant.
          scope: OFFLINE_ACCESS_SCOPE,
        }),
        'directgrant',
      );
    } catch (err) {
      // A REFUSAL IS NOT AN OUTAGE (TDD OQ-11). Keycloak answers `invalid_grant` when the flow
      // declines this user — which is what the realm's `Path B only - privileged roles` execution
      // does to a TENANT_ADMIN / FINANCE account on Direct Grant (measured against 26.6.4). Reporting
      // that as `COS-AUTH-503 Identity provider unavailable` told the caller the platform was down
      // when it was working exactly as designed, and sent whoever read the alert looking for an
      // outage that did not exist.
      //
      // The message deliberately does not say WHY the grant was refused. From here `invalid_grant`
      // covers both "this account may not use this path" and "that was not the right credential",
      // and an error that distinguished them would let a caller enumerate privileged accounts by
      // phone number.
      if (err instanceof KeycloakTokenError && err.oauthError === 'invalid_grant') {
        logger.warn(
          { realm, keycloakUserId },
          'keycloak.directgrant.refused — the identity provider declined this grant',
        );
        throw new UnauthorizedException({
          error: {
            code: 'COS-AUTH-001',
            message: 'This account cannot sign in with an OTP — use email sign-in',
            messageKey: 'auth.otp.pathNotAvailable',
          },
        });
      }

      logger.error(
        { realm, keycloakUserId, err },
        'keycloak.directgrant.failed — identity provider unreachable or misconfigured',
      );
      // Wrapped in `error`, which is the shape `GlobalExceptionFilter.isQm10Body` recognises. A flat
      // `{ code, message }` does NOT survive: the filter falls through to its generic branch, keeps
      // the message and rewrites the code to `COS-GENERAL-503` — verified against the live endpoint.
      throw new ServiceUnavailableException({
        error: { code: 'COS-AUTH-503', message: 'Identity provider unavailable' },
      });
    }
  }

  /** Proxy refresh_token grant to Keycloak. Returns new access + refresh tokens (rotation). */
  async refreshToken(refreshToken: string, realm: string): Promise<KeycloakTokenResponse> {
    return this.callTokenEndpoint(
      realm,
      new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
      }),
      'refresh',
    );
  }

  /** Revoke refresh token at Keycloak logout endpoint. */
  async revokeToken(refreshToken: string, realm: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/realms/${realm}/protocol/openid-connect/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
      }).toString(),
    });
    if (!res.ok) {
      logger.warn(
        { realm, status: res.status },
        'keycloak.revoke.failed — token may already be expired',
      );
    }
  }

  /**
   * Admin-set a temporary password on a user's Keycloak account (TENANT_ADMIN-triggered reset).
   * temporary=true adds the UPDATE_PASSWORD required action, so Keycloak forces the user to choose a
   * new password at their next sign-in — the value returned to the admin is a one-time handover secret,
   * not a permanent credential. The plaintext is generated by the caller and never persisted by COS.
   */
  async setTemporaryPassword(
    keycloakUserId: string,
    realm: string,
    password: string,
  ): Promise<void> {
    const client = await this.getAuthenticatedClient(realm);
    await client.users.resetPassword({
      id: keycloakUserId,
      credential: { type: 'password', value: password, temporary: true },
    });
    logger.info({ keycloakUserId, realm }, 'keycloak.password.temp_reset');
  }

  /**
   * Send a Keycloak UPDATE_PASSWORD action-token email — the standards-compliant admin-initiated reset
   * (NIST 800-63B Rev.4: single-use, short-lived, separate channel). The email carries a one-time link that
   * expires after `lifespanSec`; the user sets their OWN password, so COS never handles a plaintext
   * credential. Requires the target to have an email and the realm SMTP (smtpServer) to be configured.
   */
  async sendPasswordResetEmail(
    keycloakUserId: string,
    realm: string,
    lifespanSec = 900,
  ): Promise<void> {
    const client = await this.getAuthenticatedClient(realm);
    await client.users.executeActionsEmail({
      id: keycloakUserId,
      actions: ['UPDATE_PASSWORD'],
      lifespan: lifespanSec,
    });
    logger.info({ keycloakUserId, realm, lifespanSec }, 'keycloak.password.reset_email_sent');
  }

  /** Delete Keycloak user — rollback on downstream COS DB failure. */
  async deleteUser(keycloakUserId: string, realm: string): Promise<void> {
    const client = await this.getAuthenticatedClient(realm);
    await client.users.del({ id: keycloakUserId });
    logger.info({ keycloakUserId, realm }, 'keycloak.user.deleted');
  }

  /**
   * Disable a Keycloak account and terminate every live session (security review F1).
   *
   * Deactivating a user in `platform.users` alone does NOT revoke access: the account stays enabled in
   * Keycloak, so the person can complete a fresh OIDC login and be issued a brand-new, fully valid
   * token indefinitely. Keycloak is the identity store for both auth paths, so the account must be
   * disabled THERE for deactivation to mean anything.
   *
   * `logout` is what kills the refresh tokens already in the wild — `enabled: false` stops new logins,
   * but an existing refresh token would otherwise keep minting access tokens until it expired.
   */
  async disableUser(keycloakUserId: string, realm: string): Promise<void> {
    const client = await this.getAuthenticatedClient(realm);
    await client.users.update({ id: keycloakUserId }, { enabled: false });
    await client.users.logout({ id: keycloakUserId });
    logger.info({ keycloakUserId, realm }, 'keycloak.user.disabled');
  }

  /**
   * Erase the personal data Keycloak holds about a user, and end their access (PDPA §33 — TDD OQ-48).
   *
   * Anonymising `platform.users` alone leaves the person fully identified in the identity provider:
   * Keycloak stores `username` (their phone number on Path A, their email on Path B), `email`, and
   * `firstName` (their display name). Those three ARE the personal data — the `tenant_id` / `user_id`
   * / `role` attributes are not, and are left in place because the guards and RLS depend on them.
   *
   * Disable-and-scrub rather than `deleteUser`: `platform.users.keycloak_user_id` is
   * `VARCHAR(255) NOT NULL UNIQUE`, so it cannot be nulled. Deleting the Keycloak account would leave
   * that column pointing at nothing, and every later call through it — `disableUser`, `syncUserRole`,
   * `setTemporaryPassword` — would 404 on a row that still looks live. The account object survives as
   * an empty shell; the person does not (PO decision 2026-08-23).
   *
   * EVERY REPLACEMENT VALUE BELOW WAS MEASURED against Keycloak 26.6.4 with this realm's declarative
   * user profile, because three obvious choices are rejected outright:
   *
   *   - `email: null` / omitted — `email` is `required: true` in the realm's user profile, and an
   *     omitted field is left UNCHANGED rather than cleared. So it must be overwritten with a
   *     syntactically valid address that identifies nobody. `.invalid` is the RFC 2606 reserved TLD:
   *     it can never resolve or receive mail, so this address cannot reach a real inbox.
   *   - `firstName: '[ERASED]'` — rejected, `error-person-name-invalid-character`: the
   *     `person-name-prohibited-characters` validator refuses square brackets. Hence bare `ERASED`,
   *     which is deliberately NOT the `[ERASED]` marker the database columns use — the two stores
   *     enforce different character sets and pretending otherwise would be a 400 at erase time, on
   *     the one operation that must not fail half-way.
   *   - `username: …` with the realm's original `editUsernameAllowed: false` — rejected,
   *     `error-user-attribute-read-only`. The realm now sets it `true` (PO decision 2026-08-23);
   *     without that, the person's own email or phone number stays in the IdP forever and this is
   *     not an erasure. `lastName` is `required: true` as well, so it takes the same marker.
   *
   * `username` becomes `erased-{cosUserId}` — an internal identifier already in the token claims and
   * not personal data. Deriving it from the user's own id rather than a fresh random keeps this
   * idempotent: erasing twice produces the same username instead of a second orphan.
   *
   * Order matters. Disable and log out FIRST: the scrub is several round-trips, and a live refresh
   * token would otherwise keep minting access tokens through the middle of it.
   *
   * Irreversible by design — the same property `anonymise()` has, for the same reason.
   */
  async eraseUser(keycloakUserId: string, realm: string, cosUserId: string): Promise<void> {
    const client = await this.getAuthenticatedClient(realm);
    await client.users.update({ id: keycloakUserId }, { enabled: false });
    await client.users.logout({ id: keycloakUserId });
    await client.users.update(
      { id: keycloakUserId },
      {
        username: `erased-${cosUserId}`,
        email: `erased-${cosUserId}@erased.invalid`,
        firstName: KEYCLOAK_ERASED_MARKER,
        lastName: KEYCLOAK_ERASED_MARKER,
        emailVerified: false,
      },
    );
    // No email, no username, no display name in this line — logging them would put the data back
    // (QM-8). The two ids are the audit trail.
    logger.info({ keycloakUserId, realm, cosUserId }, 'keycloak.user.erased');
  }

  /**
   * Rewrite the `role` user attribute the JWT `role` claim is mapped from (security review F2).
   *
   * The realm maps `role` with an `oidc-usermodel-attribute-mapper` over the user attribute of the
   * same name (infrastructure/keycloak/realms/construction-os-realm.json), and that attribute was
   * previously written ONLY at user-creation time. A role change in `platform.tenant_memberships`
   * therefore never reached any token Keycloak minted afterwards, so a demotion never took effect.
   *
   * Attributes are read-modify-written: Keycloak REPLACES the whole attribute map when the field is
   * present, so sending `{ role }` alone would silently drop `tenant_id` and `user_id` — the two
   * claims every downstream guard and RLS transaction depends on.
   *
   * No forced logout here, deliberately: KeycloakJwtStrategy resolves the effective role from
   * `platform.tenant_memberships` on every request (F2b), so a live session already sees the new role.
   * This keeps Keycloak's own view correct for tokens minted later, without signing everyone out.
   */
  async syncUserRole(keycloakUserId: string, realm: string, role: string): Promise<void> {
    const client = await this.getAuthenticatedClient(realm);
    const existing = await client.users.findOne({ id: keycloakUserId });
    if (!existing) {
      throw new InternalServerErrorException(
        `Keycloak user ${keycloakUserId} not found in realm ${realm}`,
      );
    }
    await client.users.update(
      { id: keycloakUserId },
      { attributes: { ...(existing.attributes ?? {}), role: [role] } },
    );
    logger.info({ keycloakUserId, realm, role }, 'keycloak.user.role_synced');
  }

  private async callTokenEndpoint(
    realm: string,
    params: URLSearchParams,
    operation: string,
  ): Promise<KeycloakTokenResponse> {
    const res = await fetch(`${this.baseUrl}/realms/${realm}/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!res.ok) {
      const body = await res.text();
      logger.warn({ realm, status: res.status, body, operation }, 'keycloak.token.failed');
      if (operation === 'refresh') {
        throw new UnauthorizedException('Refresh token invalid or expired');
      }
      // The OAuth error code travels with the exception, because the caller has to tell a REFUSAL
      // from an OUTAGE and the HTTP status cannot: Keycloak answers both `invalid_grant` (wrong
      // password, or a flow that denied this user) and a broken realm with a 4xx/5xx that reads the
      // same from here. `exchangeOtpForTokens` turns `invalid_grant` into 401 rather than 503.
      throw new KeycloakTokenError(parseOAuthError(body), `Token endpoint error (${res.status})`);
    }

    return res.json() as Promise<KeycloakTokenResponse>;
  }
}
