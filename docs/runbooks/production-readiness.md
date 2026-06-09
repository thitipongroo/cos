# Production Readiness Checklist

**Version:** Phase 19  
**Status:** Must pass ALL gates before marking the platform as production-adopted.

Legend: `[AUTO]` = verified by script | `[MANUAL]` = requires human verification

---

## Section A — Pre-Launch Quality Gates

### Architecture

| Check                                                       | Method      | Command                                   |
| ----------------------------------------------------------- | ----------- | ----------------------------------------- |
| `[AUTO]` All services stateless                             | Script      | `./scripts/readiness/check-health.sh`     |
| `[AUTO]` All services have `/health/live` + `/health/ready` | Script      | `./scripts/readiness/check-health.sh`     |
| `[MANUAL]` No direct DB cross-service queries               | Code review | Review service boundaries                 |
| `[MANUAL]` Outbox pattern in all Kafka-emitting services    | Code review | Check `OutboxPoller` usage                |
| `[AUTO]` Schema Registry BACKWARD_TRANSITIVE on all topics  | Script      | `curl http://schema-registry:8081/config` |

### Security

| Check                                                         | Method   | Command                                 |
| ------------------------------------------------------------- | -------- | --------------------------------------- |
| `[AUTO]` TLS 1.3 on all ingress                               | Script   | `./scripts/readiness/check-security.sh` |
| `[MANUAL]` PostgreSQL RLS enabled on all tenant-scoped tables | DB check | `SELECT * FROM pg_policies`             |
| `[AUTO]` All secrets via sealed-secrets (no plaintext)        | Script   | `./scripts/readiness/check-security.sh` |
| `[AUTO]` Trivy scan passes with no CRITICAL vulnerabilities   | CI       | GitHub Actions: `security-scan` job     |
| `[MANUAL]` Audit logs table has RLS DENY UPDATE/DELETE        | DB check | Review `audit_logs` RLS policies        |
| `[MANUAL]` MFA enforced for TENANT_ADMIN + FINANCE roles      | Keycloak | Keycloak admin console                  |

### Observability

| Check                                                   | Method | Command                                      |
| ------------------------------------------------------- | ------ | -------------------------------------------- |
| `[AUTO]` All services emit metrics to Prometheus        | Script | `./scripts/readiness/check-observability.sh` |
| `[AUTO]` All services emit structured JSON logs to Loki | Script | `./scripts/readiness/check-observability.sh` |
| `[AUTO]` All services emit traces to Jaeger via OTel    | Script | `./scripts/readiness/check-observability.sh` |
| `[AUTO]` All alerting rules configured in Grafana       | Script | `./scripts/readiness/check-observability.sh` |

### Data

| Check                                                            | Method | Command                             |
| ---------------------------------------------------------------- | ------ | ----------------------------------- |
| `[AUTO]` PostgreSQL: automated backups (daily, 30-day retention) | Script | `./scripts/readiness/check-data.sh` |
| `[AUTO]` PostgreSQL: Multi-AZ + PITR enabled                     | Script | `./scripts/readiness/check-data.sh` |
| `[MANUAL]` Neo4j: daily backup → S3, 7-day retention             | Verify | `neo4j-admin database backup`       |
| `[AUTO]` Redis: AOF persistence enabled                          | Script | `./scripts/readiness/check-data.sh` |
| `[AUTO]` Kafka: RF=3, min ISR=2 on all topics                    | Script | `./scripts/readiness/check-data.sh` |

### Disaster Recovery

| SLA | Target     | Mechanism                                                      |
| --- | ---------- | -------------------------------------------------------------- |
| RTO | 30 minutes | RDS Multi-AZ auto-failover (~60s) + Kubernetes liveness probes |
| RPO | 15 minutes | PostgreSQL PITR (continuous WAL archiving to S3)               |

### CI/CD

| Check                                                          | Method | Command                             |
| -------------------------------------------------------------- | ------ | ----------------------------------- |
| `[AUTO]` ArgoCD running in argocd namespace                    | Script | `./scripts/readiness/check-cicd.sh` |
| `[AUTO]` All apps deploy via ArgoCD (not kubectl/helm in CI)   | Script | `./scripts/readiness/check-cicd.sh` |
| `[AUTO]` Staging auto-syncs on image tag update                | Script | `./scripts/readiness/check-cicd.sh` |
| `[MANUAL]` Production requires manual sync gate in ArgoCD UI   | Test   | ArgoCD UI                           |
| `[MANUAL]` Rollback procedure documented and tested in staging | Test   | `./scripts/rollback.sh`             |

### AI Monitoring

| Check                                                          | Method      |
| -------------------------------------------------------------- | ----------- |
| `[AUTO]` Token usage tracked per tenant (`ai_usage_logs`)      | DB query    |
| `[AUTO]` HallucinationGuard enabled on all AI report endpoints | Code review |
| `[MANUAL]` LLM provider API key rotation documented            | Runbook     |

### Tenant Isolation

| Check                                                 | Command                                                           |
| ----------------------------------------------------- | ----------------------------------------------------------------- |
| `[AUTO]` Tenant A cannot access Tenant B data         | `pytest tests/integration/test_tenant_isolation.py --env=staging` |
| `[AUTO]` PostgreSQL RLS policies tested via direct DB | `pytest tests/integration/test_rls_policies.py`                   |
| `[AUTO]` Keycloak realm isolation verified            | `pytest tests/integration/test_keycloak_isolation.py`             |

---

## Section B — Post-Launch Adoption Gates

> Must pass ALL 8 gates before treating the platform as production-grade.  
> If any gate fails → platform is still in MVP phase.

- [ ] DAU is measurable and non-zero for at least 30 consecutive days
- [ ] At least 3 distinct operational workflows are in active daily use
- [ ] Procurement or project usage has generated real financial transactions
- [ ] Mobile usage is active (not just web)
- [ ] Structured operational data is flowing through defined schemas
- [ ] At least one team has operational dependency on the platform (removing access would cause workflow disruption)
- [ ] On-call rotation exists and has handled at least one real incident
- [ ] The platform has survived at least one unplanned outage and recovered without data loss

If all 8 gates pass → platform is **production-adopted**.  
Proceed to post-launch evolution (`context/04_post_launch_enterprise_evolution.md`).

---

## Running the automated checks

```bash
# Run all automated checks
for script in scripts/readiness/*.sh; do
  echo "=== $script ==="
  bash "$script" || echo "FAILED: $script"
done

# Staging load test baseline
k6 run scripts/loadtest/api-baseline.js \
  -e BASE_URL=https://api-staging.construction-os.io \
  -e TENANT_ID=staging-tenant
```
