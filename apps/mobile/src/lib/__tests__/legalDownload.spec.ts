// Legal-document download verification tests (Privacy Policy — ADR-091; Terms of Use — ADR-092).
//
// The assertion that matters is the one that nearly shipped wrong: the client digest must be of the
// FILE'S BYTES, not of the base64 text the file was read as. `Crypto.digestStringAsync` over the
// base64 would return a hash that can never equal the server's, so `verified` would read false on a
// good download — and a check that always fails teaches the reader to ignore it. The first test below
// pins that with a KNOWN vector rather than by round-tripping our own implementation.
//
// The two documents share one implementation, so the verification behaviour is exercised once
// (through the policy) and the terms tests assert what is genuinely different: the routes it calls
// and the file it writes.

const cryptoMock = { digest: jest.fn() };
const fsMock = {
  documentDirectory: '/mock/documents/',
  downloadAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  getInfoAsync: jest.fn(),
  EncodingType: { Base64: 'base64' },
};
const apiMock = { get: jest.fn() };

jest.mock('expo-crypto', () => ({
  ...cryptoMock,
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { HEX: 'hex' },
}));
jest.mock('expo-file-system/legacy', () => fsMock);
jest.mock('../../api/client', () => ({ apiClient: apiMock }));

import { createHash } from 'node:crypto';
import { downloadPolicy, downloadTerms, policyPdfUrl, termsPdfUrl } from '../legalDownload';

/** The real bytes behind the base64 the file read returns. */
const FILE_BYTES = Buffer.from('%PDF-1.7 pretend policy document');
const FILE_BASE64 = FILE_BYTES.toString('base64');
const TRUE_DIGEST = createHash('sha256').update(FILE_BYTES).digest('hex');

const META = {
  version: '1.0.0',
  effective_date: '2026-08-03',
  file_name: 'COS_Privacy_Policy_v1.0.0.pdf',
  sha256: TRUE_DIGEST,
  size_bytes: FILE_BYTES.length,
  language: 'en',
};

const TERMS_META = {
  ...META,
  effective_date: '2026-08-09',
  file_name: 'COS_Terms_of_Use_v1.0.0.pdf',
};

const BASE = 'http://localhost:3000/api/v1';

beforeEach(() => {
  jest.clearAllMocks();
  apiMock.get.mockResolvedValue({ data: META });
  fsMock.downloadAsync.mockResolvedValue({ status: 200 });
  fsMock.readAsStringAsync.mockResolvedValue(FILE_BASE64);
  fsMock.getInfoAsync.mockResolvedValue({ exists: true, size: FILE_BYTES.length });
  // Stand in for the native module with Node's own SHA-256 over whatever bytes it is handed. If the
  // implementation ever hashes the base64 TEXT again, this returns a different digest and `verified`
  // goes false — which is exactly the regression this file exists to catch.
  cryptoMock.digest.mockImplementation(
    async (_algorithm: string, data: Uint8Array) =>
      createHash('sha256').update(Buffer.from(data)).digest().buffer,
  );
});

describe('pdf urls', () => {
  it.each([
    ['http://localhost:3000/api/v1', 'http://localhost:3000/api/v1/privacy/policy/pdf'],
    ['http://localhost:3000/api/v1/', 'http://localhost:3000/api/v1/privacy/policy/pdf'],
  ])('builds the policy url from %s without doubling the slash', (base, expected) => {
    expect(policyPdfUrl(base)).toBe(expected);
  });

  it.each([
    ['http://localhost:3000/api/v1', 'http://localhost:3000/api/v1/terms/pdf'],
    ['http://localhost:3000/api/v1/', 'http://localhost:3000/api/v1/terms/pdf'],
  ])('builds the terms url from %s without doubling the slash', (base, expected) => {
    expect(termsPdfUrl(base)).toBe(expected);
  });
});

