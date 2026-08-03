// Encryption at rest for platform.tenants.dedicated_db_url (security review F5b).
//
// The column stores a complete PostgreSQL connection string — host, user AND password — for every
// ENTERPRISE tenant. It was written in plaintext, while this same codebase already encrypts TOTP seeds
// with AES-256-GCM (shared/crypto/secret-cipher.ts) for exactly the reason that applies here: read
// access to the database alone should not yield a usable credential.
//
// FORMAT AND MIGRATION
// --------------------
// Ciphertext is `iv:authTag:ciphertext`, all hex (secret-cipher.ts). A stored value is therefore
// recognisable: a plaintext URL always starts `postgres://` or `postgresql://`, and ciphertext never
// can. `decryptDedicatedDbUrl` accepts BOTH, so rows written before this shipped keep working with no
// backfill — the QM-9 backward-compatible path. Nothing rewrites existing rows; they convert naturally
// the next time provisioning writes them.
//
// ROLLOUT
// -------
// Writing encrypted is gated on the `s1.tenant.encrypted-db-url` flag (QM-15). Reading is NOT gated:
// the read side must always understand both formats, otherwise turning the flag off would strand rows
// written while it was on. That asymmetry is the point — the flag is a kill switch for NEW writes, and
// it stays safe to flip in either direction at any time.

import { createLogger } from '@cos/logger';
import { encryptSecret, decryptSecret } from '../../../shared/crypto/secret-cipher';

const logger = createLogger('dedicated-db-url-cipher');

/** QM-15 flag governing whether NEW writes are encrypted. Registered in DEFAULT_FLAGS. */
export const ENCRYPTED_DB_URL_FLAG = 's1.tenant.encrypted-db-url';

/** True when `stored` is a plaintext connection string rather than a ciphertext blob. */
function isPlaintextUrl(stored: string): boolean {
  return stored.startsWith('postgres://') || stored.startsWith('postgresql://');
}

/**
 * Encrypt a dedicated-DB URL for storage when `enabled`, otherwise return it unchanged.
 *
 * The caller supplies the flag decision rather than this module resolving it, because the two write
 * paths obtain it differently: the API process injects FeatureFlagService through Nest DI, while the
 * Temporal worker (a standalone process with no DI container) constructs one directly.
 */
export function encryptDedicatedDbUrl(url: string, enabled: boolean): string {
  if (!enabled) return url;
  return encryptSecret(url);
}

/**
 * Decrypt a stored dedicated-DB URL, passing plaintext through untouched.
 *
 * Throws on a value that is neither — a blob that fails GCM authentication means the row was written
 * under a different APP_SECRET_ENCRYPTION_KEY, and routing tenant queries at a URL we cannot verify is
 * exactly the failure this column must not have. Fail loudly; do not fall back to the shared database.
 */
export function decryptDedicatedDbUrl(stored: string): string {
  if (isPlaintextUrl(stored)) return stored;
  try {
    return decryptSecret(stored);
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      'tenant.dedicated_db_url.decrypt_failed — wrong APP_SECRET_ENCRYPTION_KEY or corrupt value',
    );
    throw new Error(
      'Stored dedicated_db_url could not be decrypted — check APP_SECRET_ENCRYPTION_KEY',
    );
  }
}
