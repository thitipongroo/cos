# Phase 9 — File + Document System

> Moved out of `context/00_master_construction_os.md` on 2026-09-02, verbatim.
> That file keeps the index row pointing here; `.claude/skills/phase-index/SKILL.md`
> is the map. Depends on Phase 2 · SaaS Maturity Stage 3.
>
> Rule 36 applies at the end of this phase and Rule 38 before it starts.

```text
Build File Service.

Runtime: Fastify (for multipart upload throughput — see Technology Decision Map)

File Constraints (authoritative):
  Max file size per upload:
    Images (JPEG, PNG, WebP):     20 MB
    PDF documents:                100 MB
    CAD/Drawing files (DXF, DWG): 200 MB
    Video files:                  1,024 MB (1 GB) max — MIME types: video/mp4, video/quicktime, video/webm, video/x-msvideo, video/x-ms-wmv

  Allowed MIME types:
    Images:     image/jpeg, image/png, image/webp, image/gif
    Documents:  application/pdf
    CAD:        application/dxf, application/acad, image/vnd.dwg
                (DWG/DXF parsing/viewing — DECIDED: open-source, free-licence hybrid
                 (supersedes the earlier ODA SDK option — ODA is proprietary/paid):
                   Phase A (now): DXF viewer via three-dxf / ezdxf (MIT), rendered client-side
                     from the existing signed-URL download; DWG remains store-and-serve.
                   Phase B (later): DWG → DXF conversion via LibreDWG `dwg2dxf` (GPLv3, invoked
                     as an isolated subprocess so the copyleft does not propagate to our code),
                     added once read-fidelity is validated on representative DWG files.
                 No proprietary/paid SDK. Implementation tracked as a dedicated workstream.)
    Spreadsheets: application/vnd.ms-excel,
                  application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
    Archives:   application/zip (for bulk upload — extraction DECIDED: async sandboxed
                extraction in a Temporal worker; unzip → re-validate each entry (MIME/size/AV)
                + zip-bomb guard (decompression-ratio + entry-count limits) + path-traversal
                guard → create individual file records. Pattern used by Box/Dropbox/Drive.
                Implementation tracked as a dedicated workstream.)

  NOT allowed: executable files (.exe, .sh, .bat, .js), BLOCKED at upload

  Antivirus scanning: ClamAV (no EP — implementation known)
    Implementation: ClamAV open-source scanner; scan every uploaded file before marking CLEAN; QUARANTINE on threat detected — infected files moved to cos-quarantine/{tenant_id}/ bucket (separate from cos-files; 30-day retention); emit file.document.quarantined.v1 event; SYSTEM_ADMIN notified; recovery is SYSTEM_ADMIN-only action via platform admin API; files auto-deleted after 30-day retention
    interface AntivirusHook { scan(fileId: UUID): Promise<ScanResult> }
    ScanResult: { clean: boolean, threat?: string }
    Upload flow: upload → store → scan (async) → update file status
    File status: PENDING_SCAN → CLEAN | QUARANTINED

  File retention:
    Default: indefinite (tenant-configurable — retention policies DECIDED: per-tenant +
             per-file-category retention policies with legal hold (WORM / Object-Lock style),
             driven by a retention_policies table + the existing Temporal cleanup workflow.
             Mirrors S3 Object Lifecycle + Object Lock + legal hold (Box Governance, M365
             Retention Labels) — compliance-grade. Implementation tracked as a dedicated workstream.)
    Soft delete: files are soft-deleted (deleted_at timestamp), not immediately removed
    Hard delete: 30 days after soft delete (deleted_at + 30 days) — automated cleanup job (Temporal scheduled workflow)

Storage:
  Backend: MinIO (S3-compatible)
  Bucket naming: cos-{tenant_id} (one bucket per tenant)
  Key structure: {year}/{month}/{file_id}/{original_filename}
  Signed URLs: GET signed URL TTL 1 hour (configurable per file type)
  Upload: POST to File Service → File Service streams to MinIO (no direct client upload)
  Tenant isolation: enforced via bucket-level policy in MinIO

Entities (PostgreSQL — schema: files):
  files:
    file_id           UUID PK
    tenant_id         UUID NOT NULL
    original_filename VARCHAR(512) NOT NULL
    stored_key        VARCHAR(1024) NOT NULL  — MinIO object key
    bucket_name       VARCHAR(255) NOT NULL
    mime_type         VARCHAR(255) NOT NULL
    file_size_bytes   BIGINT NOT NULL
    file_status       ENUM('PENDING_SCAN','CLEAN','QUARANTINED') DEFAULT 'PENDING_SCAN'
    uploaded_by       UUID NOT NULL
    uploaded_at       TIMESTAMPTZ DEFAULT now()
    deleted_at        TIMESTAMPTZ  — soft delete
    INDEX: (tenant_id, uploaded_by)
    INDEX: (tenant_id, file_status)

  file_metadata:
    metadata_id       UUID PK
    file_id           UUID FK NOT NULL
    tenant_id         UUID NOT NULL
    entity_type       VARCHAR(100)  — e.g. "site_report", "purchase_order"
    entity_id         UUID          — reference to owning entity
    metadata_key      VARCHAR(255) NOT NULL
    metadata_value    TEXT
    INDEX: (file_id)
    INDEX: (entity_type, entity_id)

APIs:
  POST /api/v1/files/upload                — upload file (multipart/form-data)
  GET  /api/v1/files/:fileId/url           — get signed download URL
  GET  /api/v1/files/:fileId               — get file metadata
  DELETE /api/v1/files/:fileId             — soft delete
  GET  /api/v1/files                       — list files (tenant-scoped, paginated)
  GET  /api/v1/files/by-entity/:entityType/:entityId — list files for entity

OpenSearch Indexing:
  Index name: files-{tenant_id}
  Indexed fields: original_filename, mime_type, entity_type, entity_id,
                  uploaded_by, uploaded_at, metadata key-value pairs
  Full-text search: on original_filename and metadata values

Generate:

- Fastify application with multipart plugin (@fastify/multipart)
- MinIO client integration (minio npm package)
- File validation middleware (size, MIME type, extension check)
- Antivirus hook (ClamAV integration) — IN SCOPE and BUILT. `clamscan` is a dependency of
  `services/file-service`, `src/services/file-service/src/services/antivirus.service.ts` and `src/services/scan-runner.ts`
  implement the scan, and quarantine has its own bucket, event and SYSTEM_ADMIN recovery route:
  scan every upload before marking CLEAN, QUARANTINE on threat detected, move infected objects to
  `cos-quarantine/{tenant_id}/` (30-day retention), emit `file.document.quarantined.v1`, notify
  SYSTEM_ADMIN, SYSTEM_ADMIN-only recovery. This line used to read "deferred to Phase 9 spec; do not
  implement until spec defines it", which contradicted the File Constraints block a few lines above
  in this same command — that block already specifies every one of those behaviours. The deferral
  predated it. Corrected 2026-08-22 so a future reader does not mistake working antivirus for scope
  creep (TDD OQ-33). Test design:
  `docs/architecture/test-design/phase-09-file-and-document-system.md` §35.10.9 / §35.13 ESC-07.
- Signed URL generation service
- OpenSearch indexing on upload complete
- PostgreSQL migration files
- OpenAPI 3.1 spec
- Unit tests: validation, MIME type checking, signed URL generation
- Integration tests: full upload → MinIO → metadata → signed URL flow
- Kafka event producers:

    file.document.uploaded.v1   { file_id, tenant_id, entity_type, entity_id, mime_type }
    file.document.quarantined.v1 { file_id, tenant_id, threat_type }

Constraints:

- Before marking Phase 9 complete: read every Generate item above line by line,
  run ls/grep to verify each exists on disk, show output — Rule 36

```
