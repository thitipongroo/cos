# Keycloak Realm Recovery Runbook

**STUB** — detailed procedures to be defined before Stage 1→2 transition (production launch).

> **Why this is still a STUB.** QM-11 closes a runbook by **executing it end-to-end in staging**. A
> realm restore has never been rehearsed.

## Scope

Recovery procedures for Keycloak realm corruption, accidental deletion, or configuration loss.

**Keycloak is authoritative for identity on both auth paths** — Path A (SMS OTP) issues its token
through Keycloak Direct Grant, so a lost realm blocks field workers and office users alike. Nothing
rebuilds it from another store.

## Prevention

- Keycloak realm export (JSON) backed up daily via the `keycloak-realm-backup` CronJob in namespace
  `cos`, schedule `0 19 * * *` (02:00 ICT) — see [`keycloak-realm-backup.md`](keycloak-realm-backup.md)

  > **The CronJob did not exist until 2026-08-23**, and everything below depended on it. It lived
  > only as a YAML block inside the backup runbook, under a "Deploy to:" path whose directory was
  > never created — so nothing wrote to the bucket, while Terraform applied a 90-day expiry rule to
  > it and Scenario A below told an operator to fetch "the last known-good backup". The manifest is
  > now committed at
  > [`infrastructure/kubernetes/keycloak/keycloak-backup-cronjob.yaml`](../../infrastructure/kubernetes/keycloak/keycloak-backup-cronjob.yaml),
  > with four defects in the original block fixed (no aws CLI in the Keycloak image, a filename the
  > export never produces, an image four majors behind, and a single-realm export that omitted every
  > ENTERPRISE realm).
  >
  > **It still needs ops before it runs:** the bucket name, an IRSA role on its ServiceAccount, and a
  > place in an ArgoCD Application path. Until those are done, **assume there is no backup** and do
  > not rely on the recovery steps below.
- Backup stored in S3 bucket `cos-keycloak-backups/{environment}/`, **90-day retention** (+ 30 days
  for noncurrent versions) — `aws_s3_bucket.keycloak_backups` in
  `infrastructure/terraform/aws/modules/s3/main.tf`. **90 days is the recovery window**: an export
  older than that is gone.

  > **The bucket name here is not verified.** Terraform takes it as
  > `s3_keycloak_backups_bucket_name` with **no default**, so it is set per environment at apply
  > time. This page says `cos-keycloak-backups` and `keycloak-realm-backup.md` said `cos-backups`;
  > neither is provably right. The CronJob reads it from the `keycloak-backup-config` ConfigMap —
  > set it there and make this page match, or a restore will look in the wrong bucket.
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
- Confirm the API accepts a freshly minted token — `GET /api/v1/users/me`.
  **Corrected 2026-08-23:** this said `/api/v1/auth/me`, which does not exist; the route is
  `@Controller('users')` + `@Get('me')`.
- **Confirm a Path A (SMS OTP) login still works**, not just Path B. OTP verification is a custom
  NestJS module but token issuance is Keycloak Direct Grant against a username that is the **phone
  number** (`provision-keycloak-demo.ts`) — a restore that brings back email-usernames leaves every
  field worker unable to sign in while office users look fine.
- Confirm MFA still enforces for `TENANT_ADMIN` and `FINANCE` (QM-4) — a realm restored without the
  TOTP required action silently drops that control.
- File incident report — see [incident-response.md](incident-response.md)

## To close this STUB

1. Restore a realm export into a scratch realm in staging and complete both login paths against it.
2. Apply the Terraform that creates the bucket, and confirm the `expire-old-backups` rule is live.
3. Record the real S3 bucket name per environment (this page uses a placeholder;
   `s3_keycloak_backups_bucket_name` is the Terraform input).
