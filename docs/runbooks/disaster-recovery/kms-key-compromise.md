# DR Runbook: KMS Key Compromise

**Source:** QM-12 — "DR runbooks must exist for: KMS key compromise"  
**Severity:** P0 — security breach  
**RTO target:** 30 minutes (for service restoration after key rotation)

---

## Context

Construction OS uses AWS KMS Customer-Managed Keys (CMKs) for:

- S3 bucket SSE-KMS (documents, backups, raw files)
- RDS storage encryption
- ElastiCache encryption at rest
- Sealed-secrets encryption (Kubernetes secrets)

CMK definitions: `infrastructure/terraform/aws/kms.tf`

---

## Step 1 — Declare P0 Security Incident

1. Open `#incident-<date>-kms-compromise` channel immediately
2. Assign IC — must be Engineering Lead or Product Owner
3. **Do not announce publicly** until scope is assessed
4. Notify security team and legal (PDPA/GDPR breach notification may be required within 72h)

---

## Step 2 — Immediate Containment

```bash
# Disable the compromised key IMMEDIATELY (prevents new encrypt/decrypt operations)
aws kms disable-key --key-id $COMPROMISED_KEY_ID --region ap-southeast-1

# Verify key is disabled
aws kms describe-key --key-id $COMPROMISED_KEY_ID \
  --query 'KeyMetadata.KeyState'
# Expected: "Disabled"
```

> **Warning:** Disabling a key prevents decryption of data encrypted with it.
> Services will start failing immediately. This is intentional — containment > availability.

---

## Step 3 — Assess Scope

```bash
# Find all resources using this key
aws kms list-resource-tags --key-id $COMPROMISED_KEY_ID

# Check CloudTrail for unauthorized key usage in last 90 days
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=ResourceName,AttributeValue=$COMPROMISED_KEY_ID \
  --start-time $(date -d '90 days ago' --iso-8601=seconds) \
  --region ap-southeast-1 | \
  python3 -c "
import sys, json
events = json.load(sys.stdin)['Events']
for e in events:
    print(e['EventTime'], e['Username'], e['EventName'])
"
```

Record all users and source IPs that accessed the key. This is required for incident report.

---

## Step 4 — Create New CMK

```bash
# Create replacement CMK
NEW_KEY_ID=$(aws kms create-key \
  --description "cos-production-replacement-$(date +%Y%m%d)" \
  --key-usage ENCRYPT_DECRYPT \
  --region ap-southeast-1 \
  --query 'KeyMetadata.KeyId' \
  --output text)

# Create alias
aws kms create-alias \
  --alias-name alias/cos-production-new \
  --target-key-id $NEW_KEY_ID \
  --region ap-southeast-1

echo "New key ID: $NEW_KEY_ID"
```

---

## Step 5 — Re-encrypt Data

### S3 buckets

```bash
# Re-encrypt all S3 objects with new key
for bucket in cos-prod-documents cos-prod-backups cos-prod-files; do
  aws s3 cp "s3://$bucket/" "s3://$bucket/" \
    --recursive \
    --sse aws:kms \
    --sse-kms-key-id $NEW_KEY_ID \
    --metadata-directive REPLACE \
    --region ap-southeast-1
done
```

### RDS — create encrypted snapshot and restore

```bash
# Create snapshot of current (compromised-key) instance
aws rds create-db-snapshot \
  --db-instance-identifier cos-postgres \
  --db-snapshot-identifier cos-postgres-pre-key-rotation \
  --region ap-southeast-1

# Wait for snapshot
aws rds wait db-snapshot-completed \
  --db-snapshot-identifier cos-postgres-pre-key-rotation

# Restore with new key (triggers brief downtime — coordinate with on-call)
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier cos-postgres-new \
  --db-snapshot-identifier cos-postgres-pre-key-rotation \
  --kms-key-id $NEW_KEY_ID
```

---

## Step 6 — Rotate Secrets

```bash
# Rotate all AWS Secrets Manager secrets (they encrypt at rest with KMS)
for secret in cos/production/DATABASE_URL cos/production/REDIS_URL cos/production/OPENAI_API_KEY; do
  aws secretsmanager rotate-secret \
    --secret-id $secret \
    --region ap-southeast-1
done
```

---

## Step 7 — Update Application Configuration

```bash
# Update Terraform state with new key IDs
cd infrastructure/terraform/aws
terraform plan -var="kms_key_id=$NEW_KEY_ID"
terraform apply -var="kms_key_id=$NEW_KEY_ID"

# Re-seal all Kubernetes secrets with new key
cd infrastructure/kubernetes
find . -name "*.yaml" -exec grep -l "SealedSecret" {} \; | \
  xargs -I{} kubeseal --re-encrypt --in-place {}
```

---

## Step 8 — Verify and Re-enable Services

```bash
# Health check after re-encryption
NAMESPACE=cos ./scripts/readiness/check-health.sh

# Verify S3 access works
aws s3 ls s3://cos-prod-documents/ --region ap-southeast-1 | head -5
```

---

## Step 9 — Schedule Key Deletion

```bash
# Schedule deletion of compromised key (minimum 7-day waiting period)
aws kms schedule-key-deletion \
  --key-id $COMPROMISED_KEY_ID \
  --pending-window-in-days 7 \
  --region ap-southeast-1
```

---

## Post-Incident

- **Breach notification:** If data was accessed using the compromised key → PDPA notification within 72h (QM-5)
- **Post-mortem:** Complete `docs/runbooks/postmortem-template.md` within 5 business days
- **Update secrets rotation policy:** `docs/policies/secrets-rotation-policy.md` — add lessons learned
