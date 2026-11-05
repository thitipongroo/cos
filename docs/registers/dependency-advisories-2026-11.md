# Dependency Advisories — Upgrade Record (2026-11)

**Status:** In progress, carrying product-owner decisions (2026-11-04/05). Each branch's state, commit and merge are
recorded here as they happen. It is kept under `registers/` because most of it is state that goes stale (which branch
is where, what the audit reports now); the decisions it carries are the series' own. · **Series:** one major per
branch, stacked, merged in order. · **Runbook:** [dependency-upgrade-plan.md](../runbooks/dependency-upgrade-plan.md)

## Context

On 2026-11-04 `scripts/ci/verify-before-push.sh` failed its two audit steps (pnpm, pip-audit). The high advisories
were in four packages in pnpm's audit (out of 56 advisories across 33 packages in all), and pip-audit reported 39 for
Pillow, without severities. They showed up
while ADR-110 rounds 4–6 were being verified, but that work did not cause them.

A first attempt fixed all five on one branch and was withdrawn without being committed. Adversarial reviews found
real defects in it, and it broke the runbook's **1 major = 1 PR**. A second attempt then kept one advisory
(decode-uri-component) through an "unreached" suppression in the audit script. That machinery grew with every review,
and pnpm configuration could still blind it. The product owner replaced it with a real fix (D20).

**Scope** is what CI's `dependency-audit` job checks. Its steps run in this order:

1. `pnpm audit` on the root workspace, through `scripts/pnpm-audit.sh`;
2. `govulncheck` on the two Go workers;
3. `pip-audit` on every `services/*/requirements.txt`.

