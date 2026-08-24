// Privacy Policy document controller tests (ADR-091).
//
// The download headers are the contract the client codes against — file name, length, and an ETag
// that IS the digest — so they are asserted rather than assumed.

import { PrivacyPolicyController } from '../privacy-policy.controller';

const PDF = {
  bytes: Buffer.from('%PDF-1.7 fake'),
  sha256: 'a'.repeat(64),
  fileName: 'COS_Privacy_Policy_v1.0.0.pdf',
  version: '1.0.0',
  effectiveDate: '2026-08-03',
};

const service = { getPdf: jest.fn().mockResolvedValue(PDF) };

/** Records the headers the handler sets. `passthrough` means the body is RETURNED, not sent here. */
function replyDouble() {
  const headers: Record<string, string> = {};
  const reply = {
    header: (name: string, value: string) => {
      headers[name] = value;
      return reply;
    },
  };
  return { reply, headers };
}

beforeEach(() => jest.clearAllMocks());

describe('PrivacyPolicyController.metadata', () => {
  it('returns what the client needs to verify the download', async () => {
    const controller = new PrivacyPolicyController(service as never);

    await expect(controller.metadata()).resolves.toEqual({
      version: '1.0.0',
      effective_date: '2026-08-03',
      file_name: 'COS_Privacy_Policy_v1.0.0.pdf',
      sha256: PDF.sha256,
      size_bytes: PDF.bytes.length,
      language: 'en',
    });
  });

  it('states the language, so a Thai reader is not left guessing', async () => {
    // pdf-lib's standard fonts carry no Thai glyphs and embedding a Thai face is an unmade licensing
    // decision — the document is English, and the API says so rather than implying otherwise.
    const { language } = await new PrivacyPolicyController(service as never).metadata();
    expect(language).toBe('en');
  });
});

describe('PrivacyPolicyController.pdf', () => {
  it('returns the bytes with the download headers', async () => {
    const { reply, headers } = replyDouble();

    const body = await new PrivacyPolicyController(service as never).pdf(reply as never);

    expect(headers['Content-Type']).toBe('application/pdf');
    expect(headers['Content-Disposition']).toBe(
      'attachment; filename="COS_Privacy_Policy_v1.0.0.pdf"',
    );
    expect(headers['Content-Length']).toBe(String(PDF.bytes.length));
    expect(body).toBe(PDF.bytes);
  });

  it('uses the content digest as the ETag', async () => {
    // So a conditional request costs nothing and a proxy cannot serve a stale edition under a new
    // version number.
    const { reply, headers } = replyDouble();

    await new PrivacyPolicyController(service as never).pdf(reply as never);

    expect(headers['ETag']).toBe(`"${PDF.sha256}"`);
  });
});
