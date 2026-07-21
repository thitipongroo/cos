# SonarQube (Community Edition) — SAST + code quality gate

Self-hosted SonarQube CE on the cluster, per `context.md` QM-4 and spec §30.10 / §30.12.

**Status: NOT YET DEPLOYED.** `context.md` and `docs/specifications/30-testing-strategy.md` both mark
the SonarQube CI gate `⏸ DEFERRED pending EKS server setup`, and no cluster exists yet. These
manifests are the IaC prepared ahead of that; the CI scanner step is deliberately not wired up
until the server is reachable. In the interim, security scanning is covered by Trivy, `pnpm audit`,
`pip-audit` and `govulncheck` (all already in `.github/workflows/ci.yml`).

## Node prerequisite — must be done BEFORE deploying

SonarQube embeds Elasticsearch. Elasticsearch refuses to start unless the **node** has:

```
vm.max_map_count >= 262144
```

This is set at **node provisioning time**, not by a privileged initContainer (product-owner
decision 2026-07-21). The reason matters:

- The conventional workaround — an `initContainer` running `sysctl -w` with `privileged: true` — is
  rejected by PodSecurity `restricted`, which RKE2 `profile:cis` enforces on every production
  on-prem cluster (ADR-039).
- That rejection is **silent at the workload level**: the StatefulSet is admitted, the Pod is not.
  `context.md` §Phase 17 records this exact failure mode being found only by a real deploy — lint
  and `--dry-run` both pass.

So a privileged initContainer would work on EKS and quietly fail on-prem. Setting it on the node
works identically on both.

### AWS / EKS

Handled by the launch template in `infrastructure/terraform/aws/modules/eks` (see
`sonarqube_sysctl` in that module). Verify after node rollout:

```bash
kubectl debug node/<node> -it --image=busybox -- sysctl vm.max_map_count
# expect: vm.max_map_count = 262144
```

### On-premise / RKE2

Add to each node before joining the cluster:

```bash
echo 'vm.max_map_count=262144' | sudo tee /etc/sysctl.d/99-sonarqube.conf
sudo sysctl --system
```

## Database

PostgreSQL on the **existing RDS instance**, in a dedicated `sonarqube` database — the same
arrangement `infrastructure/kubernetes/mlflow` uses for its backend store (product-owner decision
2026-07-21). Create it once:

```sql
CREATE DATABASE sonarqube;
CREATE USER sonarqube WITH PASSWORD '<generated>';
GRANT ALL PRIVILEGES ON DATABASE sonarqube TO sonarqube;
```

Then seal the credentials — never commit a plain `Secret` (QM-4):

```bash
kubectl create secret generic sonarqube-secrets \
  --namespace cos \
  --from-literal=jdbc_url='jdbc:postgresql://<rds-host>:5432/sonarqube' \
  --from-literal=jdbc_username='sonarqube' \
  --from-literal=jdbc_password='<generated>' \
  --dry-run=client -o yaml | kubeseal --format yaml
```

Paste the resulting `encryptedData` over the `REPLACE_WITH_SEALED_VALUE` placeholders in
`statefulset.yaml`.

> SonarQube shares the primary RDS instance with the application (and with the co-located
> TimescaleDB, ADR-032). If scan load ever shows up in the application's DB metrics, moving it to a
> dedicated instance is the escape hatch — it is a connection-string change plus a Terraform module.

## Storage

Two `ReadWriteOnce` PVCs of **10Gi** each (`data`, `extensions`), matching the sizing convention in
`infrastructure/kubernetes/kafka/kafka-statefulset.yaml`. `storageClassName` is intentionally
omitted so the cluster default applies, again matching Kafka.

10Gi is a convention-derived starting point, **not a measurement** — this project's real index size
has never been observed. Watch `df` inside the pod after the first full scan of the monorepo and
resize if it climbs.

## Deploy

```bash
kubectl apply -f infrastructure/kubernetes/sonarqube/statefulset.yaml
kubectl -n cos rollout status statefulset/sonarqube
```

First boot runs the database migration; the `startupProbe` allows up to ~10 minutes before
restarting the container.

## Not included here

- **Ingress / public exposure** — SonarQube holds source code; exposing it is a separate security
  decision and no Ingress is defined.
- **`sonar-project.properties` + the CI scanner step** — the gate itself. Wire it up when this
  server is running; the jest configs already emit `lcov`, which is the format the scanner consumes.
- **Initial admin password rotation** — the image ships a default (`admin`/`admin`) that must be
  changed on first login before the instance is reachable by anything but a port-forward.
