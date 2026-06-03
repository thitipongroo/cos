// Unit tests for Schema Registry client

const registerMock = jest.fn().mockResolvedValue({ id: 42 });
const encodeMock = jest.fn().mockResolvedValue(Buffer.from('avro-encoded'));
const decodeMock = jest.fn().mockResolvedValue({ event_id: 'test' });

jest.mock('@kafkajs/confluent-schema-registry', () => ({
  SchemaRegistry: jest.fn().mockImplementation(() => ({
    register: registerMock,
    encode: encodeMock,
    decode: decodeMock,
  })),
  SchemaType: { AVRO: 'AVRO' },
}));

jest.mock('fs', () => ({
  readFileSync: jest.fn().mockReturnValue('{"type":"record","name":"Test","fields":[]}'),
}));

// Mock global fetch for ensureCompatibilityMode tests.
const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

// Reset module cache between tests to clear singleton.
// Use require() — ESM dynamic import() does not work in ts-jest CJS mode.
beforeEach(() => {
  jest.resetModules();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    text: async () => '{"compatibility":"BACKWARD_TRANSITIVE"}',
  } as Response);
});

function freshClient(): typeof import('../schema-registry.client') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../schema-registry.client') as typeof import('../schema-registry.client');
}

describe('getSchemaRegistry', () => {
  it('returns same instance on repeated calls (cache hit — line 12)', () => {
    // Do NOT reset modules here — two calls within same module instance hit the cache branch
    const { getSchemaRegistry } = freshClient();
    const r1 = getSchemaRegistry();
    const r2 = getSchemaRegistry();
    expect(r1).toBe(r2);
  });
});

describe('ensureCompatibilityMode', () => {
  it('calls PUT /config with BACKWARD_TRANSITIVE', async () => {
    const { ensureCompatibilityMode } = freshClient();
    await ensureCompatibilityMode();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8081/config',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ compatibility: 'BACKWARD_TRANSITIVE' }),
      }),
    );
  });

  it('uses SCHEMA_REGISTRY_URL env var when set', async () => {
    process.env['SCHEMA_REGISTRY_URL'] = 'http://schema-registry:8081';
    const { ensureCompatibilityMode } = freshClient();
    await ensureCompatibilityMode();
    expect(fetchMock).toHaveBeenCalledWith('http://schema-registry:8081/config', expect.anything());
    delete process.env['SCHEMA_REGISTRY_URL'];
  });

  it('throws when registry returns non-ok status', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    } as Response);
    const { ensureCompatibilityMode } = freshClient();
    await expect(ensureCompatibilityMode()).rejects.toThrow(
      'Schema Registry compatibility set failed: 500',
    );
  });
});

describe('Schema Registry client', () => {
  it('registerSchema returns schema ID', async () => {
    const { registerSchema } = freshClient();
    const id = await registerSchema(
      'construction.project.created-value',
      'construction.project.created.v1.avsc',
    );
    expect(id).toBe(42);
    expect(registerMock).toHaveBeenCalledWith(
      { type: 'AVRO', schema: '{"type":"record","name":"Test","fields":[]}' },
      { subject: 'construction.project.created-value' },
    );
  });

  it('encodeAvro returns Buffer', async () => {
    const { encodeAvro } = freshClient();
    const result = await encodeAvro(42, { event_id: 'test' });
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(encodeMock).toHaveBeenCalledWith(42, { event_id: 'test' });
  });

  it('decodeAvro returns decoded object', async () => {
    const { decodeAvro } = freshClient();
    const result = await decodeAvro(Buffer.from('data'));
    expect(result).toEqual({ event_id: 'test' });
  });
});
