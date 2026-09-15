// COS-CPRICE error responses (QM-10; registered in docs/api/error-codes.md).
//
// Each helper returns the Nest exception with a QM-10 body, so GlobalExceptionFilter passes the code
// through instead of collapsing it to COS-GENERAL-<status>. Messages name what the caller can fix and
// never carry a stack trace, a SQL error or a server path. `messageKey` is the i18n key a client renders
// instead of the English message (QM-3) — the admin keys sit beside admin.settings.error.* .

import {
  BadRequestException,
  HttpException,
  PayloadTooLargeException,
  UnprocessableEntityException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';

export type CentralPriceErrorCode =
  | 'COS-CPRICE-001'
  | 'COS-CPRICE-002'
  | 'COS-CPRICE-003'
  | 'COS-CPRICE-004'
  | 'COS-CPRICE-005'
  | 'COS-CPRICE-006'
  | 'COS-CPRICE-007';

/** The QM-10 body every COS-CPRICE response carries. */
export function centralPriceErrorBody(
  code: CentralPriceErrorCode,
  messageKey: string,
  message: string,
  details?: Record<string, unknown>,
) {
  return { error: { code, message, messageKey, ...(details ? { details } : {}) } };
}

/** COS-CPRICE-001 · 400 — the upload is not a usable multipart form (no file, two files, bad field). */
export function invalidUpload(message: string): HttpException {
  return new BadRequestException(
    centralPriceErrorBody('COS-CPRICE-001', 'admin.centralPrices.error.invalidUpload', message),
  );
}

/** COS-CPRICE-002 · 415 — the file is neither a CSV nor an .xlsx workbook. */
export function unsupportedFileType(): HttpException {
  return new UnsupportedMediaTypeException(
    centralPriceErrorBody(
      'COS-CPRICE-002',
      'admin.centralPrices.error.unsupportedFileType',
      'Upload a .csv (UTF-8) or .xlsx file. The name must end in .csv or .xlsx and the content must match.',
    ),
  );
}

/** COS-CPRICE-003 · 413 — the file exceeds the upload limit. */
export function uploadTooLarge(maxBytes: number): HttpException {
  return new PayloadTooLargeException(
    centralPriceErrorBody(
      'COS-CPRICE-003',
      'admin.centralPrices.error.fileTooLarge',
      `The upload exceeds the limit (file at most ${maxBytes} bytes).`,
      { max_file_bytes: maxBytes },
    ),
  );
}

/**
 * COS-CPRICE-004 · 422 — the file was accepted as an upload but could not be imported as a whole
 * (unreadable, missing required columns, no data rows, too many rows). A FAILED sync run is recorded
 * first, and its id is returned so the register can point at it.
 */
export function importFailed(runId: string, reason: string, message: string): HttpException {
  return new UnprocessableEntityException(
    centralPriceErrorBody('COS-CPRICE-004', 'admin.centralPrices.error.importFailed', message, {
      run_id: runId,
      reason,
    }),
  );
}

/** COS-CPRICE-005 · 400 — the `cursor` query parameter is not one this API issued. */
export function invalidCursor(): HttpException {
  return new BadRequestException(
    centralPriceErrorBody(
      'COS-CPRICE-005',
      'centralPrices.error.invalidCursor',
      'cursor is not valid — pass back the next_cursor of a previous page.',
    ),
  );
}
