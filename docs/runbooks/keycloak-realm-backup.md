# Keycloak Realm Daily Backup Runbook

**Source:** FILE REFERENCE MAP — "Keycloak realm daily backup (CronJob spec)"  
**Frequency:** Daily at 02:00 ICT (UTC+7)  
**Retention:** 90 days on S3 (+ 30 days for noncurrent versions)

---

## Overview

Keycloak realm configuration (users, clients, roles, identity providers) must be backed up daily.
Backup is performed via `kc.sh export` and stored to S3 (MinIO in staging).

> **Retention resolved 2026-08-07 (product-owner decision).** This page said 7 days and
> [`keycloak-realm-recovery.md`](keycloak-realm-recovery.md) said 30, and neither was backed by
> anything — the bucket existed in no IaC. It is now provisioned in
> `infrastructure/terraform/aws/modules/s3/main.tf` as `aws_s3_bucket.keycloak_backups` with an
> `expire-old-backups` rule of **90 days** plus 30-day noncurrent-version expiry — the same window as
> the database-backups bucket, so both backup stores expire on one rule. SSE-KMS with the CMK,
> versioning on, public access blocked, `force_destroy = false`.
>
> **PDPA carve-out to honour:** a realm export contains user PII, and
> `docs/compliance/data-retention-policy.md` purges a deleted account's Keycloak record after 30
> days — so a deleted user survives in these exports for up to 60 days longer. Record that in the
> RoPA and honour it on an erasure request; this bucket is not out of scope for §33 subject rights.

Recovery procedure: `docs/runbooks/keycloak-realm-recovery.md`

---

## Backup CronJob

**Committed at
[`infrastructure/kubernetes/keycloak/keycloak-backup-cronjob.yaml`](../../infrastructure/kubernetes/keycloak/keycloak-backup-cronjob.yaml)**
since 2026-08-23. Until then it existed only as a YAML block on this page, under a "Deploy to:" path
whose directory did not exist — so nothing produced a backup, while
[`keycloak-realm-recovery.md`](keycloak-realm-recovery.md) Scenario A instructs an operator to fetch
"the last known-good backup from S3" and Terraform applies a 90-day expiry rule to an empty bucket.

**The block that lived here would not have worked.** Four defects, each measured on 2026-08-23 rather
than reasoned about, and each fixed in the committed manifest:

| Defect                                                                                        | Evidence                                                                                                                    |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Ran `aws s3 cp` inside the Keycloak image, which has **no aws CLI** (and no curl)             | `docker run --rm --entrypoint sh quay.io/keycloak/keycloak:26.6.4 -c 'command -v aws'` → nothing                             |
| Copied `/tmp/realm-backup-${TIMESTAMP}.json`, a file the export never creates                 | `kc.sh export --dir /tmp --realm construction-os-dev` produced `construction-os-dev-realm.json` — the name is `{realm}-realm.json` |
| Pinned `keycloak:24.0` against a platform running **26.6.4**                                  | `docker-compose.yml`                                                                                                        |
| Exported one realm (`construction-os`), omitting every ENTERPRISE `cos-{tenantCode}` realm    | §7.6 — those tenants carry the tightest contractual RTO (1 h, §8.2)                                                          |

The committed manifest splits the work: an **initContainer** runs `kc.sh export` for **all** realms
into an `emptyDir`, then an `aws-cli` container uploads each file with the timestamp in the S3 key.
It fails the Job if the export produced nothing, so a silent zero-file "success" is not possible.

### Before it can run — ops

1. Set `BACKUP_BUCKET` in the `keycloak-backup-config` ConfigMap. Terraform declares
   `s3_keycloak_backups_bucket_name` **with no default**, so there is no correct value to commit;
   this page and the recovery page have historically disagreed (`cos-backups` vs
   `cos-keycloak-backups`). Pick one, set it here, and make the recovery page match.
2. Annotate the `keycloak-realm-backup` ServiceAccount with an IRSA role that may `PutObject` to that
   bucket and `Encrypt` with the CMK. Without it every run fails at `aws s3 cp`.
3. Confirm the `keycloak-db-secret` keys (`url`, `username`, `password`) exist in namespace `cos`.
4. **Put the manifest in an ArgoCD Application path.** It is in none today, so `kubectl apply` is
   currently the only thing that would deploy it — the same failure mode as the PostSync smoke test
   (see [`deployment.md`](deployment.md)).
5. Run it once manually and confirm objects land in the bucket:
   `kubectl -n cos create job --from=cronjob/keycloak-realm-backup keycloak-backup-manual`

### Not yet verified

`kc.sh export` reads the database and starts a server process to do it. In-cluster the CronJob gets
its own pod, so it should not collide with the live Keycloak — **but that has not been proven against
a real cluster.** Running the export inside the live container definitely does collide: measured, it
fails with `Unable to start the management interface on 0.0.0.0:9000 — Address already in use`.

---

## Verify Backup Ran

```bash
# Check last successful CronJob run
kubectl get cronjob keycloak-realm-backup -n cos \
  -o jsonpath='{.status.lastSuccessfulTime}'

# List backup files in S3
aws s3 ls s3://cos-backups/keycloak/ --recursive | tail -10

# Check job logs
kubectl get jobs -n cos | grep keycloak-realm-backup
kubectl logs job/<job-name> -n cos
```

---

## Backup Verification (weekly)

Run monthly in staging to confirm backup integrity:

```bash
# Download latest backup
aws s3 cp \
  $(aws s3 ls s3://cos-backups/keycloak/ | sort | tail -1 | awk '{print "s3://cos-backups/keycloak/"$4}') \
  /tmp/realm-backup-latest.json

# Verify JSON is valid and contains expected realms
python3 -c "
import json, sys
with open('/tmp/realm-backup-latest.json') as f:
    data = json.load(f)
print('Realm:', data.get('realm'))
print('Users:', len(data.get('users', [])))
print('Clients:', len(data.get('clients', [])))
print('Roles:', len(data.get('roles', {}).get('realm', [])))
"
```

---

## Alerting

Alertmanager rule: `KCBackupMissing` — fires if no successful backup within 25 hours.
Alert config: `infrastructure/monitoring/alertmanager/rules/keycloak.yaml`
