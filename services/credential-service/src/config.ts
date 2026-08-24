// CredentialService — typed environment config (ADR-019).
// Values injected at runtime via AWS Secrets Manager / Vault (QM-4).
export interface CredentialServiceConfig {
  port: number;
  nodeEnv: string;
  database: { url: string };
  // did:web issuer base domain, e.g. "cos.example.com" → did:web:cos.example.com:tenants:<tenantId>
  issuer: { didWebBaseDomain: string };
}

export function loadConfig(): CredentialServiceConfig {
  return {
    port: Number(process.env.PORT ?? 3009),
    nodeEnv: process.env.NODE_ENV ?? 'development',
    database: { url: process.env.DATABASE_URL ?? '' },
    issuer: { didWebBaseDomain: process.env.DID_WEB_BASE_DOMAIN ?? '' },
  };
}
