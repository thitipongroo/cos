// The downloadable Terms of Use PDF (ADR-092).
//
// Pure pdf-lib, no browser and no native binary — the same choice
// `../privacy-policy/privacy-policy.service.ts` and `finance/contract-document.util.ts` made, and for
// the same reasons.
//
// DETERMINISTIC IS THE POINT, not a nicety. The download receipt shows a SHA-256 and the client
// recomputes it over the bytes that landed; that comparison means nothing unless the same document
// always produces the same bytes. pdf-lib stamps CreationDate/ModDate from the clock by default,
// which would move the digest on every request — so both are pinned to the document's effective date.
//
// Built ONCE and cached: no tenant, no user, no parameter, so a rebuild per download would burn CPU
// to produce identical bytes.
//
// `wrapLine` is IMPORTED from the policy service rather than copied. It is the one subtle piece here
// (greedy wrap against the font's measured width, because Helvetica is proportional and a
// character-count estimate overflows the margin on wide lines), it is already exported for its own
// tests, and both documents live inside the identity module — a second copy would be one more place
// for the margin logic to drift.

import { Injectable } from '@nestjs/common';
import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';
import { createHash } from 'node:crypto';
import { wrapLine } from '../privacy-policy/privacy-policy.service';
import {
  TERMS_DOCUMENT,
  TERMS_EFFECTIVE_DATE,
  TERMS_FILE_STEM,
  TERMS_VERSION,
} from './terms-document';

const MARGIN = 56;
const LINE_GAP = 5;
const BODY_SIZE = 10;
/** Page width minus both margins, in points, at pdf-lib's default Letter page. */
const TEXT_WIDTH = 612 - MARGIN * 2;

export interface TermsPdf {
  bytes: Buffer;
  /** SHA-256 of `bytes`, hex. The client recomputes this over what it received. */
  sha256: string;
  fileName: string;
  version: string;
  effectiveDate: string;
}

@Injectable()
export class TermsOfUseService {
  private cached: TermsPdf | null = null;

  async getPdf(): Promise<TermsPdf> {
    this.cached ??= await this.build();
    return this.cached;
  }

  private async build(): Promise<TermsPdf> {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);

    // Pinned so the bytes — and therefore the digest — are stable across requests and deployments.
    const stamp = new Date(`${TERMS_EFFECTIVE_DATE}T00:00:00.000Z`);
    doc.setTitle(`${TERMS_DOCUMENT.brandName} — Terms of Use v${TERMS_VERSION}`);
    doc.setAuthor(TERMS_DOCUMENT.brandName);
    doc.setSubject(TERMS_DOCUMENT.subtitle);
    doc.setProducer(TERMS_DOCUMENT.brandName);
    doc.setCreator(TERMS_DOCUMENT.brandName);
    doc.setCreationDate(stamp);
    doc.setModificationDate(stamp);

    let page: PDFPage = doc.addPage();
    let y = page.getSize().height - MARGIN;

    const write = (text: string, size = BODY_SIZE, face: PDFFont = font): void => {
      for (const line of wrapLine(text, face, size, TEXT_WIDTH)) {
        if (y < MARGIN) {
          page = doc.addPage();
          y = page.getSize().height - MARGIN;
        }
        page.drawText(line, { x: MARGIN, y, size, font: face });
        y -= size + LINE_GAP;
      }
      y -= size;
    };

    write(TERMS_DOCUMENT.brandName.toUpperCase(), 20, bold);
    write(TERMS_DOCUMENT.subtitle, 11);
    write(`Effective ${TERMS_EFFECTIVE_DATE}`, 9);
    write(TERMS_DOCUMENT.intro);

    // Numbered exactly as the screen numbers them — a reader comparing the PDF against the app is
    // looking at clause 03, not at "the third one down".
    TERMS_DOCUMENT.clauses.forEach((clause, index) => {
      write(`${String(index + 1).padStart(2, '0')}  ${clause.title.toUpperCase()}`, 13, bold);
      write(clause.body);
    });

    write(`© ${stamp.getUTCFullYear()} ${TERMS_DOCUMENT.copyright}`, 9);

    const bytes = Buffer.from(await doc.save());
    return {
      bytes,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      fileName: `${TERMS_FILE_STEM}_v${TERMS_VERSION}.pdf`,
      version: TERMS_VERSION,
      effectiveDate: TERMS_EFFECTIVE_DATE,
    };
  }
}
