// Terms of Use PDF tests (ADR-092).
//
// The properties worth protecting are the ones the DOWNLOAD RECEIPT's claims rest on, and they are
// the policy document's properties too — deliberately, because the receipt makes the same promise
// about both files:
//   - the bytes are DETERMINISTIC. The screen shows a SHA-256 and the client recomputes it over what
//     it received; that comparison means nothing if the same document hashes differently each time.
//     pdf-lib stamps CreationDate/ModDate from the clock by default, so this is a real regression
//     risk rather than a theoretical one.
//   - the digest is of the bytes actually served
//   - the document is built once, not per request
//   - the file is named for the version it is, so two editions cannot collide on disk
//
// `wrapLine` is NOT retested here — it is imported from the policy service and covered by that
// service's own suite. Testing it twice would assert the same function under two names.

import { PDFDocument } from 'pdf-lib';
import { createHash } from 'node:crypto';
import { TermsOfUseService } from '../terms-of-use.service';
import { TERMS_DOCUMENT, TERMS_VERSION, TERMS_EFFECTIVE_DATE } from '../terms-document';

describe('TermsOfUseService', () => {
  it('produces byte-identical output across separate instances', async () => {
    // Separate instances, so the cache cannot be what makes them equal — this is the determinism
    // assertion, and it is the one the download receipt's integrity check depends on.
    const a = await new TermsOfUseService().getPdf();
    const b = await new TermsOfUseService().getPdf();

    expect(a.bytes.equals(b.bytes)).toBe(true);
    expect(a.sha256).toBe(b.sha256);
  });

  it('pins the PDF timestamps to the effective date rather than the clock', async () => {
    // `updateMetadata: false` on the LOAD, and it is not optional: pdf-lib's default is `true`, which
    // stamps ModDate with the current time on the parsed document — so a naive read reports "now" for
    // a file whose bytes say otherwise.
    const { bytes } = await new TermsOfUseService().getPdf();
    const parsed = await PDFDocument.load(bytes, { updateMetadata: false });

    const expected = new Date(`${TERMS_EFFECTIVE_DATE}T00:00:00.000Z`);
    expect(parsed.getCreationDate()?.toISOString()).toBe(expected.toISOString());
    expect(parsed.getModificationDate()?.toISOString()).toBe(expected.toISOString());
  });

  it('reports a digest of the bytes it returns', async () => {
    const pdf = await new TermsOfUseService().getPdf();

    expect(pdf.sha256).toBe(createHash('sha256').update(pdf.bytes).digest('hex'));
  });

  it('names the file after the version, so two editions cannot collide on disk', async () => {
    const pdf = await new TermsOfUseService().getPdf();

    expect(pdf.fileName).toBe(`COS_Terms_of_Use_v${TERMS_VERSION}.pdf`);
    expect(pdf.version).toBe(TERMS_VERSION);
    expect(pdf.effectiveDate).toBe(TERMS_EFFECTIVE_DATE);
  });

  it('builds once and serves the cache afterwards', async () => {
    const service = new TermsOfUseService();
    const first = await service.getPdf();
    const second = await service.getPdf();

    // Same object, not merely equal: a rebuild would produce a new Buffer with the same contents and
    // pass an equality check while burning CPU on every download.
    expect(second).toBe(first);
  });

  it('is a real, parseable PDF carrying the document title', async () => {
    const { bytes } = await new TermsOfUseService().getPdf();
    const parsed = await PDFDocument.load(bytes);

    expect(parsed.getPageCount()).toBeGreaterThan(0);
    expect(parsed.getTitle()).toContain(TERMS_VERSION);
    expect(parsed.getAuthor()).toBe(TERMS_DOCUMENT.brandName);
  });

  it('adds a page when the text outgrows one', async () => {
    // The six clauses as written fit on a single Letter page, so the writer's page-break branch is
    // unreachable through the real document — it is driven here by appending a clause long enough to
    // overflow. That branch is not decoration: without it a seventh clause, or a longer edit to an
    // existing one, would be drawn below the page margin and silently vanish from the PDF while still
    // appearing on the screen.
    const original = TERMS_DOCUMENT.clauses;
    // The readonly modifier is a compile-time promise, not a frozen object; the cast is confined to
    // this test and the original array is restored before the next one runs.
    (TERMS_DOCUMENT as { clauses: readonly (typeof original)[number][] }).clauses = [
      ...original,
      { id: 'overflow', title: 'Overflow', body: 'paragraph '.repeat(600) },
    ];

    try {
      const { bytes } = await new TermsOfUseService().getPdf();
      const parsed = await PDFDocument.load(bytes);

      expect(parsed.getPageCount()).toBeGreaterThan(1);
    } finally {
      (TERMS_DOCUMENT as { clauses: readonly (typeof original)[number][] }).clauses = original;
    }
  });

  it('carries every clause id the screen numbers', () => {
    // Guards the document, not the renderer: a clause dropped from this list would silently shorten
    // the PDF while the screen still showed it, which is exactly the drift the parity script exists
    // to catch on the prose.
    expect(TERMS_DOCUMENT.clauses.map((c) => c.id)).toEqual([
      'acceptance',
      'license',
      'responsibilities',
      'ownership',
      'liability',
      'termination',
    ]);
  });
});
