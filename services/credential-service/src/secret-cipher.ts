// AES-256-GCM application-layer encryption for secrets stored at rest (ADR-035; ESM port of
// backend/src/shared/crypto/secret-cipher.ts). Used to encrypt the per-tenant issuer Ed25519 private
// key before it is stored in credentials.did_documents.encrypted_private_key. The master key is
// injected via env APP_SECRET_ENCRYPTION_KEY (AWS Secrets Manager / Vault, QM-4); a fixed dev key is
// used only when NODE_ENV !== 'production'.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // GCM standard nonce
const KEY_BYTES = 32; // AES-256
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
  const [ivHex, tagHex, ctHex] = parts;
  const decipher = createDecipheriv(ALGORITHM, resolveKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(ctHex, 'hex')), decipher.final()]).toString(
    'utf8',
  );
}
