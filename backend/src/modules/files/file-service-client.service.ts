// FileServiceClient — backend → File Service (services/file-service/) REST client.
//
// Same transport model as CredentialClientService (ADR-019 option A): a direct internal call over the
// mesh, forwarding the acting principal as the identity headers the file-service auth plugin reads
// (x-tenant-id / x-user-id / x-user-role) from the ambient request context (CLS, ADR-031).
//
// Those headers no longer travel alone. Every call now carries a client-credentials bearer token for
// the `cos-backend` service account, because the Kong that was supposed to verify and inject the
// headers is deployed nowhere — see ServiceTokenService and TDD OQ-46. The token says WHO is calling;
// the headers still say ON WHOSE BEHALF.
// File Service owns all uploads; the backend references files by file_id. Contract signing (ADR-058)
// uses this to validate that an attached document exists for the tenant before binding it to a contract.
//
// A call with no tenant context fails closed (401). A tenant-scoped miss (the file does not exist for
// this tenant) returns null; other non-2xx map to an HttpException (4xx passthrough, 5xx/transport → 502).

import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { createLogger } from '@cos/logger';
import { clsTenantId, clsUserId, clsUserRole } from '../../shared/context/cls-context';
import { ServiceTokenService } from '../../shared/auth/service-token.service';

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
  constructor(private readonly serviceToken: ServiceTokenService) {}

  /**
   * The identity of this call: the backend's own credential plus the principal it is acting for.
   * One place, so a new call site cannot forget the token and silently fall back to headers —
   * which is precisely the state OQ-46 found.
   */
  private async identityHeaders(tenantId: string): Promise<Record<string, string>> {
    return {
      authorization: `Bearer ${await this.serviceToken.getToken()}`,
      'x-tenant-id': tenantId,
      'x-user-id': clsUserId(),
      'x-user-role': clsUserRole(),
    };
  }

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
        headers: await this.identityHeaders(tenantId),
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
        headers: await this.identityHeaders(tenantId),
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

  /**
   * Mint a short-lived signed download URL for a file the caller's tenant owns.
   *
   * Returns `null` when the file is not yet downloadable rather than throwing, because "not ready"
   * is a NORMAL state, not an error: uploads are scanned by ClamAV asynchronously, so a file sits at
   * `PENDING_SCAN` for a window after upload and File Service answers 409 FILE_NOT_CLEAN until the
   * scan clears it (`files.routes.ts`). A caller that treated that as a failure would show an error
   * for a file that is simply still being checked. 404 (unknown / deleted / another tenant's) is
   * also null — the caller cannot distinguish those, which is the point.
   *
   * The TTL is the File Service's own `SIGNED_URL_TTL_SECONDS` (default 1 hour) and is returned so
   * the caller can tell the user how long the link lasts instead of guessing. There is deliberately
   * no per-call override: ADR-078's export flow re-mints on each download rather than asking for a
   * long-lived bearer URL.
   */
  async getSignedUrl(fileId: string): Promise<{ url: string; expires_in_seconds: number } | null> {
    const tenantId = clsTenantId();
    if (!tenantId) {
      throw new HttpException(
        'Missing tenant context for FileService call',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const url = `${this.baseUrl}/api/v1/files/${encodeURIComponent(fileId)}/url`;
    let res: Awaited<ReturnType<typeof fetch>>;
    try {
      res = await fetch(url, {
        method: 'GET',
        headers: await this.identityHeaders(tenantId),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      logger.error(
        { err: (err as Error).message, fileId },
        'FileService signed-URL request failed',
      );
      throw new HttpException('FileService unreachable', HttpStatus.BAD_GATEWAY);
    }

    if (res.status === HttpStatus.NOT_FOUND || res.status === HttpStatus.CONFLICT) return null;
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      logger.warn({ status: res.status, fileId, detail }, 'FileService signed-URL non-2xx');
      const status = res.status >= 400 && res.status < 500 ? res.status : HttpStatus.BAD_GATEWAY;
      throw new HttpException(`FileService error (${res.status})`, status);
    }

    return (await res.json()) as { url: string; expires_in_seconds: number };
  }
}
