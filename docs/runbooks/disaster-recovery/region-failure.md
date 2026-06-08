# DR Runbook: Complete Region Failure (ap-southeast-1)

**Source:** QM-12 — "DR runbooks must exist for: complete region failure"  
**RTO target:** 30 minutes (production)  
**Architecture:** Active-passive; primary `ap-southeast-1` (Thailand); DR region via Terraform multi-region module

> **Stage 1–3 note:** Multi-region failover is architected but not yet required.
> This runbook is prepared per QM-12. Execute only when primary region is confirmed unavailable.

---

## Step 1 — Confirm Regional Outage

Before executing failover, confirm the outage is regional (not a local network issue):

```bash
# Check AWS Service Health Dashboard
open https://health.aws.amazon.com/

# Check from multiple external sources
curl -I https://ap-southeast-1.console.aws.amazon.com/ --max-time 10
curl -I https://status.aws.amazon.com/ --max-time 10

# Confirm EKS cluster is unreachable
kubectl get nodes --request-timeout=30s 2>&1
# If "Unable to connect to server" → region is down
```

**Do not execute failover** if EKS is reachable — investigate locally first.

---

## Step 2 — Declare P0 Incident

1. Open `#incident-<date>-region-failure` channel
2. Assign IC
3. Notify product owner immediately
4. Post initial status page update: "Service disruption — investigating"

---

## Step 3 — Activate DR Region

```bash
# Switch Route 53 failover record to DR region
aws route53 change-resource-record-sets \
  --hosted-zone-id $HOSTED_ZONE_ID \
  --change-batch '{
    "Changes": [{
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "api.construction-os.io",
        "Type": "A",
        "AliasTarget": {
          "DNSName": "'$DR_ALB_DNS'",
          "HostedZoneId": "'$DR_ALB_ZONE_ID'",
          "EvaluateTargetHealth": true
        }
      }
    }]
  }'

# Verify DNS propagation (allow 60s)
sleep 60
nslookup api.construction-os.io
```

---

## Step 4 — Promote DR Database

```bash
# Promote RDS read replica in DR region to primary
aws rds promote-read-replica \
  --region $DR_REGION \
  --db-instance-identifier cos-postgres-dr \
  --backup-retention-period 7

# Wait for promotion to complete (~5 minutes)
aws rds wait db-instance-available \
  --region $DR_REGION \
  --db-instance-identifier cos-postgres-dr

# Update application DATABASE_URL secret in DR region
aws secretsmanager update-secret \
  --region $DR_REGION \
  --secret-id cos/production/DATABASE_URL \
  --secret-string "postgresql://cos_app:$DB_PASS@$(aws rds describe-db-instances \
    --region $DR_REGION \
    --db-instance-identifier cos-postgres-dr \
    --query 'DBInstances[0].Endpoint.Address' --output text):5432/cos_production"
```

---

## Step 5 — Scale Up DR Workloads

```bash
# DR EKS cluster should already have minimal pods running (cold standby)
export KUBECONFIG=$DR_KUBECONFIG

# Scale up application tier
kubectl scale deployment cos-backend --replicas=3 -n cos
kubectl scale deployment cos-file-service --replicas=2 -n cos
kubectl scale deployment cos-ai-gateway --replicas=2 -n cos

# Verify health
kubectl wait deployment cos-backend -n cos \
  --for=condition=Available --timeout=300s

# Run health checks
NAMESPACE=cos ./scripts/readiness/check-health.sh
```

---

## Step 6 — Verify and Notify

```bash
# Smoke test critical paths
curl -s https://api.construction-os.io/health/live | python3 -m json.tool
curl -s https://api.construction-os.io/health/ready | python3 -m json.tool

# Update status page: "Services restored via DR region"
```

---

## Step 7 — Failback to Primary (when ap-southeast-1 recovers)

1. Confirm primary region is stable for > 1 hour before failback
2. Synchronize data: DR PostgreSQL → primary (pg_dump / AWS DMS)
3. Switch Route 53 back to primary ALB
4. Scale down DR workloads to cold standby
5. Verify primary is serving traffic
6. Schedule post-mortem

**Data residency:** Thai PDPA data must return to `ap-southeast-1` after recovery — do not leave data in DR region permanently without legal review (QM-5, QM-13).
