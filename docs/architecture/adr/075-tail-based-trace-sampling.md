# ADR-075: Trace sampling is tail-based at the Collector only — no head sampling in the SDKs

**Date:** 2026-08-01
**Status:** Accepted
**Deciders:** Product owner, Engineering Lead
**Tags:** infra, architecture

---

## Context

`docs/specifications/31-monitoring-observability.md` §31.5 and QM-8 (`context.md`) both specify
**tail-based** sampling in production: a 1% baseline plus **100% of error traces**, on the grounds that
"tail-based sampling ensures all error traces are captured regardless of baseline rate". QM-8 adds
100% of AI/LLM calls and 100% of financial transactions.

`infrastructure/monitoring/otel-collector/otel-collector-config.yml` implements exactly that — a
`tail_sampling` processor with `errors-policy` (status_code ERROR), `ai-llm-policy`,
`financial-policy` and a 1% `probabilistic-policy`.

Three defects were found on 2026-08-01 that together meant the specified behaviour was not achievable:

1. **Head sampling upstream defeated tail sampling downstream.** The Go SDK
   (`libs/go/cosotel/otel.go`) and the Python AI Gateway (`services/ai-gateway/otel.py`) each applied
   `ParentBased(TraceIDRatioBased(0.01))` in the SDK. Spans were therefore discarded **inside the
   service, before export** — the Collector only ever received ~1% of traffic, so its
   "100% of error traces" policy could only select from that surviving 1%. An error trace dropped by
   the SDK is unrecoverable. The TypeScript package (`packages/@cos/tracing`) declared a
   `samplingRatio` option but never used it, so Node services were already exporting 100% — the
   spec-correct behaviour, reached by accident.

2. **The Collector config could not start.** It used `${ENV:-production}` for the
   `deployment.environment` resource attribute. Validated against the pinned image
   `otel/opentelemetry-collector-contrib:0.103.0`, this is rejected outright:
   `cannot resolve the configuration: scheme "ENV" is not supported for uri "ENV:-production"`.
   The collector exits rather than falling back to a default.

3. **No per-environment sampling rate.** §31.5 requires development 100%, staging 10%, production 1%,
   but `sampling_percentage` was hardcoded to `1` in a single config file, and the Deployment had no
   `env:` block at all, so nothing could be varied per environment.

4. **The `loki` exporter config was invalid**, independently of (2). Its `labels:` block is not a
   key the exporter accepts in 0.103.0 — `'' has invalid keys: labels`. Confirmed pre-existing by
   validating `git show HEAD:…/otel-collector-config.yml` with the env error patched out.

5. **The ConfigMap never contained the config.** `otel-collector-deployment.yml` declared an
   `otel-collector-config` ConfigMap whose entire payload was two comment lines pointing at the real
   file. The Deployment mounts that ConfigMap, so even a valid config file in git would never have
   reached the container.

Defects 2, 4 and 5 each independently prevented this collector from running. It had never started.

## Decision

**Sampling happens in exactly one place: the OTel Collector's `tail_sampling` processor. No
Construction OS SDK performs head-based sampling.**

1. Remove the SDK sampler from `libs/go/cosotel/otel.go` and `services/ai-gateway/otel.py`. Both now
   export every span; the default `ParentBased(AlwaysSample)` applies.
2. Remove the unused `samplingRatio` option and its inaccurate JSDoc from `packages/@cos/tracing`.
3. Drive the Collector's probabilistic policy from the environment:
   `sampling_percentage: ${env:OTEL_SAMPLING_PERCENTAGE}`.
4. Fix `deployment.environment` to `${env:ENV}`, the only substitution form 0.103.0 accepts.
5. Add the `env:` block to `otel-collector-deployment.yml` supplying `ENV` and
   `OTEL_SAMPLING_PERCENTAGE`. **Both are mandatory** — see Rationale.
6. Per-environment values follow §31.5: development `100`, staging `10`, production `1`, delivered by
   **kustomize overlays** (`infrastructure/monitoring/otel-collector-overlays/{development,staging,production}`).
   kubectl ships kustomize and ArgoCD supports it natively, so this adds no tooling. The overlays sit
   beside the base, not under it — kustomize rejects an overlay nested in its own base, and relocating
   the base files would break the many references to their current paths.
7. Replace the loki exporter's rejected `labels:` block with the supported **hint** mechanism:
   `resource/loki` and `attributes/loki` processors (logs pipeline only) add `loki.resource.labels`
   and `loki.attribute.labels`. Label names are kept identical to the retired block — `service`,
   `env`, `tenant_id`, `level` — which also matches what promtail already writes, so both log paths
   into Loki share one LogQL selector. `default_labels_enabled` switches off the exporter's
   `exporter` / `job` / `instance` boilerplate.
8. Generate the ConfigMap from the real config file via kustomize `configMapGenerator`, so the file
   in git is the file that runs, and its content hash rolls the pods on change.
9. Add the `cos-otel-collector` ArgoCD Application pointing at the production overlay. The AppProject
   already whitelisted the `monitoring` namespace, but no Application referenced anything under
   `infrastructure/monitoring/` — the collector had no deploy path at all, which is why defects 2, 4
   and 5 could sit in the repo unnoticed.

The environment variable is renamed `OTEL_SAMPLING_RATIO` → `OTEL_SAMPLING_PERCENTAGE` because the
Collector's `sampling_percentage` field is a percentage (`1` = 1%) whereas the retired SDK variable
was a ratio (`0.01` = 1%). Reusing the name would have made a copied value under-sample by 100×.

