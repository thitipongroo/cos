# Construction OS — File Service (Fastify)

**Runtime:** Fastify + Node.js 20  
**Phase:** Phase 9  
**Deployable:** Separate from main NestJS monolith (extracted for multipart upload throughput)

## Purpose

Handles all file upload and download operations. Streams multipart uploads directly to MinIO (S3-compatible object storage) without buffering in memory. Validates MIME type, file size, and extension server-side. Triggers async antivirus scan after upload.

## Public API

All endpoints require `Authorization: Bearer <JWT>` (validated by Kong Gateway).

| Method   | Path                                            | Description                           |
| -------- | ----------------------------------------------- | ------------------------------------- |
| `POST`   | `/api/v1/files/upload`                          | Upload file (multipart/form-data)     |
| `GET`    | `/api/v1/files/:fileId/url`                     | Get signed download URL (TTL 1h)      |
| `GET`    | `/api/v1/files/:fileId`                         | Get file metadata                     |
| `DELETE` | `/api/v1/files/:fileId`                         | Soft delete                           |
| `GET`    | `/api/v1/files`                                 | List files (tenant-scoped, paginated) |
| `GET`    | `/api/v1/files/by-entity/:entityType/:entityId` | Files for entity                      |

## Constraints

- Max sizes: Images 20MB, PDFs 100MB, CAD files 200MB
- Allowed MIME types: image/jpeg, image/png, image/webp, image/gif, application/pdf, CAD formats, spreadsheets, application/zip
- Blocked: executables (.exe, .sh, .bat, .js)
- Storage: MinIO bucket `cos-{tenant_id}`, key `{year}/{month}/{file_id}/{filename}`

## Dependencies

- MinIO (S3-compatible object storage)
- PostgreSQL (file metadata, via PgBouncer port 6432)
- Redis (signed URL cache)
- OpenSearch (file search indexing)
- Kafka (publishes `file.uploaded`, `file.quarantined` events)

## Extension points

- `EP-FILE-001`: AntivirusHook — ClamAV scan stub (Phase 9+)

## Configuration

```bash
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=cos_minio_access_key
MINIO_SECRET_KEY=cos_minio_secret_key
DATABASE_URL=postgresql://cos:cos_dev_password@localhost:6432/construction_os
```

## Usage

```bash
pnpm --filter @cos/file-service dev
pnpm --filter @cos/file-service build
```
