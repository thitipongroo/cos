# ADR-069: One shared Go module (`libs/go`), and the duplication it removed

**Date:** 2026-07-21
**Status:** Accepted
**Deciders:** Product owner
**Tags:** architecture, go, frontend, build

---

## Context

The duplication gate introduced by ADR-068 measured the repository at **2.80%** duplicated lines,
and named where it came from. Two clusters accounted for nearly all of it.

**Go — 23.01% of all Go lines.** `analytics-worker` and `kg-ingestion-worker` each carried their own
copy of two packages:

- `internal/coskafka` — the Kafka consumption contract: Schema Registry Avro decoding, the §7.3
  tenant guard, Redis idempotency, retry, and DLQ routing. Measured on 2026-07-21, all eight
  non-test files were **byte-identical except four comment lines** in `consumer.go`. The test files
  matched too, except that `analytics-worker` had one extra file (`commit_test.go`) — so
  offset-commit behaviour was only ever tested in one of the two workers, though both relied on it.
- `internal/otel` — OTel SDK setup. The copies differed in exactly one behavioural respect, the
  fallback `OTEL_SERVICE_NAME`. `kg-ingestion-worker`'s copy also carried a package-level
  `shutdownFn` that was assigned and never read.

The failure mode is the ordinary one for copied code, and it had already started: the copies had
drifted, and a fix applied to one would not reach the other. For `coskafka` specifically, the code
that drifts is the tenant guard and the DLQ path — divergence there is a tenant-isolation or
event-loss bug, not a style problem.

**tsx — 2.18%.** The largest single pair was `/finance/budget/[projectId]` (§20.7.4) and
`/projects/[id]/finance` (§20.7.2): two deliberately separate routes whose 61-line budget-metric
render, driven by the same `useFinanceSummary` query, had been copied. The rest is table, filter and
empty-state scaffolding repeated across list pages.

## Decision

**Go: one shared module at `libs/go`**, `github.com/construction-os/coslib`, with one package per
concern (`coskafka/`, `cosotel/`), consumed by both workers through a `replace` directive:

```go
require github.com/construction-os/coslib v0.0.0
replace github.com/construction-os/coslib => ../../libs/go
```

Where the copies differed, the more general form was kept: `coskafka`'s surviving comment covers
both a unique index / `ReplacingMergeTree` and idempotent graph `MERGE`s, and records that
`ConsumeResetOffset` applies only to a group with no committed offset. `commit_test.go` came along,
so both workers are now covered by it. `cosotel.Configure` takes the default service name as a
parameter — the one thing that legitimately differs between callers — and the dead `shutdownFn` is
dropped. The package is named `cosotel`, not `otel`: the original was `package otel` while also
importing `go.opentelemetry.io/otel`, which compiles but makes every `otel.` reference in the file
the import rather than the package being defined.

**tsx:** the shared budget render moves to `components/finance/FinanceSummaryPanel.tsx`. Both routes
stay — they differ in chrome (`ProjectTabs`) and title, which is the part that was never duplicated.

Because `replace` points outside each service's directory, a service-scoped Docker build context
cannot see the dependency. Both workers therefore **build from the repository root context**,
matching what `ai-gateway` already does for `ai/prompts`:

```text
context: .          dockerfile: services/<worker>/Dockerfile
COPY libs/go ./libs/go
COPY services/<worker>/go.mod services/<worker>/go.sum* ./services/<worker>/
```

`libs/go` is added to the `go-tests` CI matrix — it has its own `go.mod`, so without an entry its
tests would run nowhere — and `libs` is added to the paths jscpd scans, so moving code out of
`services/` does not move it out of the duplication gate's scope.

## Rationale

**One module, not one per package.** Each additional module costs four edits — its own `go.mod`, a
`replace` line in every consumer, a Dockerfile `COPY`, and a `go-tests` matrix entry — and that cost
recurs for every package added. With one module, `COPY libs/go ./libs/go` and a single matrix entry
cover every future package. The accepted trade-off: a service importing only `cosotel` still
resolves `coskafka`'s dependencies into its `go.sum`. They are not linked into the binary — Go
compiles only the packages actually imported — but the lockfile is larger than it needs to be, and a
CVE against a `coskafka` dependency will appear in that service's audit output.

**Why `replace` rather than a published module tag.** Tagging
`github.com/thitipongroo/cos/libs/go` and requiring it by version would have left every Dockerfile
and CI context untouched — the cheaper change. It was rejected because `go mod download` would then
need network access at image build time, and the on-premise/air-gapped deployment target (ADR-039)
does not have it. It would also require the repository to stay public and impose a tag-then-bump
step on every change to shared worker code. `replace` keeps the build hermetic and each change
atomic across all consumers.

**Why not leave the copies.** Considered and rejected by the product owner. Two Kafka-consuming
workers is not the end state — `iot-ingestion-worker` exists today with its own `internal/ingest` —
and a third copy of the tenant guard and DLQ logic is a correctness risk, not a style problem.

