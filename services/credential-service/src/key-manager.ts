// Ed25519 key management (ADR-019). Issuer = persistent: private key AES-256-GCM encrypted (ADR-035)
// and stored in credentials.did_documents.encrypted_private_key. Signer (contract signing) = ephemeral:
// generated per signing and never stored. @digitalbazaar is ESM — imported dynamically.
import { encryptSecret, decryptSecret } from './secret-cipher.js';

export interface IssuerKeyMaterial {
  publicKeyMultibase: string;
  encryptedPrivateKey: string;
}

export interface EphemeralSignerKey {
  publicKeyMultibase: string;
  privateKeyMultibase: string; // used then discarded — never persisted
}

async function Ed25519Key(): Promise<{
  generate: () => Promise<{ publicKeyMultibase: string; privateKeyMultibase: string }>;
}> {
  const mod = await import('@digitalbazaar/ed25519-verification-key-2020');
  return mod.Ed25519VerificationKey2020;
}

/** Generate a persistent issuer key; the private key is returned already encrypted (ADR-035). */
export async function generateIssuerKey(): Promise<IssuerKeyMaterial> {
  const key = await (await Ed25519Key()).generate();
  return {
    publicKeyMultibase: key.publicKeyMultibase,
    encryptedPrivateKey: encryptSecret(key.privateKeyMultibase),
  };
}

/** Generate an ephemeral signer key (contract signing) — caller uses it then discards it. */
export async function generateEphemeralSignerKey(): Promise<EphemeralSignerKey> {
  const key = await (await Ed25519Key()).generate();
  return {
    publicKeyMultibase: key.publicKeyMultibase,
    privateKeyMultibase: key.privateKeyMultibase,
  };
}

/** Decrypt a stored issuer private key for signing. */
export function decryptIssuerPrivateKey(encryptedPrivateKey: string): string {
  return decryptSecret(encryptedPrivateKey);
}
