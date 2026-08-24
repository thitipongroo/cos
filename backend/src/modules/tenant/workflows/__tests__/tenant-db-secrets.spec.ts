// Unit tests — dedicated-tenant DB credentials via AWS Secrets Manager (security review F4 / F9).
//
// The AWS SDK is mocked: these assert the CONTRACT this module depends on (which command is sent, what
// is done with the response, and what happens on each failure), not AWS itself. The live path is
// covered by the Phase 25 provisioning integration run.

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

const send = jest.fn();
const GetSecretValueCommand = jest.fn((input: unknown) => ({ __type: 'get', input }));
const CreateSecretCommand = jest.fn((input: unknown) => ({ __type: 'create', input }));

jest.mock(
  '@aws-sdk/client-secrets-manager',
  () => ({
    SecretsManagerClient: jest.fn().mockImplementation(() => ({ send })),
    GetSecretValueCommand,
    CreateSecretCommand,
  }),
  { virtual: true },
);

import { appUserSecretName, readMasterPassword, ensureAppUserPassword } from '../tenant-db-secrets';

/** The AWS SDK signals "no such secret" with this error name; only it may trigger a create. */
function notFound(): Error {
  const err = new Error('Secrets Manager can’t find the specified secret.');
  err.name = 'ResourceNotFoundException';
  return err;
}

const ARN = 'arn:aws:secretsmanager:ap-southeast-1:1234:secret:rds!db-abc';

describe('appUserSecretName', () => {
  it('is deterministic per environment and tenant, so provisioning is idempotent', () => {
    const original = process.env['NODE_ENV'];
    try {
      process.env['NODE_ENV'] = 'production';
      expect(appUserSecretName('acme')).toBe('cos/production/tenant-db/acme/app_user');
      expect(appUserSecretName('acme')).toBe(appUserSecretName('acme'));

      delete process.env['NODE_ENV'];
      expect(appUserSecretName('acme')).toBe('cos/prod/tenant-db/acme/app_user');
    } finally {
      if (original === undefined) delete process.env['NODE_ENV'];
      else process.env['NODE_ENV'] = original;
    }
  });
});

describe('readMasterPassword', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the password AWS generated for the managed master user', async () => {
    send.mockResolvedValueOnce({
      SecretString: JSON.stringify({ username: 'cos_admin', password: 'aws-generated' }),
    });

    await expect(readMasterPassword(ARN)).resolves.toBe('aws-generated');
    expect(GetSecretValueCommand).toHaveBeenCalledWith({ SecretId: ARN });
  });

  it('throws when the secret carries no string payload', async () => {
    send.mockResolvedValueOnce({});
    await expect(readMasterPassword(ARN)).rejects.toThrow(/no SecretString/);
  });

  it('throws when the payload has no password field', async () => {
    send.mockResolvedValueOnce({ SecretString: JSON.stringify({ username: 'cos_admin' }) });
    await expect(readMasterPassword(ARN)).rejects.toThrow(/does not contain a password/);
  });
});

describe('ensureAppUserPassword', () => {
  beforeEach(() => jest.clearAllMocks());

  // Idempotence matters concretely: Temporal retries activities, and rotating the password on a retry
  // would leave the database holding one value and the secret another.
  it('reuses an existing secret rather than rotating it', async () => {
    send.mockResolvedValueOnce({
      SecretString: JSON.stringify({ username: 'app_user', password: 'already-set' }),
    });

    await expect(ensureAppUserPassword('acme')).resolves.toBe('already-set');
    expect(CreateSecretCommand).not.toHaveBeenCalled();
  });

  it('creates the secret with a generated password when it does not exist yet', async () => {
    send.mockRejectedValueOnce(notFound()); // GetSecretValue
    send.mockResolvedValueOnce({}); // CreateSecret

    const password = await ensureAppUserPassword('acme');

    expect(CreateSecretCommand).toHaveBeenCalledTimes(1);
    const input = CreateSecretCommand.mock.calls[0]![0] as {
      Name: string;
      SecretString: string;
    };
    expect(input.Name).toBe(appUserSecretName('acme'));
    expect(JSON.parse(input.SecretString)).toEqual({ username: 'app_user', password });

    // base64url of 32 random bytes — long, and free of shell metacharacters so the URL it lands in
    // still satisfies assertShellSafeDbUrl.
    expect(password.length).toBeGreaterThanOrEqual(40);
    expect(password).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('generates a different password per tenant', async () => {
    send.mockRejectedValueOnce(notFound()).mockResolvedValueOnce({});
    const first = await ensureAppUserPassword('acme');
    send.mockRejectedValueOnce(notFound()).mockResolvedValueOnce({});
    const second = await ensureAppUserPassword('globex');
    expect(first).not.toBe(second);
  });

  // Anything other than "not found" must propagate. Treating a denied/throttled read as "absent" would
  // mint a SECOND credential and leave the database and the secret disagreeing.
  it('propagates a non-NotFound error instead of creating a second credential', async () => {
    const denied = new Error('AccessDeniedException');
    denied.name = 'AccessDeniedException';
    send.mockRejectedValueOnce(denied);

    await expect(ensureAppUserPassword('acme')).rejects.toThrow('AccessDeniedException');
    expect(CreateSecretCommand).not.toHaveBeenCalled();
  });

  it('propagates when the secret exists but has no password field', async () => {
    send.mockResolvedValueOnce({ SecretString: JSON.stringify({ username: 'app_user' }) });
    await expect(ensureAppUserPassword('acme')).rejects.toThrow(/no password field/);
    expect(CreateSecretCommand).not.toHaveBeenCalled();
  });

  it('propagates when the secret exists but carries no string payload', async () => {
    send.mockResolvedValueOnce({});
    await expect(ensureAppUserPassword('acme')).rejects.toThrow(/no password field/);
    expect(CreateSecretCommand).not.toHaveBeenCalled();
  });
});
