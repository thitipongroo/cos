/**
 * next-auth (Auth.js v4) configuration for the Construction OS web client.
 *
 * Auth model (no new mechanism — spec §20.6 / master Phase 2):
 *   - Path B (office/management): Keycloak OIDC (OAuth2), RS256 JWT.
 *   - Path A (field roles on tablet): phone + SMS OTP → custom OTP module →
 *     Keycloak Direct Grant, surfaced here as a Credentials provider that calls
 *     the backend `/auth/otp/verify` endpoint.
 *
 * The backend is the single source of truth for identity and JWT signing; this
 * layer only brokers the browser session. Tenant/role claims are read from the
 * backend-issued JWT — never minted here.
 */
import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import KeycloakProvider from 'next-auth/providers/keycloak';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

interface BackendTokens {
  access_token: string;
  refresh_token: string;
}

interface AccessClaims {
  sub: string;
  user_id: string;
  tenant_id: string;
  role: string;
  exp: number;
}

/** Decode a JWT payload without verifying — signature is verified server-side on every API call. */
export function decodeAccessToken(token: string): AccessClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }
  try {
    const json = Buffer.from(parts[1], 'base64').toString('utf8');
    const claims = JSON.parse(json) as Partial<AccessClaims>;
    if (!claims.sub || !claims.user_id || !claims.tenant_id || !claims.role || !claims.exp) {
      return null;
    }
    return claims as AccessClaims;
  } catch {
    return null;
  }
}

/** Exchange a refresh token for a fresh access token via the backend (rotation per §5.4). */
async function refreshBackendToken(refreshToken: string): Promise<BackendTokens | null> {
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) {
    return null;
  }
  return (await res.json()) as BackendTokens;
}

export const authOptions: NextAuthOptions = {
  providers: [
    // Path B — Keycloak OIDC for office/management roles. `cos-web` is a PUBLIC client
    // (publicClient: true in the realm) using PKCE with no client secret, so the token
    // endpoint auth method is 'none' and PKCE is enforced.
    KeycloakProvider({
      clientId: process.env.KEYCLOAK_WEB_CLIENT_ID ?? 'cos-web',
      clientSecret: process.env.KEYCLOAK_WEB_CLIENT_SECRET ?? '',
      issuer: process.env.KEYCLOAK_ISSUER ?? '',
      client: { token_endpoint_auth_method: 'none' },
      checks: ['pkce', 'state'],
    }),

    // Path A — phone + SMS OTP for field roles. The browser first calls
    // POST /auth/otp/request (page action), then submits {phoneNumber, otp} here.
    CredentialsProvider({
      id: 'otp',
      name: 'SMS OTP',
      credentials: {
        phoneNumber: { label: 'Phone', type: 'tel' },
        otp: { label: 'OTP', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.phoneNumber || !credentials?.otp) {
          return null;
        }
        const res = await fetch(`${API_BASE}/auth/otp/verify`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            phoneNumber: credentials.phoneNumber,
            otp: credentials.otp,
          }),
        });
        if (!res.ok) {
          return null;
        }
        const tokens = (await res.json()) as BackendTokens;
        const claims = decodeAccessToken(tokens.access_token);
        if (!claims) {
          return null;
        }
        return {
          id: claims.user_id,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          role: claims.role,
          tenantId: claims.tenant_id,
          accessTokenExpires: claims.exp * 1000,
        };
      },
    }),
  ],

  session: {
    strategy: 'jwt',
    // Refresh-token lifetime (7 days) per §5.4; access token is rotated below.
    maxAge: 7 * 24 * 60 * 60,
  },

  pages: {
    signIn: '/login',
  },

  callbacks: {
    async jwt({ token, user, account }) {
      // Initial sign-in.
      if (user) {
        token.accessToken = user.accessToken;
        token.refreshToken = user.refreshToken;
        token.userId = user.id;
        token.role = user.role;
        token.tenantId = user.tenantId;
        token.accessTokenExpires = user.accessTokenExpires;
        return token;
      }
      // Keycloak OIDC sign-in carries tokens on `account`.
      if (account?.access_token) {
        const claims = decodeAccessToken(account.access_token);
        if (claims) {
          token.accessToken = account.access_token;
          token.refreshToken = account.refresh_token ?? '';
          token.idToken = account.id_token;
          token.userId = claims.user_id;
          token.role = claims.role;
          token.tenantId = claims.tenant_id;
          token.accessTokenExpires = claims.exp * 1000;
        }
        return token;
      }
      // Still valid — reuse.
      if (token.accessTokenExpires && Date.now() < token.accessTokenExpires - 30_000) {
        return token;
      }
      // Expired — rotate via backend.
      if (token.refreshToken) {
        const refreshed = await refreshBackendToken(token.refreshToken);
        if (refreshed) {
          const claims = decodeAccessToken(refreshed.access_token);
          token.accessToken = refreshed.access_token;
          token.refreshToken = refreshed.refresh_token;
          if (claims) {
            token.accessTokenExpires = claims.exp * 1000;
            token.role = claims.role;
            token.tenantId = claims.tenant_id;
          }
          return token;
        }
      }
      token.error = 'RefreshAccessTokenError';
      return token;
    },

    async session({ session, token }) {
      session.accessToken = token.accessToken;
      session.error = token.error;
      if (session.user) {
        session.user.id = token.userId;
        session.user.role = token.role;
        session.user.tenantId = token.tenantId;
      }
      return session;
    },
  },

  events: {
    // Keycloak RP-initiated logout (§20.6.1) — invalidate the Keycloak SSO
    // session server-side. OTP sessions have no id_token and are skipped.
    async signOut({ token }) {
      const issuer = process.env.KEYCLOAK_ISSUER;
      if (token.idToken && issuer) {
        const url = `${issuer}/protocol/openid-connect/logout?id_token_hint=${token.idToken}`;
        await fetch(url).catch(() => undefined);
      }
    },
  },
};