## Consequences

### Positive

- Go duplication **23.01% → 0.00%**; tsx **2.18% → 1.33%**; typescript **1.50% → 1.20%**; repository
  total **2.80% → 1.12%**. The jscpd ratchet is tightened from 3% to 1.3% to hold the gain.
- The gate proved itself mid-change: consolidating observability startup left an identical
  fourteen-line block in both workers' `main.go`, jscpd took Go back to 0.58%, and that block became
  `cosotel.Start`. The ratchet caught duplication introduced by the commit that removes duplication.
- One copy of the tenant guard, idempotency, retry and DLQ logic — the parts where divergence is a
  security or data-loss bug rather than a cosmetic one.
- `commit_test.go` now covers both workers instead of one.
- A third Go worker can consume Kafka, or add tracing, without a third copy of either.

### Negative

- **Both workers now build from the repository root context.** The build context is larger and the
  Dockerfiles are no longer relocatable on their own. Three places had to change in step —
  `docker-compose.yml`, the `build-docker` matrix, and the `security-scan` (Trivy) matrix — and the
  last is easy to miss, because the two matrices are separate lists with the same shape.
- **A `replace` to a relative path is not a published module.** Nothing outside this repository can
  consume `coslib`, and `go get` on it will not work. Intentional today; the thing to revisit if a
  Go component is ever split out of the monorepo.
- **`FinanceSummaryPanel` is covered by nothing but the type checker.** `apps/web/jest.config.js` is
  deliberately not a component-testing setup (ADR-055) — React components are Playwright's
  territory — and no e2e spec navigates either finance route. The refactor was verified by `tsc`,
  ESLint and Prettier only. One behavioural trap was caught while writing it and is documented in
  the component: `isError` and `data` are rendered independently, not as an if/else, because
  react-query keeps stale data through a failing refetch and the original markup showed both.
- **`libs/go/go.mod` resolves its own dependency versions.** `go mod tidy` selected
  `linkedin/goavro/v2 v2.14.1` and `pierrec/lz4/v4 v4.1.26` where the workers had newer indirect
  versions. Module resolution takes the maximum across the build, so the workers are unaffected, but
  the shared module's own test run uses the lower versions. Worth watching if a CVE lands on either.
- **NestJS controller/service boilerplate is now the largest remaining block** (typescript 1.20%).
  It was not examined; unlike a cursor codec, that repetition may be the framework rather than a
  defect, and deduplicating it would need a judgement this change did not make.

## Addenda — work this change pulled in

Extracting `internal/otel` exposed three defects that had nothing to do with duplication. They are
recorded here because they were found and fixed under this ADR.

**The Helm charts could not run the workers.** `cos-analytics-worker` declared `containerPort: 8080`
and an HTTP liveness probe on 8080, while the binary listened on its own default of 8091 and
`values.yaml` set no `PORT` — the probe would have failed forever and the pod CrashLooped.
`cos-kg-ingestion-worker` had no container port named `http` at all, so its Service's
`targetPort: http` resolved to nothing; its probes are `exec pgrep`, so the mismatch was silent.
Both charts now set `PORT` to `service.port` and declare the matching container port.

**Nothing ever served the metrics port.** `prometheus.yml` has scraped `kg-ingestion-worker:9464`
and `analytics-worker:9464` since those jobs were written, and both charts declare a `metrics`
container port — but neither binary listened on 9464 and neither registered a `/metrics` handler.
`cosotel` exported traces over OTLP and no metrics at all, so both scrape targets were permanently
down. `cosotel.ServeMetrics` now registers an OTel Prometheus exporter on its own listener, matching
what `backend/src/main.ts` does through `@cos/tracing`. Verified by running the built image and
fetching `/metrics`: HTTP 200, 8.8 KB.

**`POST /admin/rebuild` was unauthenticated.** kg-ingestion-worker's admin endpoint — which replays
the entire topic from the oldest offset — checked only the HTTP method. The controls that should
have covered it do not exist: spec §5.4 relies on Istio mTLS, but `infrastructure/` contains no
Istio manifest, and the repository's only NetworkPolicy selects
`cos.io/cloudflare-protected: 'true'`, a label no chart sets, so there is no default-deny either.
The endpoint now requires a bearer token (`KG_ADMIN_TOKEN`, wired through External Secrets) and
**fails closed** when it is unset, compared in constant time.

This is defence in depth, not the control the spec asks for. **The absent Istio mTLS and the absent
default-deny NetworkPolicy remain open**, and no cluster-wide network policy was written here
because its effect could not be verified in this environment — shipping an untested default-deny is
how a cluster goes dark.

## References

- ADR-039 (RKE2 `profile:cis`, air-gapped constraint), ADR-055 (apps/web unit-test lane),
  ADR-068 (duplication gate)
- Spec §7.3 (tenant guard), §20.7.2 / §20.7.4 (the two finance routes), §30.12 (CI gate table)
