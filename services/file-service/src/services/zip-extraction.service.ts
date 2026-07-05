// ZipExtractionService — sandboxed ZIP extraction (spec §Phase 9, PO decision: async sandboxed
// extraction). Security guards (world-class pattern, cf. Box/Dropbox/Drive):
//   - entry-count cap                 → reject archive (ZIP_TOO_MANY_ENTRIES)
//   - per-entry decompression ratio   → reject archive (ZIP_BOMB_DETECTED)
//   - cumulative uncompressed size    → reject archive (ZIP_BOMB_DETECTED)
//   - path traversal / absolute paths → skip entry
//   - per-entry MIME/size/extension   → skip entry (reuses validateFile)
// Directory entries are skipped. Only valid entries are returned as ExtractedEntry[].

import * as yauzl from 'yauzl';
import type { Readable } from 'stream';
import type { FileServiceConfig } from '../config';
import type { ExtractedEntry } from '../types';
import { validateFile } from '../middleware/validation';
import { FILE_ERRORS } from '../errors';
import { createLogger } from '@cos/logger';

const logger = createLogger('file-service.zip-extraction');

// Extension → MIME inference for archive entries (ZIP entries carry no MIME type).
const EXT_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf',
  '.dxf': 'application/dxf',
  '.dwg': 'image/vnd.dwg',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.avi': 'video/x-msvideo',
  '.wmv': 'video/x-ms-wmv',
};

// Archive-level security violation — aborts the whole extraction.
export class ZipBombError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'ZipBombError';
    this.code = code;
  }
}

export function inferMime(filename: string): string | null {
  const dot = filename.lastIndexOf('.');
  if (dot < 0) return null;
  return EXT_MIME[filename.slice(dot).toLowerCase()] ?? null;
}

function streamToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (c: Buffer) => chunks.push(c));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    /* istanbul ignore next -- defensive: a validated in-memory entry stream does not error */
    stream.on('error', reject);
  });
}

export class ZipExtractionService {
  constructor(private readonly config: FileServiceConfig) {}

  // Extracts and validates a ZIP buffer into a list of safe child entries.
  // Throws ZipBombError on archive-level security violations; skips individual bad entries.
  extract(archive: Buffer): Promise<ExtractedEntry[]> {
    const { maxRatio, maxEntries, maxTotalBytes } = this.config.zipExtraction;
    return new Promise((resolve, reject) => {
      yauzl.fromBuffer(archive, { lazyEntries: true }, (err, zip) => {
        if (err) {
          reject(err);
          return;
        }
        /* istanbul ignore next -- defensive: yauzl always provides a zip when err is null */
        if (!zip) {
          reject(new Error('invalid zip archive'));
          return;
        }
        const entries: ExtractedEntry[] = [];
        let entryCount = 0;
        let totalUncompressed = 0;

        // Entries are processed strictly sequentially — readEntry() advances only after the
        // current entry's stream fully drains — so streams never overlap and fail() is terminal.
        const fail = (e: Error): void => {
          zip.close();
          reject(e);
        };

        zip.on('error', fail);
        zip.on('end', () => resolve(entries));
        zip.on('entry', (entry: yauzl.Entry) => {
          // Directory entries (yauzl convention: name ends with '/')
          if (entry.fileName.endsWith('/')) {
            zip.readEntry();
            return;
          }

          entryCount++;
          if (entryCount > maxEntries) {
            fail(
              new ZipBombError(
                FILE_ERRORS.ZIP_TOO_MANY_ENTRIES.code,
                FILE_ERRORS.ZIP_TOO_MANY_ENTRIES.message,
              ),
            );
            return;
          }

          const ratio =
            entry.compressedSize > 0 ? entry.uncompressedSize / entry.compressedSize : 0;
          if (ratio > maxRatio) {
            fail(
              new ZipBombError(
                FILE_ERRORS.ZIP_BOMB_DETECTED.code,
                `entry ${entry.fileName} ratio ${ratio.toFixed(1)} exceeds ${maxRatio}`,
              ),
            );
            return;
          }

          totalUncompressed += entry.uncompressedSize;
          if (totalUncompressed > maxTotalBytes) {
            fail(
              new ZipBombError(
                FILE_ERRORS.ZIP_BOMB_DETECTED.code,
                `total uncompressed ${totalUncompressed} exceeds ${maxTotalBytes}`,
              ),
            );
            return;
          }

          // Path-traversal protection: yauzl itself rejects entries whose names contain '..',
          // absolute paths, or backslashes (emits 'error' → fail), so an unsafe archive is
          // rejected wholesale. basename strips any safe sub-directory prefix.
          const basename = entry.fileName.split('/').pop() as string;
          const mimeType = inferMime(basename);
          if (!mimeType) {
            logger.warn({ entry: basename }, 'zip.entry.unknown_type_skipped');
            zip.readEntry();
            return;
          }

          zip.openReadStream(entry, (streamErr, stream) => {
            /* istanbul ignore next -- defensive: openReadStream on a validated entry does not error */
            if (streamErr || !stream) {
              fail(streamErr ?? new Error('failed to open entry stream'));
              return;
            }
            streamToBuffer(stream)
              .then((buffer) => {
                const validationError = validateFile(basename, mimeType, buffer.length);
                if (validationError) {
                  logger.warn(
                    { entry: basename, code: validationError.code },
                    'zip.entry.validation_skipped',
                  );
                } else {
                  entries.push({ filename: basename, mimeType, buffer });
                }
                zip.readEntry();
              })
              .catch(fail);
          });
        });

        zip.readEntry();
      });
    });
  }
}
