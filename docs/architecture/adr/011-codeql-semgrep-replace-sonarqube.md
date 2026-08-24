# ADR-011: CodeQL + Semgrep CE + jscpd replace SonarQube for SAST and code quality

**Date:** 2026-07-21
**Status:** Accepted
**Deciders:** Product owner
**Tags:** security, infra

---

## Context

QM-4 required a SAST and code-quality gate in CI via **SonarQube Community Edition**, self-hosted on
EKS, with thresholds of "0 new bugs, 0 new vulnerabilities, 100% line coverage, 100% branch
coverage, 0% duplication **on new code**". Spec §30.10 and §30.12 listed the same, marked
`⏸ DEFERRED pending EKS server setup`.

Reviewing that requirement before building it surfaced four problems.

**1. No SonarQube deployment ever existed.** No `sonar-project.properties`, no CI job, no manifests.
The requirement had been asserted for months without being implemented.

**2. The requirement was never justified.** There was no ADR for SonarQube. No SOC 2 or ISO 27001
control referenced it — `docs/compliance/soc2-controls.md` cites ClamAV, `pnpm audit` and Trivy for
CC6.8, and PR review plus CI gates for CC8.1. The words "SAST" and "static analysis" appear nowhere
in `docs/compliance/` or `05-security-compliance.md`. QM-4 cited §30.10/§30.12 as mandating it, and
§30.12 in turn cited `04-tech-stack` §4.9 as its authority — but §4.9 does not mention SonarQube at
all. The citation chain closed on itself.

**3. Community Edition cannot do what QM-4 asked.** SonarQube Community Build has **no branch
analysis and no pull-request analysis** — it can only analyse a single main branch. A gate phrased
"must pass in CI **before merge**" on "**new code**" is therefore not achievable on it: it can only
report problems after they are already on main. It also has **no taint analysis**. Both features
start at Developer Edition, which is paid. The community `sonarqube-community-branch-plugin` adds
them but is not maintained or supported by SonarSource and has no upgrade path to the commercial
editions.

**4. Meanwhile the repository has no first-party SAST at all.** Trivy, `pnpm audit`, `pip-audit`
and `govulncheck` — the tools §30.10 named as the interim cover — are all **SCA**: they scan
dependencies and container images, never code we wrote. §30.10 also claimed an "ESLint security
plugin — SQL injection, XSS patterns"; no such plugin is installed (`eslint.config.mjs` carries only
`@typescript-eslint`). So the gap the gate was meant to close was, in fact, completely open.

## Decision

Replace SonarQube with three tools, each doing one job:

| Tool                                        | Role                                                                | Blocking?     |
| ------------------------------------------- | ------------------------------------------------------------------- | ------------- |
| **CodeQL** (`.github/workflows/codeql.yml`) | Semantic SAST with cross-file taint analysis over JS/TS, Python, Go | Yes           |
| **Semgrep CE** — `.semgrep/` project rules  | Encodes the `context.md` §Never prohibitions as executable policy   | Yes           |
| **Semgrep CE** — registry rulesets          | OWASP/security-audit packs, reported to code scanning               | No — advisory |
| **jscpd** (`.jscpd.json`)                   | Duplication, as a ratchet                                           | Yes           |

Coverage thresholds stay where they are measured — jest 100/100 and pytest `--cov-fail-under=99`
per Python service — rather than being re-aggregated by a quality-gate server.

The SonarQube Kubernetes manifests and the EKS node `vm.max_map_count` launch template written in
anticipation of this gate are removed.

## Rationale

**Cost.** CodeQL is free for public repositories, and `github.com/thitipongroo/cos` is public
(verified via `gh repo view`). Semgrep CE and jscpd are free. Total licence cost: zero. SonarQube CE
is also free but cannot meet the requirement; meeting it means Developer Edition, which is not.

**Capability.** CodeQL performs the cross-file taint analysis SonarQube CE lacks entirely, and both
CodeQL and Semgrep do real PR analysis, which SonarQube CE cannot.

**Operational cost.** SonarQube needs a PostgreSQL database, an embedded Elasticsearch, two
persistent volumes and a node-level `vm.max_map_count` sysctl — and the conventional way to set that
sysctl (a privileged `initContainer`) is rejected by PodSecurity `restricted` under RKE2
`profile:cis` (ADR-039), _silently_, as recorded in `context.md` §Phase 17. CodeQL and Semgrep need
no server, so this gate works today rather than waiting on an EKS cluster that has not been
provisioned.

