// Pack a finished export into one file the subject can actually receive (ADR-078).
//
// JSON is already a single document and needs no container. CSV is not: a CSV cannot hold "several
// tables with different columns", so `toCsvFiles` produces one file per table plus a manifest, and
// something has to carry them together. `platform.export_requests.file_id` is a single reference, and
// mailing someone fourteen separate links is not an answer to a §30 request.
//
// yazl, not a hand-rolled container. It is already the library this repo builds ZIPs with (in
// file-service's test fixtures) and its counterpart yauzl is what file-service reads them with in
// production, so the two halves of the platform's ZIP handling stay one vendor apart at most.
//
// BUFFERED, NOT STREAMED, and that is a deliberate bound. FileServiceClient.upload takes a Buffer,
// so the archive is fully in memory before it is sent; an export is one person's own records over
// at most a few years, which is kilobytes to low megabytes of text. If that assumption ever breaks
// the fix is a streaming upload path in FileServiceClient, not a bigger buffer here.

import { ZipFile } from 'yazl';

export const ARCHIVE_MIME = 'application/zip';

/**
 * ZIP a `{ filename: contents }` map into one buffer.
 *
 * Entry order follows the map's insertion order, so `manifest.json` lands where the serializer put
 * it — last — and the category directories read in the order they were collected.
 */
export function zipFiles(files: Record<string, string>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const zip = new ZipFile();
    const chunks: Buffer[] = [];

    zip.outputStream.on('data', (chunk: Buffer) => chunks.push(chunk));
    zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
    // A stream error would otherwise leave this promise pending forever, and the Temporal activity
    // holding it would sit until its startToClose timeout rather than failing with a reason.
    zip.outputStream.on('error', reject);

    for (const [name, contents] of Object.entries(files)) {
      zip.addBuffer(Buffer.from(contents, 'utf8'), name);
    }
    zip.end();
  });
}

/**
 * The archive's filename.
 *
 * Carries the export id rather than the person's name or email: the file lands in a downloads folder
 * and gets forwarded, and a filename is the one part of an export that leaks without being opened.
 */
export function archiveFilename(exportId: string, format: 'JSON' | 'CSV'): string {
  return format === 'JSON' ? `cos-data-export-${exportId}.json` : `cos-data-export-${exportId}.zip`;
}

/** JSON ships as-is; CSV ships as a ZIP. Content type follows the same split. */
export function archiveContentType(format: 'JSON' | 'CSV'): string {
  return format === 'JSON' ? 'application/json' : ARCHIVE_MIME;
}
