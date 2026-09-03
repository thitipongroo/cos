# Phase 19 — Final Production Readiness

> Moved out of `context/00_master_construction_os.md` on 2026-09-02, verbatim.
> That file keeps the index row pointing here; `.claude/skills/phase-index/SKILL.md`
> is the map. Depends on Phase 1–18 · SaaS Maturity Stage —.
>
> Rule 36 applies at the end of this phase and Rule 38 before it starts.

```text
Prepare system for production readiness.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION A — PRE-LAUNCH CHECKLIST (Build quality gates)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Legend:
  [AUTO] = verified automatically via CI/CD script — see scripts/readiness/verify-production-readiness.sh
           (path corrected 2026-08-24; the script lives in scripts/readiness/ with the check-*.sh it calls)
  [MANUAL] = requires human verification — cannot be automated

Architecture:
  [MANUAL] [ ] All services stateless (no local file system state)
  [AUTO]   [ ] All services have health check endpoints (/health/live, /health/ready)
               → curl http://<service>/health/live for each service in cluster
  [AUTO]   [ ] All services have Kubernetes liveness + readiness probes configured
               → kubectl get deployment -o json | node scripts/readiness/jsonpick.mjs 'd.items.map(x => [x.metadata.name, x.spec.template.spec.containers.map(c => c.livenessProbe)])'
  [MANUAL] [ ] No direct DB cross-service queries (only via Kafka or API)
  [MANUAL] [ ] Outbox pattern implemented in all services that emit Kafka events
  [AUTO]   [ ] Schema Registry enforcing BACKWARD_TRANSITIVE compatibility on all topics
               → curl http://schema-registry:8081/config (check compatibility=BACKWARD_TRANSITIVE)
               Note: BACKWARD_TRANSITIVE is stricter than BACKWARD — all historical consumers can read any newer schema (spec §32.4)
  [AUTO]   [ ] Temporal worker has at least 2 replicas in production
               → kubectl get deployment temporal-worker -o jsonpath='{.spec.replicas}'

Security:
  [AUTO]   [ ] TLS 1.3 on all ingress
               → nmap --script ssl-enum-ciphers -p 443 <ingress-host>
  [MANUAL] [ ] PostgreSQL RLS enabled on all tenant-scoped tables
  [AUTO]   [ ] All secrets managed via sealed-secrets (no plaintext)
               → kubectl get secrets -A -o json | node scripts/readiness/jsonpick.mjs 'd.items.filter(s => s.type !== "kubernetes.io/service-account-token" && !(s.metadata.annotations || {})["sealedsecrets.bitnami.com/cluster-wide"]).length'
  [AUTO]   [ ] Trivy scan passes with no CRITICAL vulnerabilities
               → GitHub Actions: trivy image --exit-code 1 --severity CRITICAL <image>
  [AUTO]   [ ] OWASP ZAP scan passes on staging
               → GitHub Actions: zap-baseline.py -t https://staging.cos.app
  [MANUAL] [ ] Audit logs table has RLS DENY UPDATE/DELETE
  [MANUAL] [ ] MFA enforced for TENANT_ADMIN and FINANCE roles in Keycloak

Observability:
  [AUTO]   [ ] All services emit metrics to Prometheus
               → curl http://prometheus:9090/api/v1/targets | node scripts/readiness/jsonpick.mjs 'd.data.activeTargets.filter(t => t.health === "up").length'
  [AUTO]   [ ] All services emit structured JSON logs to Loki
               → curl -G http://loki:3100/loki/api/v1/query --data-urlencode 'query={job=~".+"}'
  [AUTO]   [ ] All services emit traces to Jaeger via OpenTelemetry
               → curl http://jaeger:16686/api/services | node scripts/readiness/jsonpick.mjs 'd.data.length'
  [AUTO]   [ ] All alerting rules configured in Grafana
               → curl -H "Authorization: Bearer $GRAFANA_TOKEN" http://grafana:3000/api/ruler/grafana/api/v1/rules | node scripts/readiness/jsonpick.mjs 'Object.keys(d).length'
  [AUTO]   [ ] All Grafana dashboards accessible and populated
               → curl -H "Authorization: Bearer $GRAFANA_TOKEN" http://grafana:3000/api/dashboards/home
  [AUTO]   [ ] DLQ depth alert verified (trigger test message to DLQ)
               → kafka-console-producer.sh --topic <dlq-topic> --message "test" then check alert fires

Data:
  [AUTO]   [ ] PostgreSQL: automated backups enabled (daily, 30-day retention)
               → aws rds describe-db-instances --query 'DBInstances[*].BackupRetentionPeriod'
  [AUTO]   [ ] PostgreSQL: point-in-time recovery (PITR) enabled
               → aws rds describe-db-instances --query 'DBInstances[*].MultiAZ'
  [MANUAL] [ ] Neo4j: neo4j-admin backup daily — stored to S3, 7-day retention
               Note: KG is rebuildable from Kafka event stream — daily backup is sufficient
               Command: neo4j-admin database backup --to-path=/backup neo4j
  [AUTO]   [ ] ClickHouse: clickhouse-backup daily — stored to S3, 7-day retention
               Note: analytics data is re-ingestible from Kafka — daily backup is sufficient
               Tool: altinity/clickhouse-backup via CronJob in Kubernetes
               → kubectl get cronjob clickhouse-backup -o jsonpath='{.status.lastSuccessfulTime}'
  [MANUAL] [ ] MinIO: replication configured (3 drives minimum)
  [AUTO]   [ ] Redis: persistence enabled (AOF mode)
               → redis-cli CONFIG GET appendonly (expect: yes)
  [AUTO]   [ ] Kafka: topic replication factor = 3, min ISR = 2
               → kafka-topics.sh --describe --bootstrap-server kafka:9092 | grep -E "ReplicationFactor|Isr"

Disaster Recovery:
  [AUTO]   [ ] RTO target: 30 minutes (production SLA — confirmed by product owner)
               Requires: automated failover via Kubernetes + health checks, not manual intervention
               PostgreSQL: RDS Multi-AZ automatic failover (~60 seconds)
               Application: Kubernetes liveness probe triggers pod restart automatically
               DNS: Route 53 health check + failover routing policy
               → aws rds describe-db-instances --query 'DBInstances[*].MultiAZ' (expect: true)
  [AUTO]   [ ] RPO target: 15 minutes (near zero loss)
               Achieved via: PostgreSQL PITR (continuous WAL archiving to S3)
               Neo4j: daily backup + KG rebuild from events (acceptable — KG is derived data)
               ClickHouse: daily backup + re-ingest from Kafka (acceptable — analytics is derived data)
               Redis: AOF persistence (sub-second RPO for cache)
               → aws rds describe-db-instances --query 'DBInstances[*].BackupRetentionPeriod'
  [MANUAL] [ ] Failover procedure: documented in docs/runbooks/disaster-recovery.md
  [MANUAL] [ ] Database restore test: performed and documented

CI/CD (ArgoCD GitOps):
  [AUTO]   [ ] ArgoCD installed and running in argocd namespace
               → kubectl get pods -n argocd | grep argocd-server
  [AUTO]   [ ] All environments (staging, production) deploy via ArgoCD (not kubectl/helm in CI)
               → argocd app list --output=wide | grep -E "Synced|Healthy"
  [AUTO]   [ ] GitHub Actions CI pipeline does NOT contain kubectl or helm upgrade commands
               → grep -r "kubectl apply\|helm upgrade" .github/workflows/ | wc -l  (expect: 0)
  [AUTO]   [ ] Staging auto-syncs on image tag update (ArgoCD syncPolicy.automated enabled)
               → argocd app get cos-staging -o json | node scripts/readiness/jsonpick.mjs 'd.spec.syncPolicy.automated'
  [MANUAL] [ ] Production promotion requires manual sync gate in ArgoCD UI — tested
  [MANUAL] [ ] Rollback procedure: argocd app rollback — documented and tested in staging

AI Monitoring:
  [AUTO]   [ ] Token usage tracked per tenant (ai_usage_logs table)
               → SELECT COUNT(*) FROM ai_usage_logs WHERE created_at > NOW() - INTERVAL '1 day'
  [AUTO]   [ ] Hallucination guard enabled on all AI report endpoints
               → grep -r "HallucinationGuard" ai/services/ | wc -l (expect > 0 per endpoint)
  [AUTO]   [ ] AI latency metrics visible in Grafana (AI dashboard)
               → curl -H "Authorization: Bearer $GRAFANA_TOKEN" http://grafana:3000/api/dashboards/uid/ai-monitoring
  [MANUAL] [ ] LLM provider API key rotation procedure: documented

Tenant Isolation Validation:
  [AUTO]   [ ] Integration test confirms: user in Tenant A cannot access Tenant B data
               → pytest tests/integration/test_tenant_isolation.py --env=staging
  [AUTO]   [ ] PostgreSQL RLS policies tested with direct DB connection
               → pytest tests/integration/test_rls_policies.py
  [AUTO]   [ ] Keycloak realm isolation verified
               → pytest tests/integration/test_keycloak_isolation.py

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION B — POST-LAUNCH ADOPTION GATES (from 04_post_launch_enterprise_evolution.md)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Purpose: validate that platform is PRODUCTION ADOPTED, not just production deployed.
Must pass ALL 8 gates before treating the platform as production-grade.
If any gate fails → platform is still in MVP phase. Do not proceed to
post-launch evolution phases (file 02 Phase 0–11).

  [ ] DAU is measurable and non-zero for at least 30 consecutive days
  [ ] At least 3 distinct operational workflows are in active daily use
  [ ] Procurement or project usage has generated real financial transactions
  [ ] Mobile usage is active (not just web)
  [ ] Structured operational data is flowing through defined schemas
  [ ] At least one team has operational dependency on the platform
      (removing access would cause workflow disruption)
  [ ] On-call rotation exists and has handled at least one real incident
  [ ] The platform has survived at least one unplanned outage
      and recovered without data loss

If all 8 gates pass → platform is production-adopted.
Proceed to post-launch evolution (04_post_launch_enterprise_evolution.md — Stage 3 file).

Generate:

- Production readiness checklist markdown (docs/runbooks/production-readiness.md)
- Deployment checklist per environment (docs/runbooks/deployment.md)
- Rollback runbook (docs/runbooks/rollback.md)
- Incident response runbook (docs/runbooks/incident-response.md)
- Architecture documentation with service interaction diagram (docs/architecture/)
- ADR (Architecture Decision Record) for each major technology choice

  (runtime mapping, Keycloak, Temporal, k6, ClickHouse strategy)

- Extension point decisions: documented in docs/specifications/ (§13.3-13.5, §22.6, §05-security-compliance §5.3.1)
- Adoption gate dashboard: track all 8 SECTION B gates in Grafana
- cos-audit/ directory committed at repository root (log file contents git-ignored via .gitignore entry: cos-audit/*.log; directory must exist for run-all-checks.sh to write sign-off logs; required as Stage 1→2 transition gate — per spec §32.11)
- docs/evidence/slo-monthly-reviews/ directory committed (monthly SLO review notes written here as YYYY-MM.md; Engineering Lead writes on first business day of each month covering previous month; escalate to product owner if error budget < 20% — per spec §31.6)


Constraints:

- Before marking Phase 19 complete: read every Generate item above line by line,
  run ls/grep to verify each exists on disk, show output — Rule 36

```
