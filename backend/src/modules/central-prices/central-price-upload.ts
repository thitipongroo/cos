// Reads the multipart body of `POST /api/v1/admin/central-prices/import` (@fastify/multipart).
//
// The form is small and fixed: one `file` and at most three text fields. The part limits below are
// passed to `req.parts()` and are also the plugin's global limits (shared/http/register-multipart.ts), so
// a form that carries anything else is refused by busboy before it is buffered — never read in full and
// then rejected.
//
// Structural types instead of FastifyRequest: `fastify` is not a direct dependency of the backend (see
// ai-proxy.controller.ts), and a request without the plugin's decorators — the Express adapter, or a
// non-multipart body — must produce a 400, not a TypeError.

import { BadRequestException, HttpException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  IMPORT_MULTIPART_LIMITS,
  MAX_IMPORT_FILE_BYTES,
} from '../../shared/http/register-multipart';
import { invalidUpload, uploadTooLarge } from './central-price-errors';
import { ImportCentralPricesDto } from './dto/import-central-prices.dto';

export { IMPORT_MULTIPART_LIMITS, MAX_IMPORT_FILE_BYTES };

const ALLOWED_FIELDS = new Set(['effective_period', 'source_ref', 'justification']);

interface MultipartPart {
  type: 'file' | 'field';
  fieldname: string;
  filename?: string;
  toBuffer?: () => Promise<Buffer>;
  value?: unknown;
  valueTruncated?: boolean;
}

export interface MultipartRequest {
  isMultipart?: () => boolean;
  parts?: (options: { limits: typeof IMPORT_MULTIPART_LIMITS }) => AsyncIterable<MultipartPart>;
}

export interface CentralPriceUpload {
  fields: Record<string, string>;
  file: { filename: string; bytes: Buffer };
}

const LIMIT_ERRORS = new Set(['FST_PARTS_LIMIT', 'FST_FILES_LIMIT', 'FST_FIELDS_LIMIT']);

/** Buffer the one file and collect the text fields. Throws COS-CPRICE-001 / -003 on a malformed form. */
export async function readCentralPriceUpload(req: MultipartRequest): Promise<CentralPriceUpload> {
  if (
    typeof req.isMultipart !== 'function' ||
    typeof req.parts !== 'function' ||
    !req.isMultipart()
  ) {
    throw invalidUpload(
      'Send the import as multipart/form-data: the file in "file", plus effective_period and justification.',
    );
  }

  const fields: Record<string, string> = {};
  let file: CentralPriceUpload['file'] | undefined;
  try {
    for await (const part of req.parts({ limits: IMPORT_MULTIPART_LIMITS })) {
      if (part.type === 'file') {
        if (part.fieldname !== 'file' || !part.toBuffer) {
          throw invalidUpload(
            `Unexpected file field "${part.fieldname}" — send the file in "file".`,
          );
        }
        file = { filename: part.filename ?? '', bytes: await part.toBuffer() };
        continue;
      }
      if (!ALLOWED_FIELDS.has(part.fieldname)) {
        throw invalidUpload(`Unexpected field "${part.fieldname}".`);
      }
      if (part.valueTruncated) throw invalidUpload(`Field "${part.fieldname}" is too long.`);
      if (fields[part.fieldname] !== undefined) {
        throw invalidUpload(`Field "${part.fieldname}" was sent more than once.`);
      }
      fields[part.fieldname] = String(part.value ?? '');
    }
  } catch (err: unknown) {
    if (err instanceof HttpException) throw err;
    const code = (err as { code?: string }).code;
    if (code === 'FST_REQ_FILE_TOO_LARGE') throw uploadTooLarge(MAX_IMPORT_FILE_BYTES);
    if (code !== undefined && LIMIT_ERRORS.has(code)) {
      throw invalidUpload(
        'The form carries more than expected — send one file plus effective_period, source_ref and justification.',
      );
    }
    throw err;
  }

  if (!file) throw invalidUpload('No file was uploaded — send it in the "file" field.');
  if (file.bytes.length === 0) throw invalidUpload('The uploaded file is empty.');
  return { fields, file };
}

/**
 * Validate the text fields with class-validator — the same options as the global ValidationPipe, and the
 * same 400 body shape (`message` as a list), so GlobalExceptionFilter reports it as "Validation failed"
 * with fieldErrors exactly as for a JSON body.
 */
export async function validateImportFields(
  fields: Record<string, string>,
): Promise<ImportCentralPricesDto> {
  const dto = plainToInstance(ImportCentralPricesDto, fields);
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  if (errors.length > 0) {
    // A flat DTO (no nested objects) always carries `constraints` on each error — `children` is where a
    // nested one would put them, and this DTO has none.
    throw new BadRequestException(
      errors.flatMap((e) => Object.values(e.constraints as Record<string, string>)),
    );
  }
  return dto;
}

/** The uploaded file's base name, safe to store and show: no path, no control characters, ≤ 255. */
export function uploadFileName(filename: string): string {
  const segments = filename.split(/[/\\]/); // never empty: split returns at least ['']
  const base = segments[segments.length - 1]!.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return base === '' ? 'upload' : base.slice(0, 255);
}