**Project-specific enforcement.** `context.md` §Never lists prohibitions that nothing mechanically
checked — call the OpenAI SDK directly instead of through `LLMProvider`, use `console.log` instead
of `@cos/logger`, `float` for money, wildcard CORS, TLS below 1.3, reintroduce WatermelonDB. These
are now Semgrep rules in `.semgrep/`. No off-the-shelf ruleset contains them.

### Alternatives rejected

- **SonarQube Developer Edition** — solves the capability gap but costs money for something two free
  tools do better in this context. Reconsider only if its portfolio/technical-debt reporting is
  wanted for its own sake.
- **SonarQube CE + community branch plugin** — an unsupported third-party plugin in the merge gate,
  with no upgrade path.
- **CodeQL alone** — leaves on-premise/air-gapped customers with no scanner (see Negative below).
- **Semgrep alone** — Semgrep CE is single-file; it cannot follow taint across files.

## Consequences

### Positive

- Zero licence cost; no server to operate, back up or patch.
- The gate is usable immediately — it does not depend on EKS or staging existing.
- Real taint analysis and real PR analysis, neither of which SonarQube CE offered.
- `context.md` §Never becomes enforced rather than aspirational.
- Findings from both scanners land in one place (GitHub code scanning) via SARIF.

### Negative

- **CodeQL cannot run air-gapped.** It requires GitHub. On-premise/air-gapped customers (RKE2
  `profile:cis`, ADR-039) get Semgrep CE only, which is single-file — weaker than the taint analysis
  available in CI. If a customer ever requires evidence of deep SAST inside a disconnected
  environment, this needs revisiting; `gosec` (Go) and `bandit` (Python) are the free offline
  additions to reach for first.
- **The zero-cost argument depends on the repository staying public.** Making it private turns
  CodeQL into a GitHub Code Security licence billed per active committer. That is the single
  assumption most likely to change.
- **Semgrep's registry rules are proprietary.** Since December 2024 they carry the Semgrep Rules
  License: internal business use — scanning our own code — is permitted, but they may not be
  redistributed inside a product or SaaS. COS scans its own code, so this use is permitted, but the
  rules must never be vendored into anything shipped. Rules under `.semgrep/` are ours and carry no
  such condition. A community fork, **Opengrep**, exists — but it is **not a drop-in replacement**,
  and this was measured rather than assumed. Running the identical `.semgrep/` ruleset over this
  repository on 2026-07-21 (Opengrep 1.25.0 vs Semgrep, same machine) gave **Semgrep 0 findings and
  Opengrep 6**. The divergence is a parser difference: Semgrep does not parse
  `tx.$queryRaw<TaskRow[]>` as a generic call — it reads `<` as less-than — so the pattern
  ``$X.$METHOD`...` `` matched none of the fourteen typed calls in `tasks.repository.ts`, while
  Opengrep matched all of them. Switching engines therefore requires re-validating every rule, not
  swapping a binary. Opengrep is also distributed only as a GitHub release binary (~48 MB); it is
  not on PyPI.
  The comparison earned its keep immediately: it exposed that `cos-sql-must-be-schema-qualified`
  had been reporting a clean 0 while checking none of the typed call sites. The rule was rewritten
  to bind the tag with a single metavariable and both engines now agree on every case tested.
  Keeping Opengrep as a periodic cross-check — not as the primary engine — is the value it offers
  here, and it runs offline, which suits the air-gapped constraint above.
- **"0% duplication on new code" was not achievable and has been changed.** jscpd has no concept of
  "new code", and the measured baseline on 2026-07-21 was 2.80% of lines (46 clones across 454 code
  files). The gate is now a ratchet. Most of that was one cluster: `analytics-worker` and
  `kg-ingestion-worker` carried near-identical `internal/coskafka` packages — **23.01% of Go lines**
  — copied rather than shared. That, and the `internal/otel` package copied alongside it, has since
  been extracted to the shared module `libs/go` (ADR-021), which took Go to **0.00%** and the
  repository total to 1.34%; the ratchet was tightened to 1.5% to hold it.
