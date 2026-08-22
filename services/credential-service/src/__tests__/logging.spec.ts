// TDD OQ-46 — these requests now carry the credential the backend actually sends: a bearer token for
// the `cos-backend` service account, with the principal in the identity headers. They used to send
// headers alone, which registerAuth honoured; that was the hole. verifyBearer is mocked because this
// suite tests routes, not JWKS.
// What the routes are allowed to log (QM-8 + §5.9.8 Information Disclosure). The service handles
// issuer private keys, signed credentials and subject claims, so this asserts the *contents* of every
// log call: an allowlist of id/enum/boolean fields, and nothing that appears in the credential itself.
// The logger module is substituted so the assertions run on the arguments, not on captured stdout.
import { jest } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Pool } from 'pg';

const mockVerifyBearer = jest.fn<(h: unknown) => Promise<unknown>>();
jest.unstable_mockModule('../plugins/jwt-verify.js', () => ({
  verifyBearer: mockVerifyBearer,
  InvalidTokenError: class InvalidTokenError extends Error {},
}));
mockVerifyBearer.mockResolvedValue({ kind: 'service', clientId: 'cos-backend' });

/** The backend's service token — every authenticated request in this file carries it. */
const SERVICE_AUTH = { authorization: 'Bearer service-token' };

interface LogCall {
  ctx: Record<string, unknown>;
  event: string;
}
const calls: LogCall[] = [];
const record = (ctx: Record<string, unknown>, event: string): void => {
  calls.push({ ctx, event });
};

jest.unstable_mockModule('../logger.js', () => ({
  createLogger: () => ({ info: record, warn: record, error: record, debug: record }),
}));

const { credentialRoutes } = await import('../routes/credentials.routes.js');
const { registerTrace } = await import('../plugins/trace.js');
const { registerAuth } = await import('../plugins/auth.js');

const ADMIN = {
  ...SERVICE_AUTH,
  'x-tenant-id': 't1',
  'x-user-id': 'u1',
  'x-user-role': 'TENANT_ADMIN',
};
const CONFIG = {
  port: 0,
  nodeEnv: 'test',
  database: { url: '' },
  issuer: { didWebBaseDomain: 'cos.dev' },
};

/** Same in-memory `credentials` schema stand-in as credentials.routes.spec.ts. */
function fakePool() {
  const statusLists = new Map<
    string,
    { next_index: number; capacity: number; encoded_list: string }
  >();
  const query = jest.fn(async (sql: unknown, params: unknown[] = []) => {
    const s = String(sql);
    if (s.includes('SELECT did')) return { rows: [] };
    if (s.includes('INSERT INTO credentials.revocation_status_lists')) {
      statusLists.set(params[0] as string, {
        next_index: 0,
        capacity: params[4] as number,
        encoded_list: params[3] as string, // keep the real bitstring — revoke decodes it
      });
      return { rows: [] };
    }
    if (s.includes('FROM credentials.revocation_status_lists')) {
      const [id, row] = [...statusLists.entries()][0] ?? [];
      return {
        rows: row
          ? [
              {
                status_list_id: id,
                encoded_list: row.encoded_list,
                capacity: row.capacity,
                next_index: row.next_index,
                version: 1,
                status_list_credential: {},
              },
            ]
          : [],
      };
    }
    if (s.includes('UPDATE credentials.revocation_status_lists')) {
      const row = statusLists.get(params[1] as string);
      if (row && s.includes('next_index = next_index + 1')) {
        row.next_index += 1;
        return { rows: [{ allocated_index: row.next_index - 1 }] };
      }
      if (row) row.encoded_list = params[2] as string; // republished list
      return { rows: [] };
    }
    if (s.includes('INSERT INTO credentials.verifiable_credentials'))
      return { rows: [{ vc_id: 'vc-1' }] };
    if (s.includes('UPDATE credentials.verifiable_credentials')) {
      const first = [...statusLists.keys()][0];
      return { rows: [{ status_list_id: first ?? null, status_list_index: first ? 0 : null }] };
    }
    return { rows: [] };
  });
  return { connect: jest.fn(async () => ({ query, release: jest.fn() })) } as unknown as Pool;
}

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  app.decorate('pool', fakePool());
  app.decorate('config', CONFIG);
  registerTrace(app);
  registerAuth(app);
  await credentialRoutes(app);
  await app.ready();
  return app;
}

// Everything a log line may carry. Anything else is a regression that must be reviewed.
const ALLOWED_FIELDS = new Set([
  'tenantId',
  'userId',
  'traceId',
  'vcId',
  'credentialType',
  'revocable',
  'statusListId',
  'published',
  'verified',
  'revoked',
]);

// Substrings that must never reach a log line, in any field.
const FORBIDDEN = [
  'z6Mk', // Ed25519 multibase public/private key
  'proof',
  'privateKey',
  'encryptedPrivateKey',
  'credentialSubject',
  'encodedList',
  'licenceNumber', // a subject claim (PII)
];

describe('route logging (QM-8 / §5.9.8)', () => {
  let app: FastifyInstance;
  let issued: Record<string, unknown>;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    delete process.env.APP_SECRET_ENCRYPTION_KEY;
    calls.length = 0;
    app = await buildApp();

    const issue = await app.inject({
      method: 'POST',
      url: '/credentials/issue',
      headers: ADMIN,
      payload: {
        credentialType: 'LICENCE',
        subjectId: 'did:example:worker',
        claims: { licenceNumber: 'L-SECRET-1' },
      },
    });
    issued = issue.json().credential;
    await app.inject({ method: 'POST', url: '/credentials/vc-1/revoke', headers: ADMIN });
    await app.inject({
      method: 'POST',
      url: '/credentials/verify',
      headers: ADMIN,
      payload: { credential: issued },
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  it('logs one event per state change, named by domain not by HTTP', () => {
    expect(calls.map((c) => c.event)).toEqual([
      'credential.issued',
      'credential.revoked',
      'credential.verified',
    ]);
  });

  it('carries the correlation fields needed to trace a credential to its actor', () => {
    const issue = calls[0]!.ctx;
    expect(issue.tenantId).toBe('t1');
    expect(issue.userId).toBe('u1');
    expect(issue.vcId).toBe('vc-1');
    expect(issue.credentialType).toBe('LICENCE');
    expect(issue.revocable).toBe(true);
    expect(typeof issue.traceId).toBe('string');
  });

  it('logs no field outside the allowlist', () => {
    const unexpected = calls
      .flatMap((c) => Object.keys(c.ctx))
      .filter((k) => !ALLOWED_FIELDS.has(k));
    expect(unexpected).toEqual([]);
  });

  it('never logs key material, proofs, claims or credential bodies', () => {
    const serialised = JSON.stringify(calls);
    for (const needle of FORBIDDEN) {
      expect(serialised).not.toContain(needle);
    }
    // Nothing from the signed credential — including the subject claim — leaks into a log line.
    expect(serialised).not.toContain('L-SECRET-1');
    expect(serialised).not.toContain(
      (issued.proof as { verificationMethod: string }).verificationMethod,
    );
  });
});
