# Construction OS — API Error Code Registry (QM-10)

Format: `COS-{DOMAIN}-{NNN}`

All API error responses follow the structure:

```json
{
  "error": {
    "code": "COS-FILE-001",
    "message": "Human-readable message",
    "traceId": "opentelemetry-trace-id",
    "timestamp": "ISO8601"
  }
}
```

---

## COS-FILE — File Service (Phase 9)

| Code         | HTTP | Message                                 | Trigger                               |
| ------------ | ---- | --------------------------------------- | ------------------------------------- |
| COS-FILE-001 | 401  | Missing X-Tenant-ID or X-User-ID header | Kong headers absent (unauthenticated) |
| COS-FILE-002 | 422  | MIME type not allowed                   | Uploaded MIME not in allowed list     |
| COS-FILE-003 | 422  | File exceeds maximum allowed size       | File size > per-MIME limit            |
| COS-FILE-004 | 422  | File extension is not permitted         | .exe, .sh, .bat, .js uploaded         |
| COS-FILE-005 | 404  | File not found                          | fileId not found for tenant           |
| COS-FILE-006 | 404  | File has been deleted                   | File exists but deleted_at is set     |
| COS-FILE-007 | 500  | File upload failed                      | MinIO write error                     |
| COS-FILE-008 | 500  | Failed to generate signed URL           | MinIO presign error                   |
| COS-FILE-009 | 500  | Antivirus scan failed                   | ClamAV unreachable or scan error      |

---

## COS-FLAG — Feature Flags (QM-15; ADR-049)

| Code         | HTTP | Message                                  | Trigger                                                             |
| ------------ | ---- | ---------------------------------------- | ------------------------------------------------------------------- |
| COS-FLAG-001 | 503  | Feature '{flag}' is temporarily disabled | @FeatureFlag-gated endpoint hit while the flag is OFF (kill switch) |
