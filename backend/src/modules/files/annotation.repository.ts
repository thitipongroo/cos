// Photo-annotation repository (ADR-056). Tenant-scoped; uses $queryRaw parameterized tagged
// templates via TenantPrismaService — never raw string interpolation (QM-4), always schema-qualified
// (files.photo_annotations, §11.0 rule 2).

import { Injectable, Scope, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import { TenantPrismaService } from '../tenant/prisma/tenant-prisma.service';
import { clsTenantId } from '../../shared/context/cls-context';

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

  // CLS fallback is load-bearing, not cosmetic: under Fastify the REQUEST injected into a
  // Scope.REQUEST provider is not guaranteed to be the object the auth layer decorated. The auth
  // guards publish tenant_id into CLS (the same source TenantPrismaService reads for RLS), so this
  // resolves even when the request copy does not carry it.
  private get tenantId(): string {
    return this.request.tenantId ?? clsTenantId();
  }

  /** The acting user (JWT-projected, ADR-031). `modified_by` always comes from here, never the payload. */
  private get userId(): string {
    return this.request.userId ?? '';
  }

  /**
   * True when `fileId` names a live photo belonging to the caller's tenant (security review F7).
   *
   * `files.photo_annotations` carries a GLOBAL unique on `file_id` while its RLS policy is per-tenant,
   * so an upsert aimed at another tenant's file_id conflicts with a row the caller cannot see and
   * PostgreSQL raises instead of writing. RLS means nothing leaks, but the resulting 500 answers a
   * question the caller should not get to ask — "does this file_id have an annotation somewhere?" —
   * and reads as a server fault rather than a denial. Checking ownership first turns that into a clean
   * 404 and makes the object-level authorization explicit rather than a side effect of a constraint.
   */
  async fileExistsInTenant(fileId: string): Promise<boolean> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<Array<{ file_id: string }>>`
        SELECT file_id
        FROM files.files
        WHERE file_id = ${fileId}::uuid
          AND tenant_id = ${this.tenantId}::uuid
          AND deleted_at IS NULL
        LIMIT 1`,
    );
    return rows.length > 0;
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
