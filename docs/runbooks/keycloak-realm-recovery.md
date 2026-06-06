# Keycloak Realm Recovery Runbook

**STUB** — detailed procedures to be defined before Stage 1→2 transition (production launch).

## Scope

Recovery procedures for Keycloak realm corruption, accidental deletion, or configuration loss.

## Prevention

- Keycloak realm export (JSON) backed up daily via CronJob — see `keycloak-realm-backup.md`
- Backup stored in S3 bucket `cos-keycloak-backups/{environment}/` with 30-day retention
- Protocol mapper configuration is critical — missing mappers block all authentication
  (see `05-security-compliance` §5.4.2 and `07-multi-tenant-architecture` §7.6 step 3)

## Recovery Steps

### Scenario A — Realm Configuration Corruption

1. Identify the last known-good backup from S3:
   `aws s3 ls s3://cos-keycloak-backups/{environment}/`
2. Download the realm export JSON:
   `aws s3 cp s3://cos-keycloak-backups/{environment}/{realm}-{date}.json /tmp/`
3. Import realm via Keycloak Admin Console or Admin REST API:
   `POST /admin/realms` with the downloaded JSON body
4. Verify protocol mappers are present: `tenant_id`, `user_id`, `role`
5. Test authentication for one user per realm before marking recovery complete

### Scenario B — Accidental Realm Deletion

1. Follow Scenario A steps above
2. After import, verify all `platform.users.keycloak_user_id` values resolve to valid
   Keycloak user UUIDs — run validation query against `platform.users`
3. If UUIDs are broken, re-provision affected users via `POST /admin/realms/{realm}/users`

### Scenario C — Keycloak Pod Restart (no data loss)

No action required — Keycloak data persists in its PostgreSQL database. Wait for pod
to become healthy and verify authentication resumes.

## Post-recovery Verification

- Confirm SYSTEM_ADMIN can log in
- Confirm TENANT_ADMIN for at least one tenant can log in
- Confirm Kong JWT plugin validates tokens correctly (test via `/api/v1/auth/me`)
- File incident report — see [incident-response.md](incident-response.md)
