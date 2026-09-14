export interface ErrorEnvelope {
  error: { code: string; message: string; traceId: string; timestamp: string };
}

const ERRORS = {
  MISSING_TENANT_HEADER: 'Missing tenant/user identity headers',
  FORBIDDEN: 'Insufficient role for this action',
  ISSUER_NOT_FOUND: 'No issuer DID document exists for this tenant',
  VC_NOT_FOUND: 'Verifiable credential not found or already revoked',
  INVALID_REQUEST: 'Invalid request body',
  STATUS_LIST_NOT_FOUND: 'No status list exists at this URL',
  INVALID_TOKEN: 'Invalid or expired authentication token',
  // ADR-107: the backend could not confirm a user's identity; the token's claims are never used instead.
  IDENTITY_UNAVAILABLE: 'Identity could not be verified right now — try again',
} as const;

export type ErrorKey = keyof typeof ERRORS;

export function buildError(key: ErrorKey, traceId: string): ErrorEnvelope {
  return {
    error: { code: key, message: ERRORS[key], traceId, timestamp: new Date().toISOString() },
  };
}
