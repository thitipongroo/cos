// The downloadable Privacy Policy PDF (ADR-091, PDF decision 2026-08-17).
//
// Pure pdf-lib, no browser and no native binary, so the build is deterministic and unit-testable —
// the same choice finance/contract-document.util.ts made and for the same reasons.
//
// DETERMINISTIC IS THE POINT, not a nicety. The download screen shows a SHA-256 of the file, and the
// client recomputes it over the bytes it received; that comparison is only meaningful if the same
// document always produces the same bytes. pdf-lib stamps CreationDate/ModDate from the clock by
// default, which would change the digest on every request and make the check meaningless — so both
// are pinned to the policy's own effective date below.
//
// Built ONCE and cached. The document has no per-request input: there is no tenant, no user and no
// parameter, so a rebuild per download would burn CPU to produce identical bytes. The cache also
// means the digest is computed once.

import { Injectable } from '@nestjs/common';
import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';
import { createHash } from 'node:crypto';
import {
  POLICY_DOCUMENT,
  POLICY_EFFECTIVE_DATE,
  POLICY_FILE_STEM,
  POLICY_VERSION,
} from './policy-document';

const MARGIN = 56;
const LINE_GAP = 5;
const BODY_SIZE = 10;
/** Page width minus both margins, in points, at pdf-lib's default Letter page. */
const TEXT_WIDTH = 612 - MARGIN * 2;

export interface PolicyPdf {
  bytes: Buffer;
  /** SHA-256 of `bytes`, hex. The client recomputes this over what it received. */
  sha256: string;
  fileName: string;
  version: string;
  effectiveDate: string;
}

/**
 * Greedy word wrap against the real measured width of the font.
 *
 * Measured, not estimated by character count: Helvetica is proportional, so "Withdrawing consent for
 * safety-related" and "IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII" are the same length in characters
 * and nothing like it on the page. A character estimate overflows the margin on the wide lines and
 * wastes half the page on the narrow ones.
 */
export function wrapLine(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current === '' ? word : `${current} ${word}`;
    if (current !== '' && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(current);
      // A bullet's continuation lines are indented under its text, not under the marker, so the
      // bullet reads as one block rather than as several one-line items.
      current = text.startsWith('• ') ? `  ${word}` : word;
    } else {
      current = candidate;
    }
  }
  lines.push(current);
  return lines;
}

@Injectable()
export class PrivacyPolicyService {
  private cached: PolicyPdf | null = null;

  async getPdf(): Promise<PolicyPdf> {
    this.cached ??= await this.build();
    return this.cached;
  }

  private async build(): Promise<PolicyPdf> {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);

    // Pinned so the bytes — and therefore the digest — are stable across requests and deployments.
    const stamp = new Date(`${POLICY_EFFECTIVE_DATE}T00:00:00.000Z`);
    doc.setTitle(`${POLICY_DOCUMENT.brandName} — Privacy Policy v${POLICY_VERSION}`);
    doc.setAuthor(POLICY_DOCUMENT.brandName);
    doc.setSubject(POLICY_DOCUMENT.subtitle);
    doc.setProducer(POLICY_DOCUMENT.brandName);
    doc.setCreator(POLICY_DOCUMENT.brandName);
    doc.setCreationDate(stamp);
    doc.setModificationDate(stamp);

    let page: PDFPage = doc.addPage();
    let y = page.getSize().height - MARGIN;

    const write = (text: string, size = BODY_SIZE, f: PDFFont = font): void => {
      for (const line of wrapLine(text, f, size, TEXT_WIDTH)) {
        if (y < MARGIN) {
          page = doc.addPage();
          y = page.getSize().height - MARGIN;
        }
        page.drawText(line, { x: MARGIN, y, size, font: f });
        y -= size + LINE_GAP;
      }
    };
    const gap = (): void => {
      y -= BODY_SIZE;
    };

    write(POLICY_DOCUMENT.brandName.toUpperCase(), 20, bold);
    write(POLICY_DOCUMENT.subtitle, 11);
    write(POLICY_DOCUMENT.complianceBadge, 10, bold);
    write(`Effective ${POLICY_EFFECTIVE_DATE}`, 9);
    gap();
    write(POLICY_DOCUMENT.intro);
    gap();

    for (const section of POLICY_DOCUMENT.sections) {
      write(section.title.toUpperCase(), 13, bold);
      for (const line of section.lines) write(line);
      gap();
    }

    write(POLICY_DOCUMENT.contactLabel.toUpperCase(), 11, bold);
    // The address is deployment config, exactly as it is on the screen (PDPA §37(3) needs a channel a
    // subject can actually reach). Unset → the document says so rather than printing nothing, which
    // would read as "there is no contact".
    const dpo = process.env['DPO_EMAIL']?.trim();
    write(dpo === undefined || dpo === '' ? 'Contact address not yet published' : dpo);
    gap();
    write(`© ${new Date(stamp).getUTCFullYear()} ${POLICY_DOCUMENT.copyright}`, 9);

    const bytes = Buffer.from(await doc.save());
    return {
      bytes,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      fileName: `${POLICY_FILE_STEM}_v${POLICY_VERSION}.pdf`,
      version: POLICY_VERSION,
      effectiveDate: POLICY_EFFECTIVE_DATE,
    };
  }
}
