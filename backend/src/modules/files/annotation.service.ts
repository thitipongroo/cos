// Photo-annotation service (ADR-056; 17-offline-mobile-sync §17.5).
//
// The write path runs the version-based CONFLICT_FLAGGED resolver (shared with every other offline
// entity via ConflictHandler) and only persists on an ACCEPTED result — a CONFLICT_FLAGGED write
// leaves the stored annotation untouched and returns the server version for the client to reconcile.

import { Injectable, NotFoundException } from '@nestjs/common';
import { resolveAnnotationConflict, type ConflictStatus } from '../site-ops/conflict-handler';
import { AnnotationRepository, type AnnotationRow } from './annotation.repository';
import type { AnnotationResponse } from './dto/annotation.dto';

export interface ApplyAnnotationResult {
  conflict_status: ConflictStatus;
  server_version: number;
  annotation: AnnotationResponse | null;
}

@Injectable()
export class AnnotationService {
  constructor(private readonly repo: AnnotationRepository) {}

  /** GET — the photo's current annotation. 404 when the photo has none (COS-FILE-015). */
  async getByFileId(fileId: string): Promise<AnnotationResponse> {
    const row = await this.repo.findByFileId(fileId);
    if (!row) {
      throw new NotFoundException({
        code: 'COS-FILE-015',
        message: 'No annotation for this file',
        messageKey: 'files.annotation.notFound',
      });
    }
    return toResponse(row);
  }

  /**
   * Apply a sync push. Reads the current row, runs the resolver, and persists only when ACCEPTED.
   * The acting user (`modified_by`) is taken from the request context inside the repository, never
   * from the client payload.
   */
  async applyPush(
    fileId: string,
    strokes: unknown[],
    baseVersion: number,
  ): Promise<ApplyAnnotationResult> {
    const current = await this.repo.findByFileId(fileId);

    const result = resolveAnnotationConflict(
      { file_id: fileId, strokes, version: baseVersion },
      current as Record<string, unknown> | null,
    );

    if (result.conflict_status !== 'ACCEPTED') {
      // Flagged: keep the stored row, hand back the server version. A null `current` is impossible
      // here — the resolver only reaches a non-ACCEPTED status when a server row exists (a missing
      // annotation is always a clean first write), so `current` is guaranteed non-null.
      return {
        conflict_status: result.conflict_status,
        server_version: result.server_version,
        annotation: toResponse(current!),
      };
    }

    const saved = await this.repo.upsert({
      fileId,
      strokes: (result.resolved_payload as { strokes: unknown }).strokes,
      version: result.server_version,
    });

    return {
      conflict_status: 'ACCEPTED',
      server_version: saved.version,
      annotation: toResponse(saved),
    };
  }
}

function toResponse(row: AnnotationRow): AnnotationResponse {
  return {
    file_id: row.file_id,
    strokes: row.strokes,
    version: row.version,
    modified_by: row.modified_by,
    modified_at:
      row.modified_at instanceof Date ? row.modified_at.toISOString() : String(row.modified_at),
  };
}
