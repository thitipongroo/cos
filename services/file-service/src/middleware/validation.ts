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

export const BLOCKED_EXTENSIONS = new Set(['.exe', '.sh', '.bat', '.js']);

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
  // Block by extension first
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  if (BLOCKED_EXTENSIONS.has(ext)) {
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

export async function readMultipartBuffer(
  part: MultipartFile,
): Promise<{ buffer: Buffer; size: number }> {
  const chunks: Buffer[] = [];
  for await (const chunk of part.file) {
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  return { buffer, size: buffer.length };
}