While step 1 fails, CI never reaches steps 2 and 3. `pnpm audit` sees only advisories in GitHub's global database.
`apps/mobile` has its own workspace and lockfile, and nothing audits it. See [Open](#open).

**Citations.** Files under `node_modules` are cited as `<package>@<version>/<file>`, meaning a file of the published
package. Upstream sources are cited by repository and tag.

## Decisions (product owner)

The numbers are the ones used while the work was planned. Decisions about the withdrawn attempts are left out.

| #   | Decision                                                                                                                                                                                                                                                                                  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D2  | An override outside a parent's declared range is allowed if the affected packages' tests pass. If they fail, the override is removed and reported.                                                                                                                                        |
| D3  | The audit gate keeps failing on dev-only advisories. An advisory is accepted only per package, with a reason and a review date.                                                                                                                                                           |
| D6  | Based on `feat/trial-lifecycle`, which is 11 commits ahead of `develop`. **Merge it into `develop` before the first PR of this series.**                                                                                                                                                  |
| D7  | `apps/mobile` is a separate follow-up.                                                                                                                                                                                                                                                    |
| D10 | The runbook applies: 1 major = 1 PR, lowest risk first, and read each major's migration notes first.                                                                                                                                                                                      |
| D11 | The branches are stacked: each starts from the previous one, and they merge in order. The product owner commits each before the next starts.                                                                                                                                              |
| D13 | basic-ftp keeps its override despite a measured NAT regression (branch 1b).                                                                                                                                                                                                               |
| D14 | Suppressions that `pnpm audit --json` no longer reports are removed, with a note.                                                                                                                                                                                                         |
| D17 | For basic-ftp, D2 counts the tests that reach basic-ftp. Any other failure must also happen on 5.3.1.                                                                                                                                                                                     |
| D20 | decode-uri-component is fixed by a plain override, with file-service's Jest made to load it (branch 1c). The audit script holds no suppression. It supersedes D8, D15, D16 and the "unreached" part of D19 — earlier decisions to suppress decode-uri-component instead, not listed here. |
| D21 | The audit runs in an isolated copy under `env -i`, so no pnpm configuration reaches it and it cannot write into the repo.                                                                                                                                                                 |

## The series

| Branch                        | Content                                                                                                                       | State       |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 1a `chore/deps-1a-audit-gate` | the audit script made to report fully, with no suppression; dead suppressions and `auditConfig` removed; no dependency change | implemented |
| 1b                            | basic-ftp override (dev; GHSA-c475-qrg2-pj4r)                                                                                 | not started |
| 1c                            | decode-uri-component override (file-service runtime; GHSA-qr28-fpjm-wq7f) and file-service's Jest                             | not started |
| 2                             | zod 3, first source (`@mermaid-js/mermaid-cli` 11 → 12)                                                                       | not started |
| 3                             | zod 3, second source (`@lhci/cli` 0.15 → 0.16)                                                                                | not started |
| 4                             | @azure/msal-node (5 → 7 via `@azure/identity` 4.14.1)                                                                         | not started |
| 5                             | Pillow (12.3.0 → 13.0.0, `ai-ocr-pipeline`)                                                                                   | not started |

CI's audit job stays red until branch 5 is in. The pnpm step clears after 1b, 1c and 2–4. pip-audit, which CI
reaches only once the pnpm step passes, clears after 5. Both assume that govulncheck passes. It has not been run
locally, because it is not installed here.

Under D3 this is expected. So the runbook's "CI must stay green each wave" is not met for the audit job, by decision.

## Branch 1a — the audit gate

1a changes no dependency, and `pnpm-lock.yaml` is untouched.

### The audit runs in an isolated copy (D21)

`scripts/pnpm-audit.sh` copies three things into a temporary directory and runs pnpm there under
`env -i PATH=… HOME=<temporary>`:

- `package.json`;
- `pnpm-lock.yaml`;
- the `packages:` list of `pnpm-workspace.yaml`, and nothing else from that file.

The temporary directory is removed when the script exits. This means:

- **No outside configuration reaches pnpm.** Every `pnpm_config_*` variable, every `.npmrc` (in the project and in the
  user's home) and every `pnpm-workspace.yaml` setting stays out of the run.
- **pnpm cannot write into the repo**, because it only ever sees the copy.

Limitations:

- A network that needs a proxy or extra CA certificates is not supported.
- The isolated run starts pnpm with an empty `HOME`, so pnpm downloads its pinned version from the registry on each
  local run (about 3 s, 67 MB, measured on macOS). That download is not integrity-pinned, because `packageManager`
  carries no `+sha512`.
- **The CI path is unmeasured.** All of the measurements here were made on macOS. There, a global pnpm 11.1.3 hands
  off to the pinned version. Whether `env -i` with only `PATH` and a temporary `HOME` works under
  `pnpm/action-setup` on ubuntu-latest will first be seen in the CI of this branch's PR.

**Version.** The script holds the pnpm version it was verified against: `VERIFIED_PNPM=11.22.0`. It fails if
`package.json`'s `packageManager` names another version or another package manager. A `+sha…` suffix is ignored.

The script's own `pnpm --version` comparison cannot catch a version change, because pnpm switches to whatever
`packageManager` names. This was measured: with `pnpm@11.21.0` in a scratch `package.json`, pnpm ran 11.21.0. So
bumping `packageManager` fails the gate until the flags below are re-verified and `VERIFIED_PNPM` is updated.

Tested in a scratch worktree:

| `packageManager`        | Result                               |
| ----------------------- | ------------------------------------ |
| `pnpm@11.21.0`          | "verified against pnpm 11.22.0"      |
| `yarn@4.5.0`            | "names 'yarn', not pnpm"             |
| field missing           | "package.json has no packageManager" |
| `pnpm@11.22.0+sha512.…` | runs                                 |

**Second line of defence.** Inside the copy, the script runs:

```sh
pnpm audit --json --audit-level info --config.production=false --config.dev=false --config.only=all \
  --config.optional=true --registry=https://registry.npmjs.org/ --config.audit-config= --config.fix=false \
  --lockfile-dir=.
```

It also compares the advisories with `metadata.vulnerabilities`, severity by severity, and fails if
`metadata.totalDependencies` is missing or 0.

`only=all` is not a value pnpm documents. pnpm treats an unknown `only` as "all", which is one reason the version is
pinned. The registry is pinned because pnpm builds its metadata from the same response, so a mirror without audit data
would still agree with itself.

**Never run `pnpm audit --ignore` in the repo.** It writes `auditConfig.ignoreGhsas` into `pnpm-workspace.yaml`. That
happened once during this work, and the block was removed straight away.

#### Measured (pnpm 11.22.0, 2026-11-05)

This tree has 56 advisories: 4 high, 47 moderate and 5 low. Path counts are the sum of `findings[].paths`. pnpm caps each
finding at 100 paths (`MAX_PATHS_PER_FINDING`), and five findings here reach that cap, so the totals are capped.

**Without the isolation, plain `pnpm audit --json`.** Settings in `pnpm_config_*` environment variables or in a scratch
worktree's `pnpm-workspace.yaml` blind or change it:

| Setting                                    | Result                       |
| ------------------------------------------ | ---------------------------- |
| `only=prod`, `production=true`             | 49 (2 high), 340 paths       |
| `only=dev`, `dev=true`                     | 35 (2 high), 618 paths       |
| `optional=false`                           | 56 (4 high), 764 paths       |
| `audit_level=critical`                     | 0 advisories                 |
| `auditConfig.ignoreGhsas` / `audit.ignore` | 55 (3 high), metadata high 4 |
| `fix: override`                            | the yaml file is rewritten   |

In a later review, `lockfileDir` pointed at an empty lockfile, set in the environment or in the yaml, gave "Audit
PASSED". So did a registry returning `{}`. The metadata agreed in both cases. With `ignoreUnfixable` or `ignore` in the
yaml, pnpm wrote `auditConfig` into the file.

**With the script.** The script reported the same 4 high advisories every time. In the scratch worktree,
`pnpm-workspace.yaml` and the `.npmrc` placed there were byte-identical before and after each run (checksums). The
repo has no root `.npmrc`. The full, isolated run audits 2,323 dependencies with 897 paths, the baseline the table
above departs from. The settings tried, each on its own:

- **Environment:** `pnpm_config_only=prod`, `pnpm_config_dev=true`, `pnpm_config_optional=false`,
  `pnpm_config_audit_level=critical`, `pnpm_config_lockfile_dir=<empty>`, `PNPM_CONFIG_LOCKFILE_DIR=<empty>`,
  `pnpm_config_registry=http://127.0.0.1:9/` and `pnpm_config_ignore_unfixable=true`.
- **`pnpm-workspace.yaml` (scratch worktree):** `lockfileDir`, `registry`, `ignoreUnfixable`, `ignore`,
  `auditConfig.ignoreGhsas`, `audit.ignore`, `fix: override`, `only: prod`, `optional: false` and
  `auditLevel: critical`.
- **Project `.npmrc` (scratch worktree):** `lockfile-dir`, `registry`, `audit-level=critical` and `only=prod`.
- **User `.npmrc`:** `HOME` set to a directory whose `.npmrc` held a dead registry, `audit-level=critical` and
  `only=prod`.

`<empty>` is a directory whose `pnpm-lock.yaml` has no packages.

### The script

- **Failure.** The script fails on any high or critical advisory, and suppresses nothing. Accepting an advisory instead
  of fixing it would need a product-owner decision for that package and its own design.
- **Fails closed** on:
  - output that is not UTF-8, or not JSON;
  - a missing `advisories` map;
  - `metadata.vulnerabilities` missing or non-integer;
  - `metadata.totalDependencies` missing or 0;
  - an advisory that is not an object;
  - an advisory with a missing or unknown severity. pnpm 11.22.0 already drops unknown severities itself, so this
    check is defensive.
  - a per-severity count that differs from the metadata;
  - a pnpm that is not the pinned version, or cannot run;
  - an unreadable `packageManager`;
  - a missing `packages:` list.
- **Output.** One line-buffered stream, so a CI log reads in order. pnpm's stderr is always printed.

**Tested** with a stub `pnpm` first on `PATH`. Because the script runs pnpm under `env -i`, the stub reads its case
from files next to itself:

- `fixture` holds the path of the JSON to print;
- `stderr` holds what to write to stderr;
- `version` holds what `--version` prints.

It does not read the environment:

| Fixture                                         | Exit | Output                                                               |
| ----------------------------------------------- | ---- | -------------------------------------------------------------------- |
| `real` (this tree)                              | 1    | 4 unresolved: basic-ftp, zod, @azure/msal-node, decode-uri-component |
| `no-high`, with a warning on stderr             | 0    | the warning, then "Audit PASSED"                                     |
| `hidden` (high listed 0, metadata 4)            | 1    | "disagree (high: metadata 4, listed 0) … ignore list"                |
| `hidden-low` (low metadata one more)            | 1    | "disagree (low: metadata 6, listed 5)"                               |
| `listed-more` (high metadata 0)                 | 1    | "disagree … pnpm's output is inconsistent"                           |
| `meta-str` (`"high": "4"`), `no-meta`           | 1    | "no usable metadata.vulnerabilities"                                 |
| `zero-deps`, `no-deps-count`                    | 1    | "pnpm audit saw no dependencies"                                     |
| `sev-upper` (`"HIGH"`, defensive)               | 1    | counted, unresolved                                                  |
| `sev-missing`, `sev-unknown` (`"severe"`)       | 1    | "has no known severity"                                              |
| `adv-str` (an advisory that is a string)        | 1    | "is not an object"                                                   |
| `error` (`{"error": {"code": "ENOTFOUND"}}`)    | 1    | "returned no advisories map"                                         |
| `garbage`, with a message on stderr             | 1    | "could not parse pnpm audit JSON", then the message                  |
| `nonutf8`                                       | 1    | "pnpm audit output is not UTF-8"                                     |
| `no-high` with the stub's version set to 11.1.3 | 1    | "pnpm 11.1.3 is running; this gate is written for … 11.22.0"         |

`zero-deps` is `real` with no advisories, all-zero counts and `totalDependencies: 0`. `no-deps-count` is the same
without `totalDependencies`. The other fixtures come from `python3 make-fixtures.py <real.json> <dir>`, where
`real.json` is the output of the `pnpm audit` command above, run inside an isolated copy as the script runs it. Run in
the repo instead, any pnpm configuration there leaks in:

```python
import copy, json, sys
src, out = json.load(open(sys.argv[1])), sys.argv[2]
SEV = ("info", "low", "moderate", "high", "critical")
def recount(d):
    m = dict.fromkeys(SEV, 0)
    for v in d["advisories"].values():
        s = v.get("severity") if isinstance(v, dict) else None
        if isinstance(s, str) and s.lower() in m: m[s.lower()] += 1
    d["metadata"]["vulnerabilities"] = m
def case(name, edit=None, recompute=True):
    d = copy.deepcopy(src)
    if edit: edit(d)
    if recompute and isinstance(d.get("advisories"), dict) and isinstance(d.get("metadata"), dict): recount(d)
    json.dump(d, open(f"{out}/{name}.json", "w"))
low_only = lambda d: d.update(advisories={k: v for k, v in d["advisories"].items() if v["severity"] not in ("high", "critical")})
first = lambda d: next(iter(d["advisories"].values()))
case("real")
case("no-high", low_only)
case("hidden", lambda d: (low_only(d), d["metadata"]["vulnerabilities"].update(high=4)), recompute=False)
case("hidden-low", lambda d: d["metadata"]["vulnerabilities"].update(low=d["metadata"]["vulnerabilities"]["low"] + 1), recompute=False)
case("listed-more", lambda d: d["metadata"]["vulnerabilities"].update(high=0), recompute=False)
case("meta-str", lambda d: d["metadata"]["vulnerabilities"].update(high="4"), recompute=False)
case("no-meta", lambda d: d.pop("metadata"), recompute=False)
case("sev-upper", lambda d: (low_only(d), first(d).update(severity="HIGH")))
case("sev-missing", lambda d: (low_only(d), first(d).pop("severity")))
case("sev-unknown", lambda d: (low_only(d), first(d).update(severity="severe")))
case("adv-str", lambda d: (low_only(d), d["advisories"].update({"x": "oops"})))
json.dump({"error": {"code": "ENOTFOUND", "summary": "registry unreachable"}}, open(f"{out}/error.json", "w"))
open(f"{out}/garbage.json", "w").write("not json at all")
open(f"{out}/nonutf8.json", "wb").write(b'{"advisories": {"\xff\xfe": 1}}')
```

The stub `pnpm`:

```sh
#!/bin/sh
D=$(dirname "$0")
[ "$1" = --version ] && { cat "$D/version" 2>/dev/null || echo 11.22.0; exit 0; }
[ "$1" = audit ] || exit 99
cat "$(cat "$D/fixture")"; [ -s "$D/stderr" ] && cat "$D/stderr" >&2; exit 1
```

### Removed (D14)

None of these ten suppressions was reported by `pnpm audit --json` on 2026-11-04:

- tar ×6, via the expo@51 CLI. No longer in the audited tree since `apps/mobile` left this workspace (`3179aef0`,
  2026-06-26).
- undici@5 ×3, via testcontainers. The `undici@<6.29.1` override leaves 6.29.1 only.
- serialize-javascript, via next-pwa@5. Resolved by replacing next-pwa with Serwist (ADR-047).

`pnpm-workspace.yaml`'s `auditConfig.ignoreCves` block went with them. It held 8 CVE ids: the 6 for tar and 2 of the
undici ones. The third undici advisory, GHSA-vxpw-j846-p89q, has CVE-2026-12151 (GitHub advisory API), which the block
never listed. The history is kept in the script's comment.

Updated alongside:

- the CI step comment in `.github/workflows/ci.yml`;
- the runbook's `auditConfig` mentions. The 2026-06-30 snapshot keeps its legend, with a note added.
- the comment in `scripts/ci/check-lockfile-staged.sh` describing what its `overrides` extraction reads, and its section
  heading.

ADR-042, ADR-043 and ADR-044 still describe `auditConfig` in the present tense. They are left alone as history.

### Gates (1a)

Reported in the hand-off once they have run on this version of 1a:

- `pnpm install --frozen-lockfile`;
- `verify-before-push.sh --full`;
- a Docker build of the backend and web images.

## Branches 1b and 1c (not started)

Each gets its own plan, its own measurements and its own section here when it starts. Material from the withdrawn
attempts is not evidence for them until it is re-run. Two facts already checked carry forward:

- **basic-ftp:** only GHSA-c475-qrg2-pj4r of its four advisories is in the global database. The other three
  (GHSA-5rfr-xx34-2xxv, GHSA-r4jh-29pc-gfqr, GHSA-5pm8-86m8-9m6r) return 404 there, so the gate cannot see them, but
  the same override floor (6.2.4) fixes them: the basic-ftp `CHANGELOG.md` at tag `v6.2.4` (`patrickjuchli/basic-ftp`)
  names each of them in its 6.2.2, 6.2.3 and 6.2.4 entries.
- **decode-uri-component 0.5.1:** it is ESM-only, and Jest cannot load it as file-service's config stands. That is
  what 1c has to solve.

## Open

- **`apps/mobile` (D7).**
  - Its own lockfile has expo-router → `query-string@7.1.3` → `decode-uri-component@0.2.2`.
  - react-navigation's `getStateFromPath` calls `queryString.parse` on deep-link input.
  - Nothing audits that lockfile.
- **file-service MinIO integration suite.**
  - Its image `quay.io/minio/minio:RELEASE.2024-09-13T20-26-02Z` can no longer be pulled. quay.io returns 401, and the
    image is not on docker.io.
  - The series did not cause this.
- **`openapi freshness`.**
  - It reports `auth` and `ai` stale since commit `10be1567`.
  - `requirements.txt` counts as source for `ai`, so branch 5 hits this again.
- **`tests/e2e/specs/daily-report.spec.ts:70-71`.** It uses an undeclared `notificationBell` (TS2552). This predates
  the series.
- **`docs/architecture/technical-design/phase-07-finance-service.md`.** Its mermaid block has a parse error on line 13.
  This predates the series.
- **The `docs/README.md` assessments row.** Its entry point is `registers/data-flow-map.md`, which commit `fe35fff7`
  reclassified as a register. This predates the series.
