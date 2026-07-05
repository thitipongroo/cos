// File Service — COS-FILE error taxonomy (QM-10)
// All error codes registered in docs/api/error-codes.md

export const FILE_ERRORS = {
  MISSING_TENANT_HEADER: {
    code: 'COS-FILE-001',
    message: 'Missing X-Tenant-ID or X-User-ID header',
    httpStatus: 401,
  },
  MIME_TYPE_NOT_ALLOWED: {
    code: 'COS-FILE-002',
    message: 'MIME type not allowed',
    httpStatus: 422,
  },
  FILE_TOO_LARGE: {
    code: 'COS-FILE-003',
    message: 'File exceeds maximum allowed size',
    httpStatus: 422,
  },
  BLOCKED_EXTENSION: {
    code: 'COS-FILE-004',
    message: 'File extension is not permitted',
    httpStatus: 422,
  },
  FILE_NOT_FOUND: { code: 'COS-FILE-005', message: 'File not found', httpStatus: 404 },
  FILE_DELETED: { code: 'COS-FILE-006', message: 'File has been deleted', httpStatus: 404 },
  UPLOAD_FAILED: { code: 'COS-FILE-007', message: 'File upload failed', httpStatus: 500 },
  SIGNED_URL_FAILED: {
    code: 'COS-FILE-008',
    message: 'Failed to generate signed URL',
    httpStatus: 500,
  },
  SCAN_FAILED: { code: 'COS-FILE-009', message: 'Antivirus scan failed', httpStatus: 500 },
  FILE_NOT_QUARANTINED: {
    code: 'COS-FILE-010',
    message: 'File is not in quarantine status',
    httpStatus: 422,
  },
  FORBIDDEN: { code: 'COS-FILE-011', message: 'Insufficient permissions', httpStatus: 403 },
  ZIP_TOO_MANY_ENTRIES: {
    code: 'COS-FILE-012',
    message: 'Archive exceeds the maximum permitted entry count',
    httpStatus: 422,
  },
  ZIP_BOMB_DETECTED: {
    code: 'COS-FILE-013',
    message: 'Archive rejected: decompression ratio or total size limit exceeded',
    httpStatus: 422,
  },
  INVALID_RETENTION_POLICY: {
    code: 'COS-FILE-014',
    message: 'Invalid retention policy (category or retention_days)',
    httpStatus: 422,
  },
} as const;

export type FileErrorKey = keyof typeof FILE_ERRORS;

export interface CosFileError {
  error: {
    code: string;
    message: string;
    traceId: string;
    timestamp: string;
  };
}

export function buildError(key: FileErrorKey, traceId: string): CosFileError {
  const { code, message } = FILE_ERRORS[key];
  return {
    error: {
      code,
      message,
      traceId,
      timestamp: new Date().toISOString(),
    },
  };
}