## Rationale

Tail sampling is the only mechanism that can honour "100% of error traces": the decision to keep a
trace depends on how it _ended_, which is unknowable at span start. Any head-based sampler upstream
of it is therefore not an optimisation but a correctness bug — it silently discards the exact traces
the policy exists to preserve.

**Why both env vars are mandatory rather than defaulted.** Collector 0.103.0 has no default-value
substitution syntax. This was verified against the pinned image, not assumed:

| Syntax                   | Result on 0.103.0                                                 |
| ------------------------ | ----------------------------------------------------------------- |
| `${ENV:-production}`     | ERROR — `scheme "ENV" is not supported`                           |
| `${env:ENV:-production}` | ERROR — `environment variable "ENV:-production" has invalid name` |
| `${env:ENV}`             | OK (resolves to empty string when unset)                          |

**Why hints rather than something else for Loki labels.** Also verified rather than assumed, against
`otel/opentelemetry-collector-contrib:0.103.0` and a live `grafana/loki:3.0.0`:

| Probe                                                    | Result                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------ |
| `labels:` on the exporter                                | rejected — `has invalid keys: labels`                        |
| `default_labels_enabled`, `headers`, `retry_on_failure`  | accepted                                                     |
| hints + push a real OTLP log                             | Loki stream `{service, env, tenant_id, level}` — as intended |
| `default_labels_enabled: {exporter,job,instance: false}` | those three labels really disappear                          |
| `default_labels_enabled: {service_name: false}`          | **no effect** — `service_name` is still emitted              |
| `default_labels_enabled: {totally_bogus_key: false}`     | accepted — the map is NOT schema-checked                     |
| delete the `service.name` resource attribute entirely    | **no effect** — `service_name` still appears                 |
| push a log with NO service attribute of any kind         | `service_name="unknown_service"` appears anyway              |

The last row identifies the real source: **`service_name` is added by Loki, not by the exporter.**
Loki 3.x performs service-name discovery (`limits_config.discover_service_name`, confirmed present
on `grafana/loki:3.0.0` via its `/config` endpoint, alongside `discover_log_levels` for `level`).
Nothing configured on the collector can remove it, which is why two plausible collector-side fixes
both failed. It is left enabled: it mirrors `service` 1:1 so it creates no additional streams, and it
is the label Grafana's Explore UI keys on. The knob, if ever needed, is in
`infrastructure/monitoring/loki/loki-config.yml`.

The `totally_bogus_key` row is why every claim in this table was checked by pushing a real log and
reading the resulting stream labels back out of Loki, rather than by validating config: the
`default_labels_enabled` map silently accepts keys that do nothing.

Since an unset variable resolves to empty rather than to a safe default, the Deployment must set both
explicitly. An empty `sampling_percentage` is a config error the `validate` gate catches.

**Alternatives rejected:**

- _Keep head sampling and accept the deviation._ Rejected: it silently violates §31.5 and QM-8, and
  the failure mode is invisible — dashboards look healthy precisely because error traces are missing.
- _Add head sampling to the TypeScript SDK for consistency._ Rejected: it would make the one
  spec-correct runtime match the two incorrect ones.
- _Sample per-environment in the SDKs._ Rejected: it spreads one policy across three languages and
  reintroduces the same correctness problem.

## Consequences

### Positive

- "100% of error traces", "100% of AI/LLM calls" and "100% of financial transactions" become
  achievable as written in QM-8 — previously they could not hold at any baseline rate.
- One sampling knob for the whole platform, changeable without redeploying any service.
- The Collector actually starts, verified by running the exact artifact kustomize renders against a
  live Loki: "Everything is ready. Begin running and processing data."
- `deployment.environment` reports the real environment, so traces can be filtered per environment.
- Loki log shipping via the collector works at all — it never could, on three counts.
- The config in git is the config that runs, and changing it rolls the pods (ConfigMap hash).

### Negative

- **Span egress from services to the Collector rises substantially** — Go and Python now export every
  span instead of 1%. This shifts load onto the Collector's `memory_limiter`, `num_traces`
  (100000) and `expected_new_traces_per_sec` (1000) settings. The real multiplier depends on
  production traffic and has deliberately **not** been estimated here; it must be measured after
  rollout and the Collector resources (`requests: 200m/256Mi`, `limits: 1000m/1Gi`) re-tuned against
  observed values.
- Two environment variables are now mandatory for the Collector; omitting either is a startup/config
  error rather than a silent fallback.
- The collector must now be deployed with `kubectl apply -k <overlay>`; a plain `kubectl apply -f`
  on the raw manifests no longer produces a usable ConfigMap. The Deployment file says so inline.
- `tenant_id` remains a Loki label, as originally intended and as promtail already emits. It is the
  highest-cardinality label in the set — one stream per tenant per service — so stream counts must be
  watched as tenants grow, and demoted to structured metadata if Loki pushes back.

### Neutral

- No application code reads `OTEL_SAMPLING_PERCENTAGE`; it is Collector-only configuration.
- Trace _volume reaching storage_ is unchanged — the Collector still keeps 1% baseline in production.
  What changes is which spans are eligible to be kept.

## References

- `docs/specifications/31-monitoring-observability.md` §31.5 — Sampling Strategy
- `.claude/rules/qm-08-observability.md` — Observability Standards (tail-based sampling; sampling config path)
- `infrastructure/monitoring/otel-collector/otel-collector-config.yml` — `tail_sampling` policies
- ADR-021 — extraction of the shared Go `cosotel` package
