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

// Reset module cache between tests to clear singleton
beforeEach(() => {
  jest.resetModules();
});

describe('Schema Registry client', () => {
  it('registerSchema returns schema ID', async () => {
    const { registerSchema } = await import('../schema-registry.client.js');
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
    const { encodeAvro } = await import('../schema-registry.client.js');
    const result = await encodeAvro(42, { event_id: 'test' });
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(encodeMock).toHaveBeenCalledWith(42, { event_id: 'test' });
  });

  it('decodeAvro returns decoded object', async () => {
    const { decodeAvro } = await import('../schema-registry.client.js');
    const result = await decodeAvro(Buffer.from('data'));
    expect(result).toEqual({ event_id: 'test' });
  });
});
