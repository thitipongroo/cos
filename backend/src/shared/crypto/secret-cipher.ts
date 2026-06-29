// AES-256-GCM application-layer encryption for secrets stored at rest (defense-in-depth above
// DB SSE-KMS). Used for TOTP MFA seeds (platform.users.mfa_totp_secret) so that read access to the
// database alone does not leak a usable MFA seed. Key is injected via AWS Secrets Manager / Vault
// in production (QM-4); a fixed dev key is used only when NODE_ENV !== 'production'.

// node:crypto builtin — loaded via require() (the in-repo idiom for builtins, cf.
// platform-webhook.service.ts) so it resolves under CommonJS without a package.json dep.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nodeCrypto = require('crypto') as typeof import('crypto');
const { createCipheriv, createDecipheriv, randomBytes } = nodeCrypto;

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // GCM standard nonce length
const KEY_BYTES = 32; // AES-256
// Dev-only placeholder key (64 hex chars = 32 bytes). Production MUST set APP_SECRET_ENCRYPTION_KEY.
const DEV_KEY_HEX = '0'.repeat(KEY_BYTES * 2);

function resolveKey(): Buffer {
  const hex = process.env['APP_SECRET_ENCRYPTION_KEY'];
  if (!hex) {
    if (process.env['NODE_ENV'] === 'production') {
      throw new Error('APP_SECRET_ENCRYPTION_KEY must be set in production');
    }
    return Buffer.from(DEV_KEY_HEX, 'hex');
  }
  const key = Buffer.from(hex, 'hex');
  if (key.length !== KEY_BYTES) {
    throw new Error('APP_SECRET_ENCRYPTION_KEY must be 32 bytes (64 hex chars)');
  }
  return key;
}

/** Encrypt a UTF-8 secret. Returns `iv:authTag:ciphertext`, all hex-encoded. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, resolveKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
}

/** Decrypt a value produced by {@link encryptSecret}. Throws on a malformed or tampered blob. */
export function decryptSecret(blob: string): string {
  const parts = blob.split(':');
  if (parts.length !== 3) {
    throw new Error('Malformed encrypted secret');
  }
  const [ivHex, tagHex, dataHex] = parts;
  const decipher = createDecipheriv(ALGORITHM, resolveKey(), Buffer.from(ivHex!, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex!, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(dataHex!, 'hex')), decipher.final()]).toString(
    'utf8',
  );
}