- **The SQL rule went through two designs.** A regex-over-the-file version was written, measured and
  rejected: of 11 hits it flagged `INSERT INTO finance.project_budgets` (already qualified), matched
  a source comment, and reported the line the template literal opened on rather than the offending
  statement. The shipped rule (`cos-sql-must-be-schema-qualified`) instead ANDs a semantic pattern
  for the Prisma raw-SQL call node with a regex evaluated only inside that node's range, so prose
  cannot trigger it and the reported line is the statement itself. Note the residual limitation:
  Semgrep cannot bind a template literal containing interpolation to a metavariable, so the SQL text
  is still matched textually — the semantic part is the _scope_, not the SQL parse.
- **It found one real defect, now fixed:** `packages/@cos/shared/src/kafka/outbox.ts` wrote
  `INSERT INTO outbox_events` unqualified while `OutboxPoller` read and updated
  `platform.outbox_events`. Nothing in the application sets `search_path`, and the old
  `public.outbox_events` had been moved to the `projects` schema by
  `20260605000004_db_refactor_global_schemas` — so the writer and the reader were not guaranteed to
  address the same table, and the failure mode was silent: events accepted, never polled, no error.
  Fixed, with a regression test in `outbox.spec.ts` that was verified to fail when the qualifier is
  removed.

## Addendum — first real scanner run, 2026-07-21

Everything above was written before any of these tools had actually run against this repository.
They have now, locally, via the CodeQL CLI 2.26.1 rather than the workflow — which itself corrects a
claim in the negative consequences above: **CodeQL does not strictly require GitHub to run.** The
CLI builds and analyses databases offline once the CLI and query packs are on disk; what needs
GitHub is the Actions integration, code-scanning upload, and — on a private repo — the licence.
For an air-gapped customer that distinction matters, and the earlier wording obscured it.

**Go — 0 findings** across all four modules (`libs/go` and the three workers), 57 rules. Including
against a deliberately vulnerable fixture: `http.ListenAndServe` with no timeouts, the exact defect
gosec reports as G114, produced **0 CodeQL findings**. So the claim that gosec covers something
CodeQL does not is now measured rather than assumed. Semgrep's registry packs do flag that same
line, but for plaintext HTTP (`use-tls`), not the missing timeout; `p/golang` has no timeout rule.
Three scanners, three different answers about one line of code.

**Python — 31 findings**, 172 rules. Triaged:

- **2 real, now fixed:** `py/partial-ssrf` in `ai-ocr-pipeline` and `ai-transcription-pipeline`.
  Both interpolate a request-supplied `file_id` straight into the file-service URL, and both typed
  it `str`, so `../../admin` walked the path to endpoints on file-service that were never meant to
  be reachable from these services. `file_id` is a UUID everywhere it is stored, so both models now
  type it as `UUID` — the interpolation is safe by construction. Regression tests cover six
  malformed inputs; reverting the type fails six of them. **Neither bandit nor the Semgrep packs
  reported this.**
- **1 already-known false positive:** `py/jinja2/autoescape-false`, the same finding bandit raised
  as B701. The templates are LLM prompts, not HTML.
- **11 unused imports and 17 "ineffectual statements".** The latter are `...` bodies in Protocol
  definitions — idiomatic, false positives. The former were real, and led to the finding below.

**Nothing linted Python at all.** There was no ruff, flake8 or pylint anywhere in CI, which is how
39 unused imports (CodeQL saw 11 of them; it excluded tests) and one mid-file import accumulated.
`ruff check services mlops` is now a blocking step in the lint job, pinned, with the tree cleaned to
pass. Ruff needs no network at run time, so it also holds for the air-gapped case. Removing the dead
imports also removed a stray placeholder class in `digital_twin/router.py` that nothing referenced.

**TypeScript — 95 findings**, 201 rules, 919/919 files (the first attempt failed: the extractor
indexes `node_modules` by default, and `LGTM_INDEX_FILTERS` rejects `**` mid-path — `exclude:**/x/**`
is not valid). Triaged:

