# ADR-054: CodeQL replaces SonarQube as the SAST gate

**Date:** 2026-08-22
**Status:** Accepted
**Deciders:** Product owner
**Tags:** security, infra

---

## Context

`30-testing-strategy` §30.10 and `.claude/rules/qm-04-security.md` both name **SonarQube** (Community Edition,
self-hosted on EKS) as the mandatory SAST gate, with a quality gate of 0 new bugs, 0 new
vulnerabilities, 100% line coverage, 100% branch coverage and 0% duplication on new code.

Both documents also carry a deferral marker:

> ⏸ **DEFERRED:** SonarQube CI gate deferred pending EKS server setup. Trivy container scan +
> `pnpm audit` + `pip-audit` + `govulncheck` cover security scanning in interim. Must be
> operational before Phase 19 automated check #4 runs (Stage 1→2 gate).

The deferral is a hard blocker on the Stage 1→2 transition: Phase 19 automated check #4 cannot pass
while no SAST runs. The blocking cause is not the tool's suitability — it is that SonarQube requires
a long-lived server to be provisioned, operated and secured on EKS before a single scan can run.

Recorded as `docs/architecture/test-design/escalation-register.md` §35.13 ESC-11; the affected
test cases are `TC-P16-SEC-005` and `TC-P19-MAN-006`.

## Decision

Replace SonarQube with **GitHub CodeQL** as the SAST gate.

- CodeQL runs as a GitHub Actions job (`github/codeql-action`) — **no server to provision**.
- Languages analysed: JavaScript/TypeScript, Python and Go — covering the backend, the web and
  mobile apps, the AI services and the Go workers.
- The job blocks PR merge on any alert of severity **High** or above, matching the §30.12 gate
  "Security SAST — blocks PR merge (High severity)".
- Coverage thresholds stay where they are already enforced — in each package's `jest.config.js`
  (100% lines / 100% branches, QM-1) and in `mutation-tests.yml`. They were never actually enforced
  by SonarQube, since the gate has never run.
- The interim scanners are **retained, not replaced**: Trivy (container images), `pnpm audit`,
  `pip-audit`, `govulncheck` (dependencies) and GitLeaks (secrets) continue to run.

## Rationale

- **It unblocks the Stage 1→2 gate now.** The repository is public
  (`github.com/thitipongroo/cos`), so CodeQL is available at no cost and with no additional
  infrastructure. SonarQube's blocker was operational, and that blocker disappears entirely.
- **No new operational surface.** A self-hosted SonarQube adds a server, a database, an ingress, a
  backup path, an upgrade path and a set of credentials to rotate — all of which fall under QM-4,
  QM-12 and QM-18 obligations for something that only inspects source code.
- **Native multi-language coverage.** One job covers the four languages in this monorepo.
- **Alternatives considered:**
  - _Keep SonarQube and provision the server._ Rejected: it re-imposes the exact operational cost
    that caused the deferral, and delays the Stage 1→2 gate by the length of that infrastructure
    work.
  - _Semgrep OSS._ Viable and server-free, but CodeQL is native to the CI platform already in use,
    needs no third-party token for a public repository, and its results surface directly in the
    repository's security tab.
  - _Leave the gate deferred._ Rejected: it leaves a Stage 1→2 blocker open with no owner and no
    date, and leaves the codebase with no static analysis beyond ESLint's security plugin.

## Consequences

### Positive

- Phase 19 automated check #4 becomes runnable — the Stage 1→2 blocker is removed.
- No server, credentials or backup path to operate for SAST.
- SAST results are visible in the repository security tab and in PR annotations.

### Negative

- CodeQL does not report code duplication, so the "0% duplication on new code" clause of the old
  SonarQube quality gate has no enforcement mechanism. It is dropped rather than silently claimed.
- Free CodeQL depends on the repository staying **public**. If the repository is made private, GitHub
  Advanced Security is required, and this ADR must be revisited.
- Rule sets differ from SonarQube's, so historical SonarQube findings do not map one-to-one. There
  are none, since the gate never ran.

### Neutral

- Coverage enforcement is unchanged — it always lived in the Jest configs, not in SonarQube.
- The interim dependency and container scanners are unchanged.

## References

- `docs/specifications/30-testing-strategy.md` §30.10 (Security Testing), §30.12 (CI/CD Test Gates)
- `.claude/rules/qm-04-security.md` (Security)
- `docs/architecture/test-design/README.md` §35.13 ESC-11, `TC-P16-SEC-005`, `TC-P19-MAN-006`
- `context/phases/phase-16-security.md`, §Phase 19 automated check #4
