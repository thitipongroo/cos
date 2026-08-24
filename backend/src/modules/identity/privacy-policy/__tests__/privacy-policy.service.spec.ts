// Privacy Policy PDF tests (ADR-091).
//
// The properties worth protecting are the ones the DOWNLOAD SCREEN's claims rest on:
//   - the bytes are DETERMINISTIC. The screen shows a SHA-256 and the client recomputes it over what
//     it received; that comparison means nothing if the same document hashes differently each time.
//     pdf-lib stamps CreationDate/ModDate from the clock by default, so this is a real regression
//     risk rather than a theoretical one.
//   - the digest is of the bytes actually served, not of anything else
//   - the document is built once, not per request
//   - the DPO address is configuration, and its absence is stated rather than printed blank
//   - long paragraphs wrap on MEASURED width, not on a character count

import { PDFDocument } from 'pdf-lib';
import { createHash } from 'node:crypto';
import { PrivacyPolicyService, wrapLine } from '../privacy-policy.service';
import { POLICY_DOCUMENT, POLICY_VERSION, POLICY_EFFECTIVE_DATE } from '../policy-document';

const ORIGINAL_DPO = process.env['DPO_EMAIL'];

afterEach(() => {
  if (ORIGINAL_DPO === undefined) delete process.env['DPO_EMAIL'];
  else process.env['DPO_EMAIL'] = ORIGINAL_DPO;
});

describe('PrivacyPolicyService', () => {
  it('produces byte-identical output across separate instances', async () => {
    // Separate instances, so the cache cannot be what makes them equal — this is the determinism
    // assertion, and it is the one the download screen's integrity check depends on.
    const a = await new PrivacyPolicyService().getPdf();
    const b = await new PrivacyPolicyService().getPdf();

    expect(a.bytes.equals(b.bytes)).toBe(true);
    expect(a.sha256).toBe(b.sha256);
  });

  it('pins the PDF timestamps to the effective date rather than the clock', async () => {
    // `updateMetadata: false` on the LOAD, and it is not optional. pdf-lib's default is `true`, which
    // runs updateInfoDict() on the parsed document and stamps ModDate with the current time — so a
    // naive load reports "now" for a file whose bytes say otherwise, and the first version of this
    // test failed against a service that was already correct. Verified empirically: the saved bytes
    // carry the pinned date under both settings; only the reader differs.
    const { bytes } = await new PrivacyPolicyService().getPdf();
    const parsed = await PDFDocument.load(bytes, { updateMetadata: false });

    const expected = new Date(`${POLICY_EFFECTIVE_DATE}T00:00:00.000Z`);
    expect(parsed.getCreationDate()?.toISOString()).toBe(expected.toISOString());
    expect(parsed.getModificationDate()?.toISOString()).toBe(expected.toISOString());
  });

  it('reports a digest of the bytes it returns', async () => {
    const pdf = await new PrivacyPolicyService().getPdf();

    expect(pdf.sha256).toBe(createHash('sha256').update(pdf.bytes).digest('hex'));
  });

  it('names the file after the version, so two editions cannot collide on disk', async () => {
    const pdf = await new PrivacyPolicyService().getPdf();

    expect(pdf.fileName).toBe(`COS_Privacy_Policy_v${POLICY_VERSION}.pdf`);
    expect(pdf.version).toBe(POLICY_VERSION);
    expect(pdf.effectiveDate).toBe(POLICY_EFFECTIVE_DATE);
  });

  it('builds once and serves the cache afterwards', async () => {
    const service = new PrivacyPolicyService();
    const first = await service.getPdf();
    const second = await service.getPdf();

    // Same object, not merely equal: a rebuild would produce a new Buffer with the same contents and
    // pass an equality check while burning CPU on every download.
    expect(second).toBe(first);
  });

  it('is a real, parseable PDF carrying the policy title', async () => {
    const { bytes } = await new PrivacyPolicyService().getPdf();
    const parsed = await PDFDocument.load(bytes);

    expect(parsed.getPageCount()).toBeGreaterThan(0);
    expect(parsed.getTitle()).toContain(POLICY_VERSION);
    expect(parsed.getAuthor()).toBe(POLICY_DOCUMENT.brandName);
  });

  it('prints the configured DPO address', async () => {
    process.env['DPO_EMAIL'] = 'dpo@example.test';
    const withAddress = await new PrivacyPolicyService().getPdf();

    delete process.env['DPO_EMAIL'];
    const without = await new PrivacyPolicyService().getPdf();

    // Different bytes is the observable difference: pdf-lib compresses the content stream, so the
    // address is not greppable in the output, but a document that ignored the variable would be
    // byte-identical either way.
    expect(withAddress.bytes.equals(without.bytes)).toBe(false);
  });

  it.each([
    ['unset', undefined],
    ['empty', ''],
    ['whitespace', '   '],
  ])('treats a %s DPO address as not published', async (_label, value) => {
    if (value === undefined) delete process.env['DPO_EMAIL'];
    else process.env['DPO_EMAIL'] = value;
    const absent = await new PrivacyPolicyService().getPdf();

    delete process.env['DPO_EMAIL'];
    const baseline = await new PrivacyPolicyService().getPdf();

    // All three render the same "not yet published" line, so all three are byte-identical.
    expect(absent.bytes.equals(baseline.bytes)).toBe(true);
  });
});

describe('wrapLine', () => {
  // A stub font: 10 width-units per character at size 1, so the arithmetic in the assertions is
  // obvious. The real Helvetica is proportional, which is the whole reason the production code
  // measures rather than counts.
  const font = {
    widthOfTextAtSize: (text: string, size: number) => text.length * size,
  } as never;

  it('keeps a line that fits intact', () => {
    expect(wrapLine('short line', font, 1, 100)).toEqual(['short line']);
  });

  it('breaks on the last word that fits', () => {
    expect(wrapLine('aaa bbb ccc', font, 1, 7)).toEqual(['aaa bbb', 'ccc']);
  });

  it('indents the continuation of a bullet under its text, not under the marker', () => {
    // Otherwise a wrapped bullet reads as several separate one-line items.
    const lines = wrapLine('• aaa bbb ccc', font, 1, 9);
    expect(lines[0]).toBe('• aaa bbb');
    expect(lines[1]).toBe('  ccc');
  });

  it('emits an over-long word on its own line rather than looping', () => {
    expect(wrapLine('aa bbbbbbbbbbbb cc', font, 1, 5)).toEqual(['aa', 'bbbbbbbbbbbb', 'cc']);
  });

  it('handles a single word shorter than the width', () => {
    expect(wrapLine('one', font, 1, 100)).toEqual(['one']);
  });
});
