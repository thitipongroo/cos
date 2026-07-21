// FileServiceClient — backend → File Service (services/file-service/) REST client.
//
// Same transport model as CredentialClientService (ADR-067 option A): a direct internal call over the
// mesh, forwarding the acting principal as the Kong-style identity headers the file-service auth plugin
// trusts (x-tenant-id / x-user-id / x-user-role), read from the ambient request context (CLS, ADR-031).
// File Service owns all uploads; the backend references files by file_id. Contract signing (ADR-058)
// uses this to validate that an attached document exists for the tenant before binding it to a contract.
//
// A call with no tenant context fails closed (401). A tenant-scoped miss (the file does not exist for
// this tenant) returns null; other non-2xx map to an HttpException (4xx passthrough, 5xx/transport → 502).

import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { createLogger } from '@cos/logger';
import { clsTenantId, clsUserId, clsUserRole } from '../../shared/context/cls-context';

const logger = createLogger('file-service-client');
const REQUEST_TIMEOUT_MS = 10_000;

export interface FileMetadata {
  file_id: string;
  original_filename: string;
  mime_type: string;
  file_size_bytes: string;
  file_status: string;
  uploaded_by: string;
  uploaded_at: string;
  deleted_at: string | null;
  sha256: string | null;
}

export interface UploadFileParams {
  buffer: Buffer;
  filename: string;
  contentType: string;
  entityType?: string;
  entityId?: string;
}

@Injectable()
export class FileServiceClient {
  private readonly baseUrl = process.env['FILE_SERVICE_URL'] ?? 'http://file-service:3002';

  /** Fetch a file's metadata (tenant-scoped). Returns null when it does not exist for this tenant. */
  async getFileMetadata(fileId: string): Promise<FileMetadata | null> {
    const tenantId = clsTenantId();
    if (!tenantId) {
      throw new HttpException(
        'Missing tenant context for FileService call',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const url = `${this.baseUrl}/api/v1/files/${encodeURIComponent(fileId)}`;
    let res: Awaited<ReturnType<typeof fetch>>;
    try {
      res = await fetch(url, {
        method: 'GET',
        headers: {
          'x-tenant-id': tenantId,
          'x-user-id': clsUserId(),
          'x-user-role': clsUserRole(),
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      logger.error({ err: (err as Error).message, fileId }, 'FileService request failed');
      throw new HttpException('FileService unreachable', HttpStatus.BAD_GATEWAY);
    }

    if (res.status === HttpStatus.NOT_FOUND) return null;
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      logger.warn({ status: res.status, fileId, detail }, 'FileService returned non-2xx');
      const status = res.status >= 400 && res.status < 500 ? res.status : HttpStatus.BAD_GATEWAY;
      throw new HttpException(`FileService error (${res.status})`, status);
    }

    return (await res.json()) as FileMetadata;
  }

  /** Upload a file (multipart) to the File Service; returns the new file_id. Used by contract-document
   * generation (ADR-058 CT-2c-3) to store the generated PDF. */
  async upload(params: UploadFileParams): Promise<{ file_id: string }> {
    const tenantId = clsTenantId();
    if (!tenantId) {
      throw new HttpException(
        'Missing tenant context for FileService call',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const form = new FormData();
    form.append('file', new Blob([params.buffer], { type: params.contentType }), params.filename);
    const query =
      params.entityType && params.entityId
        ? `?entity_type=${encodeURIComponent(params.entityType)}&entity_id=${encodeURIComponent(params.entityId)}`
        : '';
    const url = `${this.baseUrl}/api/v1/files/upload${query}`;

    let res: Awaited<ReturnType<typeof fetch>>;
    try {
      // No content-type header — fetch derives the multipart boundary from the FormData body.
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'x-tenant-id': tenantId,
          'x-user-id': clsUserId(),
          'x-user-role': clsUserRole(),
        },
        body: form,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      logger.error({ err: (err as Error).message }, 'FileService upload failed');
      throw new HttpException('FileService unreachable', HttpStatus.BAD_GATEWAY);
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      logger.warn({ status: res.status, detail }, 'FileService upload returned non-2xx');
      const status = res.status >= 400 && res.status < 500 ? res.status : HttpStatus.BAD_GATEWAY;
      throw new HttpException(`FileService error (${res.status})`, status);
    }

    return (await res.json()) as { file_id: string };
  }
}
