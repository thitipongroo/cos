# Keycloak Realm Daily Backup Runbook

**Source:** FILE REFERENCE MAP — "Keycloak realm daily backup (CronJob spec)"  
**Frequency:** Daily at 02:00 ICT (UTC+7)  
**Retention:** 7 days on S3

---

## Overview

Keycloak realm configuration (users, clients, roles, identity providers) must be backed up daily.
Backup is performed via `kc.sh export` and stored to S3 (MinIO in staging).

Recovery procedure: `docs/runbooks/keycloak-realm-recovery.md`

---

## Backup CronJob

Deploy to: `infrastructure/kubernetes/keycloak/keycloak-backup-cronjob.yaml`

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: keycloak-realm-backup
  namespace: cos
spec:
  schedule: "0 19 * * *"  # 02:00 ICT = 19:00 UTC
  concurrencyPolicy: Forbid
  successfulJobsHistoryLimit: 7
  failedJobsHistoryLimit: 3
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: keycloak-backup
              image: quay.io/keycloak/keycloak:24.0
              command:
                - /bin/sh
                - -c
                - |
                  set -e
                  TIMESTAMP=$(date +%Y%m%d_%H%M%S)
                  BACKUP_FILE="/tmp/realm-backup-${TIMESTAMP}.json"

                  # Export realm
                  /opt/keycloak/bin/kc.sh export \
                    --dir /tmp \
                    --users realm_file \
                    --realm construction-os

                  # Upload to S3
                  aws s3 cp "$BACKUP_FILE" \
                    "s3://${BACKUP_BUCKET}/keycloak/realm-backup-${TIMESTAMP}.json" \
                    --sse aws:kms \
                    --ssekms-key-id "${KMS_KEY_ID}"

                  echo "Backup complete: realm-backup-${TIMESTAMP}.json"
              env:
                - name: KEYCLOAK_ADMIN
                  valueFrom:
                    secretKeyRef:
                      name: keycloak-admin-credentials
                      key: username
                - name: KEYCLOAK_ADMIN_PASSWORD
                  valueFrom:
                    secretKeyRef:
                      name: keycloak-admin-credentials
                      key: password
                - name: KC_DB
                  value: postgres
                - name: KC_DB_URL
                  valueFrom:
                    secretKeyRef:
                      name: keycloak-db-secret
                      key: url
                - name: BACKUP_BUCKET
                  value: cos-backups
                - name: KMS_KEY_ID
                  valueFrom:
                    secretKeyRef:
                      name: kms-config
                      key: backup-key-id
              resources:
                requests:
                  cpu: 100m
                  memory: 256Mi
                limits:
                  cpu: 500m
                  memory: 512Mi
```

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
