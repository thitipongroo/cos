# Temporal Worker Restart and Stuck Workflow Recovery

**Source:** FILE REFERENCE MAP — "Temporal.io worker restart and stuck workflow recovery"  
**Applies to:** `enterprise-provisioning` workflow (Phase 25) and all future Temporal workflows

---

## Worker Health Check

```bash
# Check Temporal worker pod status
kubectl get pods -n cos -l app.kubernetes.io/name=cos-backend

# Check worker is registering workflows with Temporal server
kubectl logs -n cos <backend-pod> --tail=100 | grep -i "temporal\|workflow\|worker"

# Check Temporal server connectivity
kubectl exec -n cos <backend-pod> -- \
  npx ts-node -e "
    const { Connection } = require('@temporalio/client');
    Connection.connect({ address: process.env.TEMPORAL_ADDRESS })
      .then(() => console.log('Temporal connected'))
      .catch(e => console.error('Connection failed:', e.message));
  "
```

---

## Restart Worker (Kubernetes Rolling Restart)

```bash
# Rolling restart — zero downtime (minAvailable: 1 PodDisruptionBudget)
kubectl rollout restart deployment/cos-backend -n cos

# Monitor rollout
kubectl rollout status deployment/cos-backend -n cos --timeout=300s

# Verify worker re-registered after restart
kubectl logs -n cos -l app.kubernetes.io/name=cos-backend --tail=50 | \
  grep -i "temporal worker started\|registered workflow"
```

---

## Stuck Workflow Recovery

### Identify stuck workflows

```bash
# List running workflows older than expected duration
# Access via Temporal UI or CLI
tctl workflow list \
  --namespace default \
  --query 'WorkflowType="EnterpriseProvisioningWorkflow" AND ExecutionStatus="Running"'

# Or via Temporal Web UI: https://temporal.<domain>
# Filter: Status=Running, WorkflowType=EnterpriseProvisioningWorkflow
```

### Common stuck states

| State                        | Cause                                  | Resolution                                           |
| ---------------------------- | -------------------------------------- | ---------------------------------------------------- |
| Workflow waiting on activity | Activity worker crashed mid-execution  | Restart worker → activity retries automatically      |
| Workflow waiting on signal   | Human approval gate — no one responded | Send signal manually (see below)                     |
| Workflow in backoff loop     | Activity failing repeatedly            | Check activity error in Temporal UI → fix root cause |
| Workflow stuck > 24h         | Worker never picked up task            | Check worker is polling correct task queue           |

### Send signal to unblock a waiting workflow

```bash
# For enterprise provisioning waiting on approval
tctl workflow signal \
  --workflow_id <workflow-id> \
  --name "approval-received" \
  --input '{"approved": true, "approvedBy": "system-admin@cos"}'
```

### Terminate a stuck workflow (last resort)

```bash
# CAUTION: termination leaves provisioning incomplete — manual cleanup required
tctl workflow terminate \
  --workflow_id <workflow-id> \
  --reason "Manual termination: <reason>"

# After termination, check what activities completed and what needs rollback
# Activities to check for enterprise provisioning:
# 1. Database migration created?
# 2. Keycloak realm created?
# 3. Kong routes created?
# 4. MinIO bucket created?
# 5. Neo4j schema applied?
# Manually reverse any completed steps or re-run from scratch
```

### Re-run failed workflow from scratch

```bash
# Only after identifying root cause and fixing it
# Trigger new provisioning via API
curl -X POST https://api.<domain>/api/v1/platform/tenants/<tenant-id>/provision \
  -H "Authorization: Bearer $SYSTEM_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"force": true}'
```

---

## Temporal Server Health

```bash
# Check Temporal server pods
kubectl get pods -n temporal

# Check Temporal frontend service
kubectl port-forward svc/temporalite 7233:7233 -n temporal &
tctl cluster health
```

---

## Alerting

Alertmanager rule: `TemporalWorkflowStuck` — fires if any workflow in Running state > 2 hours.  
Alert config: `infrastructure/monitoring/alertmanager/rules/temporal.yaml`