- **3 real, now fixed.**
  - `js/request-forgery` ×2 — `keycloak-admin.service.ts` interpolates a realm into the Keycloak
    URL, and `identity.service.ts` takes that realm from an **unverified** token: refresh and logout
    are unauthenticated, and `extractRealmFromToken` base64-decodes the payload without checking a
    signature, so `iss` is attacker-controlled. The `[^/]+` capture blocked a literal slash but
    returned `..`, which the URL then normalised away — `${baseUrl}/realms/../protocol/...` reaches
    a different path on the Keycloak host. The realm is now charset-restricted to `[A-Za-z0-9._-]`
    with `..` rejected outright; seven regression cases fail without it.
  - `js/type-confusion-through-parameter-tampering` — `resolveDateRange` was typed `string` but a
    repeated query parameter arrives as an array, and `Array.prototype.includes` satisfied the
    guard, so an array flowed on into the cache key and the ClickHouse driver. Not injection: those
    queries bind dates as typed parameters (`{startDate:Date}`). The parameter is now `unknown` with
    an explicit `typeof` check — which turns out to be the stronger fix, because reverting it no
    longer compiles (TS2322) rather than merely failing a test.
- **13 false positives from generated files:** every `js/xss-through-dom` is in
  `coverage/lcov-report/sorter.js`, which istanbul writes. The CodeQL workflow should exclude
  `coverage/`; `LGTM_INDEX_FILTERS` did not, since `exclude:coverage` matches only the top level.
- **Also fixed:** `js/user-controlled-bypass` — `VendorAuthMiddleware` picked its authentication
  tier from an unanchored match on `req.path`, so the caller chose which tier ran by shaping the
  URL. Nothing exploitable followed today (every Tier-2 route under `/api/v1/vendor` is a fixed
  literal path, so a crafted URL 404s first), but the safety came from the route table rather than
  the check. The pattern is now anchored to the two genuine Tier-1 routes.
  `js/incomplete-sanitization` — `tenantTopicPattern` escaped only `.` before interpolating an event
  type into `new RegExp`, so `*`, `+`, `|` and `{n,m}` stayed live and a pattern subscription could
  match a different set of topics than it names. `js/indirect-command-line-injection` — the
  enterprise-provisioning `pg_dump | psql` runs through a shell, and both the tenant id and the two
  connection URLs were interpolated raw; a Secrets-Manager password containing a backtick would have
  executed. Both are now validated before the command is built, by pure functions the activity file
  exports so they can be tested (the activity itself is excluded from the coverage gate because it
  provisions real infrastructure). The mobile e2e `execSync` calls became `execFileSync` with an
  argv array — no shell at all — and a `existsSync`-then-read race in an Expo config plugin became a
  read with ENOENT handling.

**The run after those fixes: 95 → 73 findings, and 70 of the 73 are in generated trees** — 67 in
`apps/mobile/android/build` (a Gradle problems-report HTML), 3 in Stryker mutation reports, and the
13 istanbul `sorter.js` XSS from before. `codeql.yml` now excludes `**/build/**`,
`**/reports/mutation/**` and `**/coverage/**`, which leaves exactly **3 first-party findings**:

- `js/missing-rate-limiting` on `credential-service` — **genuinely open.** Nothing rate-limits that
  service: it is absent from `kong-declarative.yml` entirely, and neither it nor `file-service` has
  an in-process limiter (`@fastify/rate-limit` is not in the lockfile). Spec §5 asks for edge limits
  at Kong plus a second independent layer, and §5.9 says the service is reachable only over the
  internal mesh — a mesh that does not exist either (see ADR-021). Which layer should carry it is a
  deployment decision, and adding a dependency to an air-gapped product with an in-memory store that
  multiplies by replica count is not a choice to make silently.
- `js/user-controlled-bypass` and `js/indirect-command-line-injection` — both **fixed above but
  still reported.** The queries do not model an interprocedural regex guard that throws as a
  sanitiser, and tier-by-route is inherently "a user-controlled value decides a check". They are
  structural for these rules, not residue. Worth knowing before anyone treats the count as a score.

Roughly 60 quality findings remain (`js/use-before-declaration` ×29, `js/unreachable-statement` ×13,
`js/useless-assignment-to-local` ×13, and the rest) — all inside the generated trees now excluded.

## References

- [Feature comparison table — SonarQube Community Build](https://docs.sonarsource.com/sonarqube-community-build/feature-comparison-table)
- [SonarQube edition comparison](https://www.sonarsource.com/blog/sonarqube-compare-editions/)
- [GitHub Advanced Security licence billing](https://docs.github.com/en/billing/concepts/product-billing/github-advanced-security)
- [CodeQL supported languages](https://codeql.github.com/docs/codeql-overview/supported-languages-and-frameworks/)
- [Semgrep licensing](https://docs.semgrep.dev/licensing)
- ADR-039 (RKE2 `profile:cis`), ADR-049 (self-hosted OSS pattern)
