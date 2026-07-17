// Photo-annotation repository (ADR-056). Tenant-scoped; uses $queryRaw parameterized tagged
// templates via TenantPrismaService — never raw string interpolation (QM-4), always schema-qualified
// (files.photo_annotations, §11.0 rule 2).

import { Injectable, Scope, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import { TenantPrismaService } from '../tenant/prisma/tenant-prisma.service';

export interface AnnotationRow {
  annotation_id: string;
  file_id: string;
  tenant_id: string;
  strokes: unknown;
  version: number;
  modified_by: string;
  modified_at: Date;
  created_at: Date;
}

@Injectable({ scope: Scope.REQUEST })
export class AnnotationRepository {
  constructor(
    private readonly db: TenantPrismaService,
    @Inject(REQUEST) private readonly request: Request & { tenantId?: string; userId?: string },
  ) {}

  private get tenantId(): string {
    return this.request.tenantId ?? '';
  }

  /** The acting user (JWT-projected, ADR-031). `modified_by` always comes from here, never the payload. */
  private get userId(): string {
    return this.request.userId ?? '';
  }

  /** The active annotation for a photo, or null. Soft-deleted rows are not returned. */
  async findByFileId(fileId: string): Promise<AnnotationRow | null> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<AnnotationRow[]>`
        SELECT annotation_id, file_id, tenant_id, strokes, version, modified_by, modified_at, created_at
        FROM files.photo_annotations
        WHERE file_id = ${fileId}::uuid
          AND tenant_id = ${this.tenantId}::uuid
          AND deleted_at IS NULL`,
    );
    return rows[0] ?? null;
  }

  /**
   * Insert or update the annotation for a photo, setting an explicit version. The caller
   * (AnnotationService) has already run the ConflictHandler and decided the resolved version, so this
   * is an unconditional upsert keyed on the unique file_id — the concurrency check lives in the
   * service, not here.
   */
  async upsert(params: {
    fileId: string;
    strokes: unknown;
    version: number;
  }): Promise<AnnotationRow> {
    const strokesJson = JSON.stringify(params.strokes);
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<AnnotationRow[]>`
        INSERT INTO files.photo_annotations
          (file_id, tenant_id, strokes, version, modified_by, modified_at)
        VALUES
          (${params.fileId}::uuid, ${this.tenantId}::uuid, ${strokesJson}::jsonb,
           ${params.version}, ${this.userId}::uuid, now())
        ON CONFLICT (file_id) DO UPDATE
          SET strokes = EXCLUDED.strokes,
              version = EXCLUDED.version,
              modified_by = EXCLUDED.modified_by,
              modified_at = now(),
              deleted_at = NULL
        RETURNING annotation_id, file_id, tenant_id, strokes, version, modified_by, modified_at, created_at`,
    );
    return rows[0]!;
  }
}
