# Temporal Worker Restart and Stuck Workflow Recovery

**Source:** FILE REFERENCE MAP — "Temporal.io worker restart and stuck workflow recovery"  
**Applies to:** every Temporal task queue — `procurement`, `enterprise-provisioning`, `data-export`
(cos-temporal-worker) and `file-cleanup`, `zip-extraction` (cos-file-service workers)

> **Corrected 2026-08-22.** This runbook used to target `cos-backend`, on the assumption that the
> workers ran inside the API pod. They did not run anywhere: five worker files existed, each a
> standalone `require.main === module` entrypoint, and nothing launched any of them — so a restart of
> `cos-backend` would have restarted a process that was not polling any task queue. The workers now
> have their own Deployments (§32.2; TDD OQ-32), and the commands below target those.

---

## Worker Health Check

```bash
# Backend workflows: procurement, enterprise-provisioning, data-export
kubectl get pods -n cos -l app.kubernetes.io/name=cos-temporal-worker

# File Service workflows: file-cleanup, zip-extraction
kubectl get pods -n cos   -l app.kubernetes.io/component=temporal-worker,app.kubernetes.io/name=cos-file-service

# Which queues a pod believes it serves. The health endpoint reports them, so a process that came up
# with a partial worker set is visible without reading logs.
kubectl exec -n cos <worker-pod> -- wget -qO- localhost:8090/health/live
```

**A worker that is running but idle looks identical to a healthy one.** The pod is Ready, the probe
passes and nothing is logged — the only signal is task-queue depth on the Temporal server. That is
the same blind spot that let these workers be absent entirely for months, and it is why OQ-43 (no
alert on Kafka/queue backlog) matters here too.

---

## Restart Worker (Kubernetes Rolling Restart)

```bash
# Backend workflows. Zero downtime at replicaCount >= 2 with minAvailable: 1.
kubectl rollout restart deployment -n cos -l app.kubernetes.io/name=cos-temporal-worker
kubectl rollout status  deployment -n cos -l app.kubernetes.io/name=cos-temporal-worker --timeout=300s

# File Service workflows.
kubectl rollout restart deployment/<release>-cos-file-service-workers -n cos
kubectl rollout status  deployment/<release>-cos-file-service-workers -n cos --timeout=300s

# Verify each process re-registered its queues.
kubectl logs -n cos -l app.kubernetes.io/name=cos-temporal-worker --tail=50 | grep temporal_worker
```

**terminationGracePeriodSeconds is 120s (backend) and 300s (file-service) on purpose.** The Temporal
SDK installs its own SIGTERM handler and drains in-flight activities; a shorter grace period sends
SIGKILL into a running `pg_dump`, unzip or delete batch and leaves the workflow waiting on a retry.
Do not lower it to match the API's.

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
Alert config: **NOT CONFIGURED.** There is no `alertmanager/` directory in this repository,
and `infrastructure/monitoring/prometheus/rules/cos-alerts.yml` carries no Temporal rule.
Nothing pages on this condition today.
