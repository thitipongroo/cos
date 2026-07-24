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

## COS-AUTH — Authentication & Authorization (Phase 2)

| Code         | HTTP | Message                                               | Trigger                                                                                 |
| ------------ | ---- | ----------------------------------------------------- | --------------------------------------------------------------------------------------- |
| COS-AUTH-001 | 403  | Multi-factor authentication is required for this role | TENANT_ADMIN/FINANCE token lacks proof of OTP (`acr`) and `MFA_ENFORCE=true` (§5.4.1) |

---

## COS-FILE — File Service (Phase 9)

| Code         | HTTP | Message                                 | Trigger                                       |
| ------------ | ---- | --------------------------------------- | --------------------------------------------- |
| COS-FILE-001 | 401  | Missing X-Tenant-ID or X-User-ID header | Kong headers absent (unauthenticated)         |
| COS-FILE-002 | 422  | MIME type not allowed                   | Uploaded MIME not in allowed list             |
| COS-FILE-003 | 422  | File exceeds maximum allowed size       | File size > per-MIME limit                    |
| COS-FILE-004 | 422  | File extension is not permitted         | .exe, .sh, .bat, .js uploaded                 |
| COS-FILE-005 | 404  | File not found                          | fileId not found for tenant                   |
| COS-FILE-006 | 404  | File has been deleted                   | File exists but deleted_at is set             |
| COS-FILE-007 | 500  | File upload failed                      | MinIO write error                             |
| COS-FILE-008 | 500  | Failed to generate signed URL           | MinIO presign error                           |
| COS-FILE-009 | 500  | Antivirus scan failed                   | ClamAV unreachable or scan error              |
| COS-FILE-010 | 422  | File is not in quarantine status        | Recover on non-quarantined file               |
| COS-FILE-011 | 403  | Insufficient permissions                | Caller lacks the required role                |
| COS-FILE-012 | 422  | Archive exceeds max entry count         | ZIP bulk upload — too many entries            |
| COS-FILE-013 | 422  | Archive rejected (zip-bomb guard)       | Ratio/total-size limit exceeded               |
| COS-FILE-014 | 422  | Invalid retention policy                | Bad category or retention_days                |
| COS-FILE-015 | 404  | No annotation for this file             | GET annotation on a photo with none (ADR-056) |
| COS-FILE-016 | 409  | File not available (scan pending/failed) | Signed-URL requested before ClamAV cleared the file (not CLEAN) |
| COS-FILE-017 | 422  | File content does not match declared type | Magic-byte sniff contradicts the declared MIME (M7) |
| COS-FILE-018 | 401  | Invalid or expired authentication token | In-service JWT verify failed, or token/Kong-header tenant mismatch (M1) |

---

## COS-FLAG — Feature Flags (QM-15; ADR-049)

| Code         | HTTP | Message                                  | Trigger                                                             |
| ------------ | ---- | ---------------------------------------- | ------------------------------------------------------------------- |
| COS-FLAG-001 | 503  | Feature '{flag}' is temporarily disabled | @FeatureFlag-gated endpoint hit while the flag is OFF (kill switch) |

---

## COS-BLDG / FLOR / ROOM / STRC / UNIT / ASST — Project spatial hierarchy + assets (Phase 3, 2026-07-05)

Full-CRUD backing entities under the project domain (§10.2 / §11.2). `-001` = entity not found;
`-002` = parent not found on create (nested-resource parent check).

| Code         | HTTP | Message                   | Trigger                                       |
| ------------ | ---- | ------------------------- | --------------------------------------------- |
| COS-BLDG-001 | 404  | Building not found        | buildingId not found for tenant               |
| COS-BLDG-002 | 404  | Parent project not found  | create under a project absent for the tenant  |
| COS-FLOR-001 | 404  | Floor not found           | floorId not found for tenant                  |
| COS-FLOR-002 | 404  | Parent building not found | create under a building absent for the tenant |
| COS-ROOM-001 | 404  | Room not found            | roomId not found for tenant                   |
| COS-ROOM-002 | 404  | Parent floor not found    | create under a floor absent for the tenant    |
| COS-STRC-001 | 404  | Structure not found       | structureId not found for tenant              |
| COS-STRC-002 | 404  | Parent building not found | create under a building absent for the tenant |
| COS-UNIT-001 | 404  | Unit not found            | unitId not found for tenant                   |
| COS-UNIT-002 | 404  | Parent building not found | create under a building absent for the tenant |
| COS-ASST-001 | 404  | Asset not found           | assetId not found for tenant                  |
| COS-ASST-002 | 404  | Parent project not found  | create under a project absent for the tenant  |
