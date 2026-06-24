// Minimal JWT payload decoder (no verification — server already verified on issue).
// Used to read the `user_id` / `role` / `tenant_id` claims from the Keycloak access token
// returned by POST /auth/otp/verify, since the token endpoint returns only the token strings.

export function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length < 2 || !parts[1]) return {};

  const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);

  const atobFn = (globalThis as { atob?: (input: string) => string }).atob;
  if (!atobFn) return {};

  try {
    return JSON.parse(atobFn(padded)) as Record<string, unknown>;
  } catch {
    return {};
  }
}
