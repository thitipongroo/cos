// What the two downloadable legal documents share at the HTTP edge (ADR-091, ADR-092).
//
// The Privacy Policy and the Terms of Use are served the same way on purpose: metadata first, so the
// client can verify the transfer rather than trust it, then the bytes with a digest ETag. That made
// the two controllers near-identical, which jscpd duly reported as a clone — so the shape lives here
// once and each controller is left with only what differs (its route, its service, its summaries).
//
// Not a base class: a Nest controller's decorators do not inherit usefully, and two functions taking
// the built document are simpler to read and to test than an abstract controller.

import type { Response } from 'express';

/** A built document, as both services return it. */
export interface LegalPdf {
  bytes: Buffer;
  /** SHA-256 of `bytes`, hex — published BEFORE the transfer so the client can check what arrived. */
  sha256: string;
  fileName: string;
  version: string;
  effectiveDate: string;
}

/** The metadata body both `GET …/metadata` routes return. */
export interface LegalPdfMetadata {
  version: string;
  effective_date: string;
  file_name: string;
  sha256: string;
  size_bytes: number;
  language: string;
}

export function legalPdfMetadata(pdf: LegalPdf): LegalPdfMetadata {
  return {
    version: pdf.version,
    effective_date: pdf.effectiveDate,
    file_name: pdf.fileName,
    sha256: pdf.sha256,
    size_bytes: pdf.bytes.length,
    // English only: pdf-lib's standard fonts carry no Thai glyphs, and embedding a Thai face is a
    // font-licensing decision nobody has taken. Stated rather than implied, so a Thai reader is not
    // left wondering why the download is not in their language.
    language: 'en',
  };
}

/**
 * Set the download headers and hand back the bytes for `@Res({ passthrough: true })` to send.
 *
 * The ETag IS the content digest, so a conditional request is answered without rebuilding anything
 * and a proxy cannot serve a stale edition under a new version number.
 */
export function sendLegalPdf(res: Response, doc: LegalPdf): Buffer {
  res.header('Content-Type', 'application/pdf');
  res.header('Content-Disposition', `attachment; filename="${doc.fileName}"`);
  res.header('Content-Length', String(doc.bytes.length));
  res.header('ETag', `"${doc.sha256}"`);
  return doc.bytes;
}
