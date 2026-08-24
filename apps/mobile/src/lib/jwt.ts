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
    return JSON.parse(utf8(atobFn(padded))) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Reinterpret `atob`'s output as UTF-8.
 *
 * `atob` returns a "binary string": one character per BYTE, each in 0..255. JSON.parse on that reads
 * every byte as a code point, so anything outside ASCII comes back as mojibake — a JWT `name` claim
 * of "สมชาย" decoded to "à¸ªà¸¡à¸Šà¸²à¸¢". That is not an edge case for this product: the tenants are
 * Thai, the claim feeds the header avatar's initials and the display name, and the corruption is
 * silent — a wrong name renders exactly as confidently as a right one.
 *
 * Percent-encoding each byte and handing the result to `decodeURIComponent` is the decode, using only
 * globals Hermes is guaranteed to have. `TextDecoder` would be the direct expression of this and is
 * not dependable on Hermes without a polyfill this app does not install.
 *
 * A byte sequence that is not valid UTF-8 makes `decodeURIComponent` throw; the raw string is
 * returned in that case, which is exactly what the old code always did.
 */
function utf8(binary: string): string {
  try {
    let encoded = '';
    for (let i = 0; i < binary.length; i++) {
      encoded += '%' + binary.charCodeAt(i).toString(16).padStart(2, '0');
    }
    return decodeURIComponent(encoded);
  } catch {
    return binary;
  }
}