describe('downloadPolicy', () => {
  it('hashes the FILE BYTES, so a good download verifies', async () => {
    const result = await downloadPolicy(BASE);

    expect(result.sha256).toBe(TRUE_DIGEST);
    expect(result.verified).toBe(true);
  });

  it('hands the decoded bytes to the digest, not the base64 text', async () => {
    await downloadPolicy(BASE);

    const [, data] = cryptoMock.digest.mock.calls[0] as [string, Uint8Array];
    expect(Buffer.from(data).equals(FILE_BYTES)).toBe(true);
  });

  it('reads the published metadata before transferring anything', async () => {
    await downloadPolicy(BASE);

    expect(apiMock.get).toHaveBeenCalledWith('/privacy/policy/metadata');
  });

  it('downloads to the document directory under the published file name', async () => {
    const result = await downloadPolicy(BASE);

    expect(fsMock.downloadAsync).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/privacy/policy/pdf',
      '/mock/documents/COS_Privacy_Policy_v1.0.0.pdf',
    );
    expect(result.uri).toBe('/mock/documents/COS_Privacy_Policy_v1.0.0.pdf');
    expect(result.fileName).toBe(META.file_name);
    expect(result.version).toBe(META.version);
  });

  it('reports verified:false when the bytes do not match what was published', async () => {
    apiMock.get.mockResolvedValue({ data: { ...META, sha256: 'f'.repeat(64) } });

    const result = await downloadPolicy(BASE);

    // Kept, not thrown away: a reader handed the wrong file is better served by a screen that says
    // so with the document still on disk than by an error that deletes the evidence.
    expect(result.verified).toBe(false);
    expect(result.uri).toBe('/mock/documents/COS_Privacy_Policy_v1.0.0.pdf');
  });

  it('compares digests case-insensitively', async () => {
    apiMock.get.mockResolvedValue({ data: { ...META, sha256: TRUE_DIGEST.toUpperCase() } });

    await expect(downloadPolicy(BASE)).resolves.toMatchObject({ verified: true });
  });

  it('uses the on-disk size when the file system reports one', async () => {
    fsMock.getInfoAsync.mockResolvedValue({ exists: true, size: 4242 });

    await expect(downloadPolicy(BASE)).resolves.toMatchObject({ sizeBytes: 4242 });
  });

  it.each([
    ['the entry does not exist', { exists: false }],
    ['the entry carries no size', { exists: true }],
  ])('falls back to the published size when %s', async (_label, info) => {
    fsMock.getInfoAsync.mockResolvedValue(info);

    // Not 0 — "0 B" on the screen reads as an empty file rather than as an unknown size.
    await expect(downloadPolicy(BASE)).resolves.toMatchObject({ sizeBytes: META.size_bytes });
  });

  it('stamps when the download happened', async () => {
    const result = await downloadPolicy(BASE);

    expect(Number.isNaN(Date.parse(result.downloadedAt))).toBe(false);
  });
});

describe('downloadTerms', () => {
  beforeEach(() => apiMock.get.mockResolvedValue({ data: TERMS_META }));

  it('reads the terms metadata and transfers the terms PDF', async () => {
    // The routes are the whole difference between the two documents, and getting them crossed would
    // hand a reader the policy under the terms' name with a digest that still verified.
    const result = await downloadTerms(BASE);

    expect(apiMock.get).toHaveBeenCalledWith('/terms/metadata');
    expect(fsMock.downloadAsync).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/terms/pdf',
      '/mock/documents/COS_Terms_of_Use_v1.0.0.pdf',
    );
    expect(result.fileName).toBe(TERMS_META.file_name);
    expect(result.uri).toBe('/mock/documents/COS_Terms_of_Use_v1.0.0.pdf');
  });

  it('verifies the terms bytes against the published digest', async () => {
    const result = await downloadTerms(BASE);

    expect(result.sha256).toBe(TRUE_DIGEST);
    expect(result.verified).toBe(true);
  });

  it('reports a mismatch rather than throwing', async () => {
    apiMock.get.mockResolvedValue({ data: { ...TERMS_META, sha256: 'f'.repeat(64) } });

    await expect(downloadTerms(BASE)).resolves.toMatchObject({ verified: false });
  });
});
