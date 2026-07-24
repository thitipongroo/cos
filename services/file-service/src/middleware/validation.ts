// File validation middleware — enforces MIME type and size constraints from spec §Phase 9.
// File Constraints (authoritative from spec):
//   Images (JPEG/PNG/WebP/GIF):    20 MB
//   PDF documents:                 100 MB
//   CAD/Drawing (DXF/DWG):        200 MB
//   Video files:                   1024 MB
//   Spreadsheets/Archives:         100 MB
//   Blocked: .exe .sh .bat .js and any executable MIME type

import type { MultipartFile } from '@fastify/multipart';
import { FILE_ERRORS } from '../errors';

export const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/dxf',
  'application/acad',
  'image/vnd.dwg',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-msvideo',
  'video/x-ms-wmv',
  // Audio — voice notes for AI transcription (spec 20 §20.3 Layer A; G-M7). expo-audio records
  // .m4a (AAC in an MP4 container) on iOS/Android; the other formats cover web/alt encoders.
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
  'audio/mpeg',
  'audio/wav',
  'audio/webm',
]);

// Allowlist (not a denylist): only these extensions are accepted — one per allowed MIME type. An
// allowlist is closed by default, so it cannot be bypassed by an extension the denylist forgot
// (.html/.svg/.phtml/.htaccess, …). Pairs with the server-side MIME allowlist + magic-byte sniff.
export const ALLOWED_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.pdf',
  '.dxf',
  '.dwg',
  '.xls',
  '.xlsx',
  '.zip',
  '.mp4',
  '.mov',
  '.webm',
  '.avi',
  '.wmv',
  '.m4a',
  '.aac',
  '.mp3',
  '.wav',
]);

const SIZE_LIMITS: Record<string, number> = {
  'image/jpeg': 20 * 1024 * 1024,
  'image/png': 20 * 1024 * 1024,
  'image/webp': 20 * 1024 * 1024,
  'image/gif': 20 * 1024 * 1024,
  'application/pdf': 100 * 1024 * 1024,
  'application/dxf': 200 * 1024 * 1024,
  'application/acad': 200 * 1024 * 1024,
  'image/vnd.dwg': 200 * 1024 * 1024,
  'video/mp4': 1024 * 1024 * 1024,
  'video/quicktime': 1024 * 1024 * 1024,
  'video/webm': 1024 * 1024 * 1024,
  'video/x-msvideo': 1024 * 1024 * 1024,
  'video/x-ms-wmv': 1024 * 1024 * 1024,
  // Audio voice notes are short (§20.3 field notes) — 25 MB is generous for a few minutes of AAC.
  'audio/mp4': 25 * 1024 * 1024,
  'audio/x-m4a': 25 * 1024 * 1024,
  'audio/aac': 25 * 1024 * 1024,
  'audio/mpeg': 25 * 1024 * 1024,
  'audio/wav': 25 * 1024 * 1024,
  'audio/webm': 25 * 1024 * 1024,
};
const DEFAULT_SIZE_LIMIT = 100 * 1024 * 1024; // 100 MB for spreadsheets, archives

export interface ValidationError {
  code: string;
  message: string;
  httpStatus: number;
}

export function validateFile(
  filename: string,
  mimeType: string,
  sizeBytes: number,
): ValidationError | null {
  // Extension allowlist first — a file with no extension or one outside the allowlist is rejected.
  const dot = filename.lastIndexOf('.');
  const ext = dot >= 0 ? filename.slice(dot).toLowerCase() : '';
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return FILE_ERRORS.BLOCKED_EXTENSION;
  }

  // Check allowed MIME type
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return FILE_ERRORS.MIME_TYPE_NOT_ALLOWED;
  }

  // Check size limit
  const limit = SIZE_LIMITS[mimeType] ?? DEFAULT_SIZE_LIMIT;
  if (sizeBytes > limit) {
    return FILE_ERRORS.FILE_TOO_LARGE;
  }

  return null;
}

/** Per-MIME byte cap (falls back to the 100 MB default for spreadsheets/archives). */
export function sizeLimitFor(mimeType: string): number {
  return SIZE_LIMITS[mimeType] ?? DEFAULT_SIZE_LIMIT;
}

export async function readMultipartBuffer(
  part: MultipartFile,
  maxBytes: number,
): Promise<{ buffer: Buffer; size: number; truncated: boolean }> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of part.file) {
    size += chunk.length;
    // Enforce the per-type cap WHILE streaming — never accumulate a payload larger than this MIME type
    // allows. The previous code buffered up to the 1 GB multipart hard cap regardless of declared type,
    // so a handful of "image/png" uploads carrying 1 GB each could OOM the pod.
    if (size > maxBytes) {
      part.file.destroy();
      return { buffer: Buffer.alloc(0), size, truncated: true };
    }
    chunks.push(chunk);
  }
  // @fastify/multipart flags truncation if the 1 GB hard cap (main.ts) was hit mid-stream.
  return { buffer: Buffer.concat(chunks), size, truncated: part.file.truncated };
}

/** Reduce an attacker-controlled multipart filename to its basename (strip '/' and '\' path segments).
 *  Falls back to the raw value if the basename is empty (a trailing separator). */
export function toBasename(rawFilename: string): string {
  return rawFilename.split(/[\\/]/).pop() || rawFilename;
}

function startsWith(buf: Buffer, sig: number[], offset = 0): boolean {
  if (buf.length < offset + sig.length) return false;
  return sig.every((b, i) => buf[offset + i] === b);
}

// Magic-byte validators for the binary types where a spoofed Content-Type is a real risk — images and
// PDFs are served inline from presigned URLs. Dependency-free on purpose: this service is CommonJS and
// `file-type` is ESM-only, and a generic sniffer would false-reject legitimate uploads (an .xlsx is a
// ZIP container, so it sniffs as application/zip). Types we cannot reliably sniff (DXF text, DWG, the
// many video/audio container variants) are intentionally omitted so they are never false-rejected.
const MAGIC_VALIDATORS: Record<string, (b: Buffer) => boolean> = {
  'image/jpeg': (b) => startsWith(b, [0xff, 0xd8, 0xff]),
  'image/png': (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  'image/gif': (b) => startsWith(b, [0x47, 0x49, 0x46, 0x38]),
  'image/webp': (b) =>
    startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8),
  'application/pdf': (b) => startsWith(b, [0x25, 0x50, 0x44, 0x46]),
  'application/zip': (b) =>
    startsWith(b, [0x50, 0x4b, 0x03, 0x04]) || startsWith(b, [0x50, 0x4b, 0x05, 0x06]),
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': (b) =>
    startsWith(b, [0x50, 0x4b, 0x03, 0x04]),
  'application/vnd.ms-excel': (b) => startsWith(b, [0xd0, 0xcf, 0x11, 0xe0]),
};

/** True when the file's magic bytes clearly contradict its declared MIME type (server-side, not the
 *  attacker-supplied Content-Type). Types without a validator are not enforced (no false positives). */
export function magicByteMismatch(buffer: Buffer, mimeType: string): boolean {
  const validator = MAGIC_VALIDATORS[mimeType];
  if (!validator) return false;
  return !validator(buffer);
}
