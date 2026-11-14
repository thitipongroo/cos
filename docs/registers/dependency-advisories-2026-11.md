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

| #   | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D2  | An override outside a parent's declared range is allowed if the affected packages' tests pass. If they fail, the override is removed and reported.                                                                                                                                                                                                                                                                                                                                                |
| D3  | The audit gate keeps failing on dev-only advisories. An advisory is accepted only per package, with a reason and a review date.                                                                                                                                                                                                                                                                                                                                                                   |
| D6  | Based on `feat/trial-lifecycle`, which is 11 commits ahead of `develop`. **Merge it into `develop` before the first PR of this series.**                                                                                                                                                                                                                                                                                                                                                          |
| D7  | `apps/mobile` is a separate follow-up.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| D10 | The runbook applies: 1 major = 1 PR, lowest risk first, and read each major's migration notes first.                                                                                                                                                                                                                                                                                                                                                                                              |
| D11 | The branches are stacked: each starts from the previous one, and they merge in order. The product owner commits each before the next starts.                                                                                                                                                                                                                                                                                                                                                      |
| D13 | basic-ftp keeps its override despite a measured NAT regression (branch 1b).                                                                                                                                                                                                                                                                                                                                                                                                                       |
| D14 | Suppressions that `pnpm audit --json` no longer reports are removed, with a note.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| D17 | For basic-ftp, D2 counts the tests that reach basic-ftp. Any other failure must also happen on 5.3.1.                                                                                                                                                                                                                                                                                                                                                                                             |
| D20 | decode-uri-component is fixed by a plain override, with file-service's Jest made to load it (branch 1c). The audit script holds no suppression. It supersedes D8, D15, D16 and the "unreached" part of D19 — earlier decisions to suppress decode-uri-component instead, not listed here.                                                                                                                                                                                                         |
| D21 | The audit runs in an isolated copy under `env -i`, so no pnpm configuration reaches it and it cannot write into the repo.                                                                                                                                                                                                                                                                                                                                                                         |
| D23 | basic-ftp's override floor is `^6.2.6`, which also fixes GHSA-2w5v-vj22-jp27.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| D24 | basic-ftp 6.2.6 is taken before the release-age window closed, with a `minimumReleaseAgeExclude` entry that gives the reason and the date it can go.                                                                                                                                                                                                                                                                                                                                              |
| D25 | Branch 2 moves puppeteer within mermaid-cli 11's peer range instead of upgrading mermaid-cli to 12. mermaid-cli 12 needs puppeteer `^25` too and moves no zod by itself; mermaid-cli 12 is a separate, later choice.                                                                                                                                                                                                                                                                              |
| D26 | Lighthouse 13 lowers /login's simulated LCP far below Lighthouse 12's. The LCP budget stays 3200 in branch 3; it is re-measured on ubuntu-latest under 13 afterwards (Open).                                                                                                                                                                                                                                                                                                                      |
| D27 | msal-node is fixed by moving `@azure/identity` 4.13.1 → 4.14.1 inside `@confluentinc/schemaregistry`'s declared `^4.13.0`, not by removing the unused `@confluentinc/schemaregistry` from backend; removing it is an Open item.                                                                                                                                                                                                                                                                   |
| D28 | pnpm major 12 is the spec's normative major (was 11; the repo has been on 12.18.0 since `de660667`), and `engines.pnpm` is `>=12.0.0`.                                                                                                                                                                                                                                                                                                                                                            |
| D29 | Status values the code compares (to pick a colour) keep their code values; only their display goes through `t()`.                                                                                                                                                                                                                                                                                                                                                                                 |
| D30 | Demo sentences written in a page's JSX are translated, their figures and names passed as `{placeholders}`; `SAMPLE_*` / `INITIAL_*` records stay as data.                                                                                                                                                                                                                                                                                                                                         |
| D31 | `apps/mobile` takes the root's `packageManager` pin (pnpm 12.18.0 + sha512), and its lockfile is regenerated with pnpm 12.                                                                                                                                                                                                                                                                                                                                                                        |
| D32 | OCR scales a 32-bit integer (`I`) or float (`F`) image from its own value range to 8-bit before tesseract; 16-bit images, which read fine, are left alone; no data from tesseract is empty text, confidence 0, and a logged warning.                                                                                                                                                                                                                                                              |
| D33 | Pillow is pinned where it is used outside `services/*` (`mlops/requirements-mlflow.txt`, new `apps/mobile/scripts/requirements.txt`); CI audits the mobile scripts (blocking) and `mlops` (report only, until its own advisories are fixed).                                                                                                                                                                                                                                                      |
| D34 | mlops moves to the lowest versions with no advisory — apache-airflow 3.3.2, mlflow 3.17.2 (client and the `ghcr.io/mlflow/mlflow` server image, manifests only), feast 0.67.0 — and CI's mlops audit becomes blocking.                                                                                                                                                                                                                                                                            |
| D35 | The MLflow server runs `ghcr.io/mlflow/mlflow:v3.17.2-full` (the plain image lacks psycopg2 and boto3); no migration initContainer (3.17.2 migrates a 3.14 store itself, because it adds tables — checked per version bump); the k8s Deployment uses `strategy: Recreate`.                                                                                                                                                                                                                        |
| D36 | The drone mission screen's export buttons say, in Thai and English, that report export is not available yet; drone-capture's "Close" link beside Recent Missions becomes a "View all" button.                                                                                                                                                                                                                                                                                                     |
| D37 | The drone mission screen's two export buttons read "Export report (coming soon)" / "ส่งออกรายงาน (เร็วๆ นี้)" — no "Signed", no "PDF" — as text and as accessibility label.                                                                                                                                                                                                                                                                                                                       |
| D38 | apps/mobile's lockfile is cleared in one branch (`fix/mobile-audit`), not one major per PR (for that branch this departs from D10): every high and critical, and the moderates whose override passes the checks.                                                                                                                                                                                                                                                                                  |
| D39 | Any re-resolution of apps/mobile's lockfile (bumping axios; updating handlebars alone does the same, measured) moves `@expo/metro-runtime` — app runtime code, in the shipped bundles — from a stale 3.2.3 (outside expo-router 56's peer `^56.0.21`) to 56.0.21, adds `react-dom` 19.3.1 / `scheduler` 0.28.0 as its peers (react is 19.2.3: a new unmet peer, not bundled, web is not a target), and gives `@wix-pilot/*` `expect` 29.7.0 (clears an old unmet peer); accepted with the branch. |
| D40 | The backend and file-service images move from `node:24-alpine` to `node:24-slim` (glibc), API and worker alike, so their Temporal workers can load `@temporalio/core-bridge` (glibc builds only); not a separate worker image.                                                                                                                                                                                                                                                                    |
| D41 | The five Temporal workers (backend 3, file-service 2) pass a connection to `TEMPORAL_ADDRESS` / `config.temporal.address` to `Worker.create`, fixed with D40.                                                                                                                                                                                                                                                                                                                                     |
| D42 | `docker-compose.yml`'s `temporal-worker` joins `cos-network`, fixed with D40.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| D43 | CI's `security-scan` job is made to pass in full — the repository scan and all ten images it builds — not only the backend and file-service images.                                                                                                                                                                                                                                                                                                                                               |
| D44 | The image scan reads `.trivyignore.yaml`, which gains a `secrets:` section with one entry: rule `gcp-service-account`, scoped to `/opt/venv/lib/python3.12/site-packages/anthropic/**` (docstring false positives in the anthropic SDK in ai-gateway).                                                                                                                                                                                                                                            |
| D45 | `runMigrationsActivity` runs the prisma CLI shipped in the backend image (prisma a production dependency; schema, migrations and `prisma.config.ts` in the image), by node without a shell, with `DIRECT_DATABASE_URL` set to the tenant database.                                                                                                                                                                                                                                                |
| D46 | `migrateDataActivity` copies the tenant's rows in process — COPY per table, parents first, in one target transaction with `session_replication_role = replica`, never deleting rows of the tenant already in the target — instead of `pg_dump \| psql`.                                                                                                                                                                                                                                           |
| D47 | The copy keeps the ten schemas the activity named; the other five schemas with `tenant_id` are investigated and recorded, with no routing change.                                                                                                                                                                                                                                                                                                                                                 |
| D48 | Enterprise provisioning switches routing after the approval and the copy, with the tenant paused (`is_active = false`) from the copy to the verification, instead of before the approval wait; runs begun earlier keep the old order (`patched('copy-before-switch')`).                                                                                                                                                                                                                           |
| D49 | A failure from the pause to the verification puts `dedicated_db_url` back to NULL and `is_active` back to its value before the pause, then fails the run (RESTORED); the dedicated database and RDS instance stay for SYSTEM_ADMIN.                                                                                                                                                                                                                                                               |
| D50 | Every path into a tenant's data without the Keycloak JWT — Kafka consumers (`runInTenantContext`), the vendor, contract-signing and data-subject guards, and `getDbUrlForTenant` (`withTenantTx`, notifications) — routes to the tenant's dedicated database and refuses an inactive or unknown tenant as the JWT path does (401, or a thrown error that the consumer retries and then sends to the DLQ).                                                                                         |
| D51 | The provisioning pause drains the tenant by a Postgres advisory lock: every tenant transaction on the shared database holds the tenant's lock shared and checks `is_active`; the pause takes it exclusive around its UPDATE, so it waits for transactions in flight and every later one is refused.                                                                                                                                                                                               |
| D52 | A data export, and its notice to the subject, wait out a provisioning pause (the run's state, asked of Temporal) for up to 24 h, retrying every minute; a deactivated tenant is refused at once.                                                                                                                                                                                                                                                                                                  |
| D53 | After the resume (or the restore) the provisioning workflow republishes the tenant's DLQ entries that failed with `TenantInactiveError` since the pause, onto their original topics with the `tenant_id` header restored.                                                                                                                                                                                                                                                                         |
| D54 | Each tenant sweep (permit expiry, notification escalation, cashflow risk, ledger reconciliation) runs on the shared database only for tenants active and still there (writes under the D51 pause lock) and once per active tenant in its dedicated database (app-role URL, tenant transaction).                                                                                                                                                                                                   |
| D55 | The provisioning copy also moves `crm`, `equipment_telemetry` and `workforce_telemetry` (added to `TENANT_DATA_SCHEMAS`); routing is unchanged, as the app already reads them from the dedicated database.                                                                                                                                                                                                                                                                                        |
| D56 | No foreign key crosses between `platform` and the tenant schemas: the three that did are dropped on every database (one migration), and the reference that only the key checked (a trading relationship's vendor) is checked in code.                                                                                                                                                                                                                                                             |
| D57 | `workforce_telemetry.attendance_logs` and `.timesheets` get tenant-leading indexes (`(tenant_id, recorded_at DESC)`, `(tenant_id, period_date DESC)`).                                                                                                                                                                                                                                                                                                                                            |

## The series

| Branch                                  | Content                                                                                                                       | State                |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| 1a `chore/deps-1a-audit-gate`           | the audit script made to report fully, with no suppression; dead suppressions and `auditConfig` removed; no dependency change | committed `c94c183a` |
| 1b `chore/deps-1b-basic-ftp`            | basic-ftp override (dev; GHSA-c475-qrg2-pj4r and four repository-only advisories)                                             | committed `1a0b9f0b` |
| 1c `chore/deps-1c-decode-uri-component` | decode-uri-component override (file-service runtime; GHSA-qr28-fpjm-wq7f) and file-service's Jest                             | committed `8310449d` |
| 2 `chore/deps-2-puppeteer`              | zod 3, first source: puppeteer 25.5.0 → 25.16.0 under `@mermaid-js/mermaid-cli` 11 (D25)                                      | committed `87d2e8fa` |
| 3 `chore/deps-3-lhci`                   | zod 3, second source: `@lhci/cli` 0.15.1 → 0.16.0 (lighthouse 12.6.1 → 13.6.0); basic-ftp release-age entry removed           | committed `97791d75` |
| 4 `chore/deps-4-azure-identity`         | @azure/msal-node 5.2.2 → 7.1.2 via `@azure/identity` 4.13.1 → 4.14.1 (backend runtime; D27)                                   | committed `341d2b0a` |
| 5 `chore/deps-5-pillow`                 | Pillow 12.3.0 → 13.0.0 (`ai-ocr-pipeline` runtime; 39 advisories)                                                             | implemented          |

CI's audit job stays red until branch 5 is in. The pnpm step clears after 1b, 1c and 2–4 (measured: it first passes
on branch 4). pip-audit, which CI reaches only once the pnpm step passes, clears after 5 (measured on branch 5: all
five services clean). Both assume that govulncheck passes. It has not been run locally, because it is not installed
here.

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
  local run (about 3 s, 67 MB, measured on macOS). That download was not integrity-pinned, because `packageManager`
  carried no `+sha512` at the time. It does now; whether this path checks the hash was not tested (see
  [One pnpm pin, with its hash](#one-pnpm-pin-with-its-hash-chorepnpm-pin-hash)).
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

1a's tree had 56 advisories: 4 high, 47 moderate and 5 low (1b's has 55, 3 high). Path counts are the sum of
`findings[].paths`. pnpm caps each finding at 100 paths (`MAX_PATHS_PER_FINDING`), and five findings here reach that
cap, so the totals are capped.

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

**With the script.** On 1a's tree, the script reported the same 4 high advisories every time. In the scratch worktree,
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
| `real` (1a's tree)                              | 1    | 4 unresolved: basic-ftp, zod, @azure/msal-node, decode-uri-component |
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

## Branch 1b — basic-ftp 5.3.1 → 6.2.6

This branch adds the override `'basic-ftp@<6.2.6': '^6.2.6'` to `pnpm-workspace.yaml`. The lockfile diff is that
override line, basic-ftp's package and snapshot entries, and get-uri's dependency line.

### The five advisories 6.2.6 clears

6.2.6 is the lowest release that clears all five advisories known on 2026-11-05.

There is one conflict between sources. GHSA-2w5v's own metadata
(`gh api repos/patrickjuchli/basic-ftp/security-advisories/GHSA-2w5v-vj22-jp27`) gives its vulnerable range as
`< 6.2.5`, with 6.2.6 patched, which would leave 6.2.5 unaffected. But:

- 6.2.5's `basic-ftp@6.2.5/dist/Client.js:650` still has the old `basename` check;
- the CHANGELOG names the fix in 6.2.6.

The code and the CHANGELOG are taken over the metadata (product-owner decision after review). Sources:

- the `CHANGELOG.md` of `patrickjuchli/basic-ftp` at tag `v6.2.6`, which names each GHSA;
- `gh api /advisories/<GHSA>` (GitHub's global advisory endpoint): GHSA-c475 returns high, the other four 404.

| Advisory            | In the global database | Fixed in | What                                                                                      |
| ------------------- | ---------------------- | -------- | ----------------------------------------------------------------------------------------- |
| GHSA-c475-qrg2-pj4r | yes, high              | 6.2.1    | quadratic CPU parsing a Unix `LIST` reply                                                 |
| GHSA-5rfr-xx34-2xxv | no (404)               | 6.2.2    | quadratic CPU detecting `MLSD` and parsing a `PASV` reply                                 |
| GHSA-r4jh-29pc-gfqr | no (404)               | 6.2.3    | control characters in a password, or in the path of a resumed download, crash the process |
| GHSA-5pm8-86m8-9m6r | no (404)               | 6.2.4    | a `__proto__` fact in `MLSD` breaks listing                                               |
| GHSA-2w5v-vj22-jp27 | no (404)               | 6.2.6    | path traversal in `downloadToDir()`                                                       |

`pnpm audit` sees only GHSA-c475. get-uri calls `downloadTo()`, never `downloadToDir()`. The published
`basic-ftp@6.2.5` → `basic-ftp@6.2.6` diff (`diff -r` of the two npm tarballs) changes three things:

- `dist/Client.js`: one new `require` line, and `_downloadFromWorkingDir`, which is what `downloadToDir` uses;
- `package.json`;
- new `dist/safePathNames.js` and `dist/safePathNames.d.ts`.

### The release-age exception (D24)

The repo sets no `minimumReleaseAge`, so pnpm's default of 24 hours applies. The release has two timestamps:

- 2026-11-04T20:56:39Z, which pnpm 11.22.0 reported here from 6.2.6's provenance attestation;
- 20:58:51.621Z, npm's `time` field. pnpm can use this one instead when its full-metadata cache already holds it.

On `pnpm install`, pnpm added `basic-ftp@6.2.6` to `minimumReleaseAgeExclude` by itself. The entry stays, with a
comment giving the reason.

**The entry is required while the window is open.** With it removed, `pnpm install --frozen-lockfile` failed (scratch
worktree, `--lockfile-only`) with `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION … basic-ftp@6.2.6 was published at
2026-11-04T20:56:39.000Z`. A filtered install fails the same way. That frozen install runs in 12 of the 20 jobs in
`.github/workflows/ci.yml`, on pnpm 11.22.0.

The four Dockerfiles that run pnpm (web, backend, credential-service and file-service) built with the entry in place.
Three of them pin `pnpm@11.9.0` through corepack, and whether they would fail without the entry was not measured.

The entry can be removed from 2026-11-05T20:58:52Z, the later of the two timestamps. That is tracked under
[Open](#open). pnpm 11.22.0 only ever appends to `minimumReleaseAgeExclude`. Nothing removes the entry or
flags it as stale, so it has to be removed by hand.

### Where it runs, and upstream

basic-ftp's network code runs only for a PAC file fetched over `ftp://`. Its module code loads for any `pac+…` URL,
because `get-uri@6.0.5/dist/index.js:11` requires `./ftp` eagerly.

- `proxy-agent@6.5.0/dist/index.js:40-47` loads `pac-proxy-agent` lazily, and lines 60-64 map the `pac+…` schemes to
  it.
- proxy-agent's real parent is `@lhci/cli`. It is also linked into `@puppeteer/browsers@3.1.0` as an optional peer
  that declares `proxy-agent >=8.0.1`. pnpm fills that peer with 6.5.0, outside the declared range, and the
  puppeteer-postinstall path exists only because of that link. (Branch 2 removed that link and branch 3 brought
  it back, on `@puppeteer/browsers@3.2.6`: see [branch 2](#branch-2--zod-3-first-source-puppeteer-2550--25160) and
  [branch 3](#branch-3--zod-3-second-source-lhcicli-0151--0160).)
- `pac-proxy-agent` fetches the PAC file through `get-uri@6.0.5`, and passes its agent options on to it. get-uri passes
  them to `client.access()`.
- The proxy URL comes from configuration or from the proxy environment variables (`proxy-from-env`). Those include
  `npm_config_*` variables that a user's `.npmrc` produces.
- Nothing in this repo sets one, but the environment can. That includes the environment of puppeteer's postinstall
  browser download (`allowBuilds: puppeteer: true`), during `pnpm install`.

The override is outside get-uri 6.0.5's declared `^5.0.2`. get-uri 8.0.1, the newest, still declares `^5.3.1`.

### What changed from 5.3.1 to 6.2.6 that get-uri reaches

**6.0.0: the NAT regression (D13).** 6.0.0 changed `allowSeparateTransferHost`'s default from `true`
(`basic-ftp@5.3.1/dist/Client.js:24`) to `false`.

- With `false`, a `PASV` reply naming a host other than the control host is refused. The exception is when both hosts
  are loopback (`basic-ftp@6.2.6/dist/transfer.js`, `enterPassiveModeIPv4_forceControlHostIP`).
- 5.3.1 instead replaced a private `PASV` host with a public control host (`basic-ftp@5.3.1/dist/transfer.js:56-63`).
- get-uri cannot set the option: `get-uri@6.0.5/dist/ftp.js` calls `new Client()` with no options.
- The regression needs a server that offers no EPSV, because basic-ftp tries EPSV first and an EPSV reply carries no
  host. It then hits any `PASV` host other than the control host:
  - a server behind NAT (the probe below: a masqueraded private address, reached over `::1`);
  - a dual-stack server reached over IPv6, since `PASV` can only carry IPv4;
  - a genuinely separate data host.
- How it fails depends on the server.
  - **Server answers `MDTM`** (as pyftpdlib does): the failure has two steps. `downloadTo`'s `finally` still ends the
    destination stream (`basic-ftp@6.2.6/dist/Client.js:505-509`), so `getUri` first hands back an empty stream, and
    pac-proxy-agent sees a 0-byte PAC file as if it had been fetched. Then the refusal escapes as an unhandled
    rejection, because get-uri starts `downloadTo()` without a `.catch`. Under Node's default that ends the process.
  - **`MDTM` fails with a code other than 550:** get-uri falls back to `client.list()` inside its `try`. `list()` needs
    a data connection, so the refusal rejects `getUri()` cleanly. This was read from `get-uri@6.0.5/dist/ftp.js`, not
    measured.

**The other releases**, from the same CHANGELOG:

- **6.0.1 and 6.0.2** change TLS data connections. They can reach get-uri only if `secure` is passed through the agent
  options, which nothing here does.
- **6.1.0** changes uploads, which get-uri never does.
- **6.2.0–6.2.4** change timeouts, double failure reports, the listing parsers, the `PASV` reply parser (6.2.2, which
  every non-EPSV transfer goes through) and control-character rejection. get-uri passes the URL-decoded user and
  password to `access()`.
- **6.2.5** changes the release process only.
- **6.2.6** is the `downloadToDir` fix above.

The upstream suite below exercises the download and `list()` paths. It does not exercise FTPS or the TLS options.

### Evidence (D2, D17)

**get-uri's own suite.** It was run from `TooTallNate/proxy-agents` at tag `get-uri@6.0.5`, in a scratch clone outside
this repo.

The suite runs ts-jest on the tag's `packages/get-uri/src`. Its equivalence to the published `get-uri@6.0.5/dist` is
assumed, not checked. It ran on Node 24.22.2 with pnpm 7.32.2, the clone's `packageManager`, from the clone's root:

```sh
git clone --depth 1 --branch get-uri@6.0.5 https://github.com/TooTallNate/proxy-agents.git && cd proxy-agents
# ftpd's original tarball URL now returns 404; npm has the same version (contents not compared — the original is gone)
sed -i '' 's#"ftpd": "https://files-jg1s1zt9l.n8.io/ftpd-v0.2.14.tgz"#"ftpd": "0.2.14"#' packages/get-uri/package.json
sed -i '' -E 's#"basic-ftp": "[^"]+"#"basic-ftp": "<5.3.1 or 6.2.6>"#' packages/get-uri/package.json
pnpm install --ignore-scripts --no-frozen-lockfile --filter get-uri... --config.manage-package-manager-versions=false
pnpm --filter data-uri-to-buffer run build
cd packages/get-uri && NODE_OPTIONS="--tls-cipher-list=DEFAULT@SECLEVEL=0" npx jest --env node --verbose --bail
```

Notes on that recipe:

- `sed -i ''` is BSD sed (macOS). With GNU sed, use `sed -i`.
- The jest command is the package's own `test` script. Run without `--forceExit`, Jest exited cleanly on both
  versions, so an asynchronous failure after a test would have shown.
- `SECLEVEL=0` is needed because the fixtures' test certificates are below Node 24's default OpenSSL level.

How far each suite reaches basic-ftp:

- **get-uri's `ftp.test.ts`** (4 tests) runs basic-ftp code: endpoints, special characters, `ENOTFOUND`, and
  `ENOTMODIFIED` with `cache`. Under D17 this is the evidence.
- **pac-proxy-agent** (tag `pac-proxy-agent@7.2.0`) loads basic-ftp, because get-uri requires `./ftp` eagerly. Its one
  ftp test only constructs a `pac+ftp://` agent and never calls it.
- **proxy-agent** (tag `proxy-agent@6.5.0`) never loads basic-ftp at all: it imports `pac-proxy-agent` lazily, and its
  tests use no `pac+…` scheme.

Both of those workspaces carry get-uri 6.0.4. They were run the same way as get-uri: the same `sed` lines on
`packages/get-uri/package.json`, then the commands below, each with its own `jest --env node`, `SECLEVEL=0` and no
`--forceExit`.

```sh
pnpm install --ignore-scripts --no-frozen-lockfile --filter "<pkg>..." --config.manage-package-manager-versions=false
pnpm --filter "<pkg>^..." run build
```

| Suite                 | basic-ftp 5.3.1 | basic-ftp 6.2.6                                  |
| --------------------- | --------------- | ------------------------------------------------ |
| get-uri 6.0.5         | 22/22           | 22/22, identical test by test; `ftp.test.ts` 4/4 |
| pac-proxy-agent 7.2.0 | 14/14           | 14/14 (loads basic-ftp, never calls it)          |
| proxy-agent 6.5.0     | 12/12           | 12/12 (never loads basic-ftp; context only)      |

**Probes.** These ran against a throwaway pyftpdlib 2.0.1 server in Docker, which was removed afterwards.

- **6.2.6 side:** this repo's installed get-uri, used by both probes.
- **5.3.1 side:** `npm install --ignore-scripts get-uri@6.0.5 basic-ftp@5.3.1` in a scratch directory, used by
  `nat-probe.cjs` only, since `probe.cjs` finds get-uri in pnpm's `node_modules/.pnpm` layout.
- **Where files live:** `root/`, `server.py` and the probes go in a scratch directory outside the repo.
- **Fixtures:** `head -c 300000 /dev/urandom > root/pub/data.bin`, plus `root/pub/proxy.pac` containing
  `function FindProxyForURL(u,h){return "DIRECT";}` and a newline (48 bytes).
- **Exit codes:** from `node <probe> <args>; echo "exit code $?"`.

```sh
# one container, two servers: a normal one on 2121 and a "behind NAT" one on [::1]:2122 (PASV names 10.255.255.1, no EPSV)
docker run -d --name cos-ftp-probe -p 2121:2121 -p 30000-30009:30000-30009 \
  -p '[::1]:2122:2122' -p '[::1]:30010-30019:30010-30019' \
  -v "$PWD/root:/srv:ro" -v "$PWD/server.py:/server.py:ro" python:3.12-slim \
  sh -c "pip install -q pyftpdlib==2.0.1 && (python /server.py 2122 30010 10.255.255.1 no-epsv & python /server.py 2121 30000 127.0.0.1)"
```

```python
# server.py <port> <first passive port> <masquerade address> [no-epsv]
import sys
from pyftpdlib.authorizers import DummyAuthorizer
from pyftpdlib.handlers import FTPHandler
from pyftpdlib.servers import FTPServer
port, pasv_lo, masq = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
a = DummyAuthorizer(); a.add_anonymous('/srv')
class H(FTPHandler):
    authorizer = a
    passive_ports = range(pasv_lo, pasv_lo + 10)
    masquerade_address = masq
    if len(sys.argv) > 4 and sys.argv[4] == 'no-epsv':
        proto_cmds = {k: v for k, v in FTPHandler.proto_cmds.items() if k != 'EPSV'}
FTPServer(('0.0.0.0', port), H).serve_forever()
```

Normal server. The probe was run with the repo root as working directory, as `node <scratch>/probe.cjs
<scratch>/root/pub`:

```js
const fs = require('fs'),
  path = require('path'),
  crypto = require('crypto');
const pnpmDir = path.resolve('node_modules/.pnpm');
const getUriDir = path.join(
  pnpmDir,
  fs.readdirSync(pnpmDir).find((d) => d.startsWith('get-uri@6.')),
  'node_modules/get-uri',
);
const { getUri } = require(getUriDir);
const ftpVersion = require(
  require.resolve('basic-ftp/package.json', { paths: [getUriDir] }),
).version;
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const read = (s) =>
  new Promise((ok, no) => {
    const c = [];
    s.on('data', (d) => c.push(d));
    s.on('end', () => ok(Buffer.concat(c)));
    s.on('error', no);
  });
const code = (p) =>
  p.then(
    () => 'no error',
    (e) => e.code || e.message,
  );
(async () => {
  console.log(
    'get-uri',
    require(path.join(getUriDir, 'package.json')).version,
    'basic-ftp',
    ftpVersion,
  );
  for (const f of ['data.bin', 'proxy.pac']) {
    const got = await read(await getUri(`ftp://127.0.0.1:2121/pub/${f}`));
    const want = fs.readFileSync(path.join(process.argv[2], f));
    console.log(
      f,
      got.length,
      'bytes',
      sha(got) === sha(want) ? 'sha256 match' : 'SHA256 MISMATCH',
    );
  }
  console.log('missing file      ->', await code(getUri('ftp://127.0.0.1:2121/pub/missing.txt')));
  const first = await getUri('ftp://127.0.0.1:2121/pub/proxy.pac');
  await read(first);
  console.log(
    'cached fetch      ->',
    await code(getUri('ftp://127.0.0.1:2121/pub/proxy.pac', { cache: first })),
  );
})().catch((e) => {
  console.error('FAILED', e);
  process.exit(1);
});
```

```text
get-uri 6.0.5 basic-ftp 6.2.6
data.bin 300000 bytes sha256 match
proxy.pac 48 bytes sha256 match
missing file      -> ENOTFOUND
cached fetch      -> ENOTMODIFIED
```

NAT case. The probe was run as `node nat-probe.cjs <get-uri dir>`, where `<get-uri dir>` is
`node_modules/.pnpm/get-uri@6.0.5_supports-color@8.1.1/node_modules/get-uri` on the 6.2.6 side and the scratch
directory's `node_modules/get-uri` on the 5.3.1 side, with no `unhandledRejection` listener. The control
connection goes to `localhost`, which on the machine used (macOS) resolves to `::1` first, and basic-ftp does not
class `::1` as private. Where `localhost` resolves to `127.0.0.1`, this setup does not reproduce. `ftp://[::1]`
cannot be used, because get-uri passes the brackets to DNS.

```js
const { getUri } = require(process.argv[2]);
const ftp = require(
  require.resolve('basic-ftp/package.json', { paths: [process.argv[2]] }),
).version;
const read = (s) =>
  new Promise((ok, no) => {
    const c = [];
    s.on('data', (d) => c.push(d));
    s.on('end', () => ok(Buffer.concat(c)));
    s.on('error', no);
  });
getUri('ftp://localhost:2122/pub/proxy.pac')
  .then(read)
  .then((b) => console.log(`basic-ftp ${ftp}: fetched ${b.length} bytes`))
  .catch((e) => console.log(`basic-ftp ${ftp}: getUri rejected — ${e.code || e.message}`));
setTimeout(() => {
  console.log(`basic-ftp ${ftp}: still running after 20 s`);
  process.exit(3);
}, 20000).unref();
```

The output below keeps only the `basic-ftp` and `Error:` lines. The error line is cut at 220 characters, marked `[…]`:

```text
basic-ftp 5.3.1: fetched 48 bytes
exit code 0
basic-ftp 6.2.6: fetched 0 bytes
Error: None of the available transfer strategies work. Last error response was 'Error: PASV returned another host (10.255.255.1) for data transfer that you have connected to (::1). Even though the FTP protocol allows th[…]
exit code 1
```

### Production closure

For each of the 19 workspace importers, the `dependencies` / `optionalDependencies` closure was walked, following
`link:` workspace packages, in 1a's lockfile and in this branch's. **No importer's closure changed.** The same walker
on `fb20451f^` against `fb20451f` reports changes in four importers, so it does detect them.

```js
// YAML=<path to js-yaml@4> node prod-closure.cjs <old pnpm-lock.yaml> <new pnpm-lock.yaml>
const fs = require('fs'),
  path = require('path');
const yaml = require(process.env.YAML);
function closure(lock, importer) {
  const seen = new Set(),
    seenImp = new Set(),
    stack = [];
  const visitImporter = (imp) => {
    if (seenImp.has(imp)) return;
    seenImp.add(imp);
    const e = lock.importers[imp] || {};
    for (const sec of ['dependencies', 'optionalDependencies'])
      for (const [n, v] of Object.entries(e[sec] || {})) {
        if (v.version.startsWith('link:'))
          visitImporter(path.posix.normalize(path.posix.join(imp, v.version.slice(5))));
        else stack.push(`${n}@${v.version}`);
      }
  };
  visitImporter(importer);
  while (stack.length) {
    const k = stack.pop();
    if (seen.has(k)) continue;
    seen.add(k);
    const sn = lock.snapshots[k];
    if (!sn) continue;
    for (const sec of ['dependencies', 'optionalDependencies'])
      for (const [n, v] of Object.entries(sn[sec] || {}))
        if (!v.startsWith('link:')) stack.push(`${n}@${v}`);
  }
  return new Set([...seen].map((k) => k.replace(/\(.*$/, '')));
}
const [oldL, newL] = process.argv.slice(2).map((p) => yaml.load(fs.readFileSync(p, 'utf8')));
for (const imp of Object.keys(newL.importers).sort()) {
  const a = closure(oldL, imp),
    b = closure(newL, imp);
  const rm = [...a].filter((x) => !b.has(x)),
    add = [...b].filter((x) => !a.has(x));
  if (rm.length || add.length) console.log(`${imp}: -[${rm.join(' ')}] +[${add.join(' ')}]`);
}
console.log('importers checked:', Object.keys(newL.importers).length);
```

Limitations:

- A snapshot key the walker cannot find is skipped, not reported (`if (!sn) continue`). An alias edge
  (`name: real@version`) builds such a key. Instrumented on 1a's and 1b's lockfiles, the production walk skips 3:
  `string-width-cjs`, `strip-ansi-cjs` and `wrap-ansi-cjs`. Their subtrees are not walked.
- Stripping the `(…)` peer suffix hides changes that alter only peer resolution.

### Gates (1b)

- **`pnpm install --frozen-lockfile`:** passes.
- **`scripts/pnpm-audit.sh`:** 3 unresolved (zod, @azure/msal-node, decode-uri-component). basic-ftp is gone.
- **`verify-before-push.sh --full` and the Docker builds:** reported in the hand-off.

## Branch 1c — decode-uri-component 0.2.2 → 0.5.1

1c adds one override, `'query-string@7.1.3>decode-uri-component': '^0.5.1'`, and one Jest transform in file-service.
The lockfile diff is decode-uri-component's package and snapshot entries, query-string's dependency line and the
overrides line. The installed 0.5.1 is byte-identical to the npm tarball, whose SHA-512 matches the lockfile's
`integrity`.

The override is scoped to query-string 7.1.3 (product owner, 2026-11-06, after /doubt cycle 3). A workspace-wide
`decode-uri-component@<0.5.1` would hand the ESM-only 0.5.1 to any future package that asks for 0.2.x, whose
`require()` of it would then fail at runtime with nothing to flag it. Scoped, such a package gets 0.2.x, and the audit
gate reports it. Measured on pnpm 11.22.0 in a scratch project depending on both `query-string@7.1.3` and
`decode-uri-component@^0.2.2`: the direct dependency resolved to 0.2.2, and query-string's to 0.5.1. In this repo the
scoped and the workspace-wide override give the same lockfile.

### The advisory

| Advisory            | Severity | Affected   | Patched | What it is                                                                                               |
| ------------------- | -------- | ---------- | ------- | -------------------------------------------------------------------------------------------------------- |
| GHSA-qr28-fpjm-wq7f | high     | `<= 0.5.0` | `0.5.1` | CVE-2026-118664, published 2026-10-29. The fallback decoder runs one full-string replace per run, O(K·L) |

0.5.1 was published on 2026-10-23, so the release-age rule did not block it and pnpm added no exclude entry.

The published diff from 0.5.0 to 0.5.1 touches `index.js` only (and `package.json`'s version). The UTF-16 BOM pair
and a truncated `%C2` are now handled inside the scanner. The table of runs and its `new RegExp(key, 'g')` replace
loop are gone, replaced by one `input.replace(multiMatcher, run => decode(run))`.

The advisory's own proof of concept (224 KB, 32 000 distinct runs and a trailing `%zz`) under Node 24.22.2:

| Version                 | Time      |
| ----------------------- | --------- |
| 0.2.2 (what 1b shipped) | 21 604 ms |
| 0.5.0                   | 21 603 ms |
| 0.5.1 (installed)       | 31 ms     |

### Where it runs, and upstream

`pnpm why decode-uri-component -r` finds one version on one path:
`@cos/file-service` (`minio ^7.1.0`) → `minio@7.1.4` → `query-string@7.1.3` → `decode-uri-component`. It is a
production dependency of file-service.

query-string declares `^0.2.2`, so 0.5.1 is outside its range (D2). No upstream release clears it: minio 8.0.7, the
newest, still declares `query-string ^7.1.3`, and 7.1.3 is the last 7.x.

### What the override costs: query-string's decoding functions throw

decode-uri-component is ESM-only from 0.4.0 (`"type": "module"`, `export default`; 0.3.0 still had
`module.exports`). query-string 7.1.3 is CommonJS
and does `const decodeComponent = require('decode-uri-component')`. Node 24's `require()` of an ES module returns the
module namespace, `{ __esModule, default }`, not the function. Node 24 is what runs everywhere here: root `engines`
`>=24.0.0`, CI's `NODE_VERSION: '24'`, and `node:24-alpine` in file-service's Dockerfile. So, through the installed
tree:

| query-string 7.1.3                               | With 0.5.1                                                                                                        |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `stringify`, `extract`                           | work; they never decode                                                                                           |
| `parse`, `parseUrl`, `pick`, `exclude`           | throw `TypeError: decodeComponent is not a function` (`decode: true`, the default); work with `{ decode: false }` |
| `stringifyUrl`, when the URL already has a query | throws the same, even with `{ decode: false }`: it calls `parse` on that query without passing the option on      |
| `stringifyUrl` on a URL with no query            | works                                                                                                             |

minio 7.1.4 calls `stringify` only: 6 call sites in `dist/main` (`minio.js`, `internal/client.js`, `helpers.js`) and
the same 6 in `dist/esm`, and nothing else on query-string. Nothing else in the tree uses query-string.
So nothing that runs today breaks.

The vulnerable decoder was not reachable before either: it runs only inside `parse`. The override removes the
advisory, and with it the need to rely on that fact. A minio release that starts calling `parse` would break;
file-service's new spec reads minio's published code and fails first (see below).

### file-service's Jest

Jest's CommonJS runtime cannot load an untransformed `export`. No unit spec loaded the real minio
(`minio.service.spec.ts` mocks it with a factory), so all 21 suites passed with 0.5.1 in place. The integration suite
`test/minio-tenant-isolation.integration.spec.ts` does load it, and failed with `SyntaxError: Unexpected token
'export'`.

`services/file-service/jest.config.js` now compiles that one file to CommonJS with ts-jest (`allowJs`), and lets it
past `transformIgnorePatterns`. Every other `node_modules` file is still left alone. `jest --showConfig` shows the
preset's `^.+\.tsx?$` transform still in place beside the new one, and `jest.integration.config.js` inherits both
through `...base`. The transformed module behaves as it does under Node: `parse` throws the same `TypeError`. That
match comes from ts-jest emitting `exports.default`, not from Node's rules; a transformer that adds a
`module.exports = default` shim would make `parse` work in Jest while it still throws in production.

`src/__tests__/minio-dependency.spec.ts` is the one unit spec that loads the real minio. Its three tests:

1. presign a GET offline (explicit region, so no bucket-region lookup);
2. check query-string's side of the trade-off: `stringify` works, `parse` throws;
3. read every `.js` / `.mjs` / `.cjs` file under minio's `dist`, find the name each file binds query-string to
   (`var qs = …require("query-string")`, `import * as qs from 'query-string'`), and require every use of it to be
   `.stringify`. A file that mentions query-string without such a binding fails, as does the name being used other
   than as `name.method`, and an empty scan fails. Every mention of `query-string` in a file must be one of those
   bindings, so a second binding is checked too. Checked against fake minio builds, each of which fails it:
   `qs.parse(…)` added; `{ stringify, parse }` destructured; `qs` passed to a helper; a second
   `var qs2 = …require("query-string")` calling `parse`; a bare `require("query-string").parse(…)`; a named
   `import { parse } from 'query-string'` beside the namespace import; a dynamic `import("query-string")`; and two
   one-line forms, `var a = 1, qs = require(…); qs.parse(…)` and `var a = 1; var qs = require(…); qs.parse(…)`.
   Builds with only `stringify`, one of them in the one-line form, pass. It also fails on harmless changes, such as
   the bound name in a comment.

Without the transform the spec fails with `Unexpected token 'export'`.

### Evidence

- **Unit suite:** `pnpm test:cov` passes, 22 suites, 284 tests (281 before plus the new 3), coverage still 100 %.
- **Real MinIO.** The integration suite's own image, `quay.io/minio/minio:RELEASE.2024-09-13T20-26-02Z`, no longer
  exists ("no such manifest"), and docker.io's `minio/minio` needs authentication (see [Open](#open)). So the suite was
  run unchanged except for three lines, from a scratch copy:
  - the image: `cgr.dev/chainguard/minio@sha256:cee9a8e35885e93f14b3cb32960e5017aff74e2adfb52ba87c65003b0163886b`
    (MinIO `RELEASE.2026-10-23T20-06-51Z`);
  - the data directory: `/tmp/data`, because that image runs as uid 65532;
  - the two relative `../src/` imports made absolute.

  With file-service's integration config, 8 of 8 pass. With the same config minus the transform, the suite fails to
  load (`Unexpected token 'export'`).

- **Node, through the installed tree:** the probe below, run from `services/file-service`, printed:

  ```text
  decode-uri-component 0.5.1 …/node_modules/.pnpm/decode-uri-component@0.5.1/node_modules/decode-uri-component/index.js
  require shape object [ '__esModule', 'default' ] function
  stringify response-content-disposition=attachment%3B%20filename%3D%22%E0%B9%83…pdf%22
  parse THROWS TypeError decodeComponent is not a function
  parseUrl THROWS TypeError decodeComponent is not a function
  stringifyUrl THROWS TypeError decodeComponent is not a function
  presignedGetObject http://localhost:9/cos-tenant/%E0%B9%83%E0%B8%9A%20%E0%B8%87%E0%B8%B2%E0%B8%99.pdf
  advisory PoC (224 KB): 30.7 ms
  ```

  ```js
  // Run from services/file-service: node installed-probe.cjs
  const path = require('node:path');
  const minioPath = require.resolve('minio', { paths: [process.cwd()] });
  const fromMinio = { paths: [path.dirname(minioPath)] };
  const qsPath = require.resolve('query-string', fromMinio);
  const dcPath = require.resolve('decode-uri-component', { paths: [path.dirname(qsPath)] });
  const dcVersion = require(path.join(path.dirname(dcPath), 'package.json')).version;
  console.log('decode-uri-component', dcVersion, dcPath);
  const dc = require(dcPath);
  console.log('require shape', typeof dc, Object.keys(dc), typeof dc.default);
  const qs = require(qsPath);
  const disposition = { 'response-content-disposition': 'attachment; filename="ใบ งาน.pdf"' };
  console.log('stringify', qs.stringify(disposition));
  for (const [n, f] of [
    ['parse', () => qs.parse('a=1')],
    ['parseUrl', () => qs.parseUrl('http://x/?a=1')],
    ['stringifyUrl', () => qs.stringifyUrl({ url: 'http://x/?a=1', query: { b: 2 } })],
  ]) {
    try {
      console.log(n, JSON.stringify(f()));
    } catch (e) {
      console.log(n, 'THROWS', e.constructor.name, e.message);
    }
  }
  const Minio = require(minioPath);
  const c = new Minio.Client({
    endPoint: 'localhost',
    port: 9,
    useSSL: false,
    accessKey: 'k',
    secretKey: 's',
    region: 'us-east-1',
  });
  c.presignedGetObject('cos-tenant', 'ใบ งาน.pdf', 60).then((u) => {
    console.log('presignedGetObject', u.split('?')[0]);
    let p = '';
    for (let i = 0; i < 32000; i++) {
      const high = Math.floor(i / 256)
        .toString(16)
        .padStart(2, '0');
      const low = (i % 256).toString(16).padStart(2, '0');
      p += `%${high}%${low}x`;
    }
    p += '%zz';
    const t = process.hrtime.bigint();
    dc.default(p);
    console.log(
      'advisory PoC (224 KB):',
      (Number(process.hrtime.bigint() - t) / 1e6).toFixed(1),
      'ms',
    );
  });
  ```

  Node printed no warning for the `require()` of an ES module. The same probe, mounted read-only into the built
  file-service image (`node:24-alpine`, Node 24.22.2, working directory `/app/services/file-service`), printed the same
  lines from `/app/node_modules/.pnpm/decode-uri-component@0.5.1/…`, with the proof of concept at 99.9 ms.

### Production closure (1c)

The walker from [1b](#production-closure), on 1b's lockfile (`1a0b9f0b`) against this branch's, over 19 importers:
`services/file-service: -[decode-uri-component@0.2.2] +[decode-uri-component@0.5.1]`, and nothing else. Its sanity
check on `fb20451f^` against `fb20451f` again reports four importers.

### Gates (1c)

- **`pnpm install --frozen-lockfile`:** passes, with no diff.
- **`scripts/pnpm-audit.sh`:** 2 unresolved (zod, @azure/msal-node). decode-uri-component is gone.
- **file-service:** `pnpm test:cov` passes (above); `pnpm build` and `tsc --noEmit` pass.
- **Docker builds:** the four Dockerfiles that run pnpm (file-service, backend, web, credential-service) build from
  the root context, as CI builds them.
  That was with the workspace-wide override. After it was scoped, file-service's image was rebuilt (corepack
  `pnpm@11.9.0`, frozen install) and the in-image probe re-run, with the same output; the other three were not rebuilt.
  The lockfile differs only in the overrides line, and frozen install checks that line the same way in each image.
- **`verify-before-push.sh --full`:** 44 passed, 5 failed, 4 skipped. Four failures are the ones 1b had: the pnpm
  audit (zod and msal-node remain), pip-audit (Pillow, branch 5), openapi freshness (`auth` and `ai`, see [Open](#open))
  and the file-service MinIO suite, whose quay.io image returned `401 UNAUTHORIZED` — the image pull, not Jest. The
  fifth, "Unit tests — Temporal workflows (serial)", failed because `temporal.download` answered HTTP 503 while
  fetching the Temporal test server; `pnpm run test:workflows` in `backend`, re-run on its own, passed: 6 suites and
  23 tests.

## Branch 2 — zod 3, first source: puppeteer 25.5.0 → 25.16.0

Branch 2 adds one override, `'puppeteer@>=25.0.0 <25.13.0': '^25.13.0'`, and corrects one stale comment. mermaid-cli
stays on 11.16.0 (D25). No production dependency changes.

### The advisory and the path

| Advisory            | Severity | Affected  | Patched | Note                                                 |
| ------------------- | -------- | --------- | ------- | ---------------------------------------------------- |
| GHSA-mrhx-c7xc-m3w5 | high     | `< 4.6.6` | `4.6.6` | CVE-2023-54404, published 2026-10-01. No 3.x release |

The tree had one copy of zod 3, `zod@3.25.76`, reached two ways:

1. **This branch.** The root devDependency `@mermaid-js/mermaid-cli@11.16.0` → `puppeteer@25.5.0` →
   `chromium-bidi@17.0.2`, which declares `zod ^3.24.1`. Nothing declares puppeteer: mermaid-cli 11.16.0 lists it as
   a peer (`^23 || ^24 || ^25`), and pnpm installs it.
2. **Branch 3.** apps/web's `@lhci/cli@0.15.1` → lighthouse 12.6.1 → `puppeteer-core@24.43.1` →
   `chromium-bidi@14.0.0`.

So the audit still lists the zod advisory after this branch, through path 2 only.

### Why puppeteer, not mermaid-cli 12 (D25)

puppeteer-core 25.5.0 to 25.12.0 pin `chromium-bidi 17.0.2` (zod 3). 25.13.0 (2026-10-08) is the first on
`chromium-bidi 157.0.8090-0`, which declares `zod ^4.6.5`; the existing `zod@>=4.0.0 <4.6.6` override lifts that to
4.6.6 or later. mermaid-cli 12.0.0 and 12.2.0 declare `puppeteer ^25.0.0`: upgrading to them alone would leave
puppeteer, and zod, where they were, and would add mermaid 12 and a Node `>=22.13.0` floor.

The floor is 25.13.0, the lowest release that clears it, as the file's other entries do; `^25.13.0` resolves the
newest 25.x, 25.16.0 (2026-10-22). Every new package is older than the 24 h release-age window, and pnpm added no
exclude entry.

### What changed

`pnpm why zod -r` now finds zod 3 only under lighthouse, and `pnpm why puppeteer -r` finds one version, 25.16.0,
under mermaid-cli. The lockfile adds `puppeteer@25.16.0`, `puppeteer-core@25.16.0`, `chromium-bidi@157.0.8090-0`,
`@puppeteer/browsers@3.2.6`, `devtools-protocol@0.0.1704951`, `webdriver-bidi-protocol@1.0.1`, `ws@8.22.1`,
`typed-query-selector@2.12.3` and `modern-tar@0.8.6`, and drops the 25.5.0 set (`chromium-bidi@17.0.2`,
`devtools-protocol@0.0.1653615`, `webdriver-bidi-protocol@0.4.2`, `ws@8.21.2`).

puppeteer's own browser moves with it: `revisions.js` in puppeteer-core 25.5.0 names Chrome and
chrome-headless-shell `151.0.7922.71`; 25.16.0 names `156.0.8078.47`. On this machine 156.0.8078.47 was already in
`~/.cache/puppeteer` (created 2026-11-04, before this branch), so the postinstall found it there; the web Docker
build below shows a real download.

**`@puppeteer/browsers` now has two copies.** The override `'@puppeteer/browsers@<3': '3.1.0'` (from an earlier
round) keeps lighthouse's puppeteer-core 24 on 3.1.0, and its comment said puppeteer 25.5.0 also resolved 3.1.0, so
there was one copy. puppeteer 25.16.0 asks for 3.2.6. The pin is left as it is, since the lighthouse path is branch
3's, and its comment now says there are two.

**This removes the basic-ftp path through puppeteer's postinstall** (branch 1b), for this branch only: branch 3
brings it back (see [branch 3](#branch-3--zod-3-second-source-lhcicli-0151--0160)). Both copies declare
`proxy-agent >=8.0.1` as an optional peer, but pnpm fills it only in 3.1.0: the lockfile entry
`'@puppeteer/browsers@3.2.6(yauzl@3.4.0)'` has `modern-tar`, `yargs` and `yauzl` and no proxy-agent, and its
`node_modules` holds only those. `pnpm peers check` now names only `@puppeteer/browsers@3.1.0` for proxy-agent.
3.1.0 sits under lighthouse's puppeteer-core 24, which has no postinstall. basic-ftp is still reachable through
`@lhci/cli` itself, as 1b recorded.

**The override also rewrites mermaid-cli's peer range in the lockfile**, from `^23 || ^24 || ^25` to `^25.13.0`.
pnpm 11.22.0 matches an override's selector by whether its range intersects the specifier, not by the resolved
version, and then replaces the whole specifier. Measured in scratch projects on pnpm 11.22.0: `^25 || ^26`,
`>=24 <26`, `25.5.0` and `~25.12.0` all became `^25.13.0`, so their 23, 24 or 26 alternatives were dropped too;
`^24`, `^25.14.0` and an explicit `25.16.0` were left alone. So any later spec reaching below 25.13 within 25.x is
clamped, including an explicit `puppeteer` spec of that kind and mermaid-cli 12's `^25.0.0`. The `pnpm-workspace.yaml`
comment says so.

### Evidence (D2): every mermaid block in `docs/`, before and after

Nothing in `scripts/`, the hooks or CI runs `mmdc`; it is a dev tool for the mermaid blocks in `docs/`. There are
38 (`^```mermaid` lines); the plan's count of 40 also matched two prose mentions. So each block
was rendered with `pnpm exec mmdc`, on the same machine, first with puppeteer 25.5.0 and then with 25.16.0:

| Run               | Blocks | Rendered | Failed                                                             |
| ----------------- | ------ | -------- | ------------------------------------------------------------------ |
| puppeteer 25.5.0  | 38     | 37       | 1: `phase-07-finance-service.md` block 2, "Parse error on line 13" |
| puppeteer 25.16.0 | 38     | 37       | the same block, the same message                                   |

The 37 SVGs are byte-identical between the two runs (`cmp`). The two failure logs differ only in the
`node_modules` paths in the stack trace.

````python
# python3 -I render-all.py <repo> <outdir>: extracts every ```mermaid block under docs/ and renders it with the
# repo's `pnpm exec mmdc`, one process per block. Writes <outdir>/results.tsv: id, source file, block no., exit, ms.
import pathlib, re, subprocess, sys, time
repo, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
(out / 'src').mkdir(parents=True, exist_ok=True); (out / 'svg').mkdir(exist_ok=True); (out / 'log').mkdir(exist_ok=True)
rows = []
for md in sorted((repo / 'docs').rglob('*.md')):
    for n, m in enumerate(re.finditer(r'^```mermaid[ \t]*\n(.*?)^```', md.read_text(encoding='utf-8'), re.S | re.M), 1):
        bid = f'{len(rows) + 1:03d}'
        src = out / 'src' / f'{bid}.mmd'; src.write_text(m.group(1), encoding='utf-8')
        t = time.time()
        p = subprocess.run(['pnpm', 'exec', 'mmdc', '-q', '-i', str(src), '-o', str(out / 'svg' / f'{bid}.svg')],
                           cwd=repo, capture_output=True, text=True, timeout=180)
        (out / 'log' / f'{bid}.log').write_text(p.stdout + p.stderr, encoding='utf-8')
        rows.append(f'{bid}\t{md.relative_to(repo)}\t{n}\t{p.returncode}\t{int((time.time() - t) * 1000)}')
        print(rows[-1], flush=True)
(out / 'results.tsv').write_text('\n'.join(rows) + '\n', encoding='utf-8')
````

### Production closure (2)

The walker from [1b](#production-closure), on 1c's lockfile (`8310449d`) against this branch's, over 19 importers:
no importer's production closure changed.

### The basic-ftp release-age entry

Not removed in this branch: this branch was implemented at 2026-11-05T17:54Z, before 20:58:52Z, so the entry was
still required (see [Open](#open)). Dates written as 2026-11-06 in this section are Bangkok time (UTC+7).

### Gates (2)

- **`pnpm install --frozen-lockfile`:** passes.
- **`scripts/pnpm-audit.sh`:** 2 unresolved (zod, now through lighthouse only; @azure/msal-node).
- **Docker build of web:** passes. apps/web's Dockerfile runs an unfiltered frozen install, so puppeteer's
  postinstall runs in it: it downloaded Chrome and chrome-headless-shell `156.0.8078.47` (`linux_arm`) to
  `/root/.cache/puppeteer`, in about 27 s of the install step.
- **`verify-before-push.sh --full`:** 45 passed, 4 failed, 4 skipped. The four failures are the known ones: the pnpm
  audit (zod via lighthouse, msal-node), pip-audit (Pillow, branch 5), openapi freshness (`auth` and `ai`) and the
  file-service MinIO suite, whose quay.io image cannot be pulled.

## Branch 3 — zod 3, second source: @lhci/cli 0.15.1 → 0.16.0

Branch 3 bumps one devDependency, apps/web's `@lhci/cli` `^0.15.1` → `^0.16.0`, which brings lighthouse 12.6.1 →
13.6.0. It also removes the `@puppeteer/browsers@<3` override, which no longer matches anything (D14), and the
`basic-ftp@6.2.6` release-age entry (D24). After it `pnpm audit` reports one high advisory, `@azure/msal-node`
(branch 4); zod's is the only advisory that goes.

### The path and upstream

The last zod 3 path was apps/web `@lhci/cli@0.15.1` → `lighthouse@12.6.1` (pinned exactly) →
`puppeteer-core@24.43.1` → `chromium-bidi@14.0.0` (`zod ^3`). `@lhci/cli@0.16.0` (2026-11-02, the latest) pins
`lighthouse@13.6.0` (2026-10-27), which declares `puppeteer-core ^25.16.0` and so `chromium-bidi 157.0.8090-0`
(`zod ^4.6.5`). No 0.15.x carries lighthouse 13, so this is two majors coupled by upstream: @lhci/cli 0.15 → 0.16 and
lighthouse 12 → 13. lighthouse is reached only through @lhci/cli. Both need Node `>=22.19`; the repo runs 24.

After the install, `pnpm why -r` finds one version each of zod (4.6.7), puppeteer-core (25.16.0),
`@puppeteer/browsers` (3.2.6) and lighthouse (13.6.0), and no extract-zip.

### Lighthouse 13 and this repo's gate

`.github/workflows/lighthouse.yml` runs `pnpm run lighthouse` in apps/web (`next start`, five warm-up requests, then
`lhci autorun`) with `apps/web/.lighthouserc.json`: mobile, simulated throttling, 3 runs, median. It asserts LCP ≤
3200 ms, CLS ≤ 0.1, TBT ≤ 200 ms, `resource-summary:script:size` ≤ 256000, `categories:accessibility` = 1 and
`color-contrast` = 1.

[Lighthouse 13.0.0](https://github.com/GoogleChrome/lighthouse/releases/tag/v13.0.0) removed the performance audits
replaced by insights, plus preload-fonts, uses-rel-preload, font-size, offscreen-images, no-document-write,
uses-passive-event-listeners and third-party-facades, and adjusted the accessibility weights. All five audits asserted
here still exist in 13.6.0 (`core/audits/metrics/largest-contentful-paint.js`, `…/cumulative-layout-shift.js`,
`…/total-blocking-time.js`, `core/audits/resource-summary.js`, `core/audits/accessibility/color-contrast.js`).

The accessibility category, read from each version's `core/config/default-config.js`:

| Lighthouse | Audits | Total weight | Changes                                                                                                                                                                                                                        |
| ---------- | ------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 12.6.1     | 73     | 404          |                                                                                                                                                                                                                                |
| 13.6.0     | 76     | 416          | new: `autocomplete-valid` 1, `presentation-role-conflict` 1, `svg-img-alt` 1; `landmark-one-main` 0 → 3; `aria-roles`, `label`, `select-name` 7 → 10; `aria-allowed-role`, `image-redundant-alt`, `table-duplicate-name` 1 → 0 |

With `minScore: 1`, a /login failing any newly weighted audit would fail the gate. It does not.

### Evidence (D2): the gate, before and after

`pnpm --filter @cos/web build`, then `pnpm run lighthouse` in apps/web, on one machine with one Chrome
(`Google Chrome --version`: 156.0.8078.80; the reports carry only the reduced `HeadlessChrome/156.0.0.0`), first on
lhci 0.15.1 / lighthouse 12.6.1 and then on 0.16.0 / 13.6.0 with this branch's final lockfile. These are this
machine's lab numbers, not CI's; what they show is before against after.

| Median of 3 runs             | Lighthouse 12.6.1           | Lighthouse 13.6.0           | Budget |
| ---------------------------- | --------------------------- | --------------------------- | ------ |
| LCP (ms)                     | 2984.6                      | 908.7                       | 3200   |
| CLS                          | 0                           | 0                           | 0.1    |
| TBT (ms)                     | 21                          | 18                          | 200    |
| script transfer size (bytes) | 231730                      | 231730                      | 256000 |
| accessibility                | 1                           | 1                           | 1      |
| color-contrast               | 1                           | 1                           | 1      |
| a11y audits failing          | none (73 audits, 23 scored) | none (76 audits, 22 scored) |        |

The 13.6.0 column is the run on the final lockfile. Two earlier 13.6.0 runs, on lockfiles from before the
`content-type` re-resolution below, gave medians of LCP 906.9 / 907.3 ms and TBT 20 / 9.5 ms, the rest the same. lhci
asserted every budget as passing in all of them (`assertion-results.json` empty).

**LCP moves by a factor of three, and that is Lighthouse, not the app (D26).** Both versions pick the same text `<p>`
as the LCP element, make the same 28 requests and load the same 231,730 script bytes. In the three 12.6.1 runs the
simulated LCP lands 2.0–2.1 s after the simulated FCP (for example 3023 ms against 908 ms), while the observed FCP
and LCP are equal in every run (69 ms in that one): the largest paint is the first one. In the three 13.6.0 runs on
the final lockfile the simulated LCP equals the simulated FCP (911 / 909 / 907 ms), and the observed values are again
equal (98 / 65 / 65 ms); the same holds in all nine 13.6.0 runs. So 12 and 13 disagree, and 13 agrees with its own FCP
and with the observed paint; these lab runs cannot rule out that 13 under-reports under real throttled CPU, which the
re-baseline on CI will show. 13.0.0's notes list "defer to trace engine for lcp-breakdown". The 3.2 s budget was set
from 12's medians ("the highest median observed … (2,913ms) plus ~10%", `lighthouse.yml`). On this machine the LCP is
now a third of what it was, and the headroom under 3200 went from about 0.2 s to about 2.3 s. By D26 the budget stays
at 3200 here, the workflow's comment now says where its numbers came from, and re-measuring it on ubuntu-latest is in
[Open](#open).

```python
# python3 -I summarise.py <.lighthouseci dir>: per run and median, the six values .lighthouserc.json asserts on,
# plus every accessibility audit that is weighted and not passing.
import glob, json, statistics, sys
runs = [json.load(open(f)) for f in sorted(glob.glob(sys.argv[1] + '/lhr-*.json'))]
def vals(r):
    a = r['audits']
    script = next((i['transferSize'] for i in a['resource-summary']['details']['items'] if i['resourceType'] == 'script'), None)
    return {'lcp': a['largest-contentful-paint']['numericValue'], 'cls': a['cumulative-layout-shift']['numericValue'],
            'tbt': a['total-blocking-time']['numericValue'], 'script_bytes': script,
            'a11y': r['categories']['accessibility']['score'], 'color_contrast': a['color-contrast']['score']}
print('lighthouse', {r['lighthouseVersion'] for r in runs}, 'chrome', {r['environment']['hostUserAgent'].split('Chrome/')[1].split()[0] for r in runs})
rows = [vals(r) for r in runs]
for i, v in enumerate(rows, 1): print('run', i, {k: round(x, 4) if isinstance(x, float) else x for k, x in v.items()})
print('median', {k: statistics.median(v[k] for v in rows) for k in rows[0]})
for i, r in enumerate(runs, 1):
    refs = {x['id']: x['weight'] for x in r['categories']['accessibility']['auditRefs']}
    bad = [(k, r['audits'][k]['score']) for k, w in refs.items() if w > 0 and r['audits'][k]['score'] not in (1, None)]
    print('run', i, 'a11y audits', len(refs), 'weighted not passing:', bad)
print(json.load(open(sys.argv[1] + '/assertion-results.json')) if __import__('os').path.getsize(sys.argv[1] + '/assertion-results.json') > 2 else 'assertion-results: []')
```

### What else the lockfile changed

72 packages left and 62 arrived, all under `@lhci/cli` (dev only). Among them: lighthouse, `@lhci/cli` and
`@lhci/utils` themselves; `puppeteer-core@24.43.1`, `chromium-bidi@14.0.0`, `@puppeteer/browsers@3.1.0` and
`zod@3.25.76` gone; lighthouse's `@sentry/node` 7.120.4 → 11.10.0, which brings `@sentry/bundler-plugins`, the Sentry
CLI package `sentry@0.45.0` (`getsentry/cli`, no install scripts) and `oxc-parser@0.152.0` with its per-platform
optional bindings; inside lhci, `inquirer` 6 → 8, `open` 7 → 11, `uuid` 8 → 14, `configstore` 5 → 8, `js-yaml@5.5.0`
and `express` 4.22.2 → 4.22.3. Every new package is older than 24 hours, and pnpm added no release-age entry. No new
package needs a build script.

**backend's `content-type` is not stable under re-resolution.** On the first install in the repo, pnpm moved
backend's `type-is@2.1.0` from `content-type@2.0.0` to 2.1.0, a production change the walker flagged, and
`@puppeteer/browsers` from `yargs@18.1.0` to 18.2.0. Re-resolving from branch 2's lockfile with this branch's final
`package.json` and `pnpm-workspace.yaml` (`pnpm install --lockfile-only`, isolated copy, `env -i`) kept 2.0.0 in 2 of 6
runs (mine and two /doubt reviewers') and moved it in the other 4, so moving it is the usual outcome and the number
of install steps is not what decides it. The committed lockfile is one of the runs that kept both where they were. It
is pnpm's own output, not a hand edit, and re-resolving from it leaves it byte-identical (in the repo with
`pnpm install`, and in three isolated copies). `--frozen-lockfile`, which CI and the Dockerfiles use, does not
re-resolve. A lockfile regenerated from branch 2's, after a rebase conflict for example, will most likely land on
2.1.0, and the walker will then report `backend: -[content-type@2.0.0]`; 2.0.0 → 2.1.0 only adds options that are off
by default. (lighthouse 13 also brings its own `yargs@18.2.0`, so there are two yargs 18 copies.)

**The `@puppeteer/browsers@<3` override is removed (D14).** It existed so that lighthouse 12's puppeteer-core 24 would
not pull `@puppeteer/browsers@2` and with it extract-zip (GHSA-jmr9-qjv8-65gv). With puppeteer-core 25 everywhere,
nothing asks for `<3`; a three-line note replaces the comment block.

**The basic-ftp path through puppeteer's postinstall is back.** Branch 2 had left mermaid-cli's `puppeteer@25.16.0`
on a `@puppeteer/browsers@3.2.6` variant without proxy-agent. Now lighthouse's puppeteer-core 25.16 shares 3.2.6 with
it, and pnpm fills the optional `proxy-agent` peer there from `@lhci/cli`'s 6.5.0, so `puppeteer@25.16.0` uses
`@puppeteer/browsers@3.2.6(proxy-agent@6.5.0…)`. That is the 1b path again; basic-ftp is 6.2.6, the patched release.

### The basic-ftp release-age entry is removed

2026-11-05T20:58:52Z has passed. The entry and its comment are gone from `minimumReleaseAgeExclude`, and
`pnpm install --frozen-lockfile` passes without it.

### Production closure (3)

The walker from [1b](#production-closure), on branch 2's lockfile (`87d2e8fa`) against this branch's, over 19
importers: no importer's production closure changed. (On the two-step lockfile it reported
`backend: -[content-type@2.0.0]`, which is how the paragraph above was found.)

### Gates (3)

- **`pnpm install --frozen-lockfile`:** passes, without the basic-ftp entry.
- **`scripts/pnpm-audit.sh`:** 1 unresolved, `@azure/msal-node`. zod is gone.
- **Docker build of web:** passes; puppeteer's postinstall downloaded Chrome 156.0.8078.47 (`linux_arm`) in it.
- **`verify-before-push.sh --full`:** 44 passed, 5 failed, 4 skipped. Four are the known ones: the pnpm audit
  (msal-node), pip-audit (Pillow, branch 5), openapi freshness and the file-service MinIO suite (quay.io image). The
  fifth, "Lint — prettier", flagged the eight JSON files lhci had written to `apps/web/.lighthouseci/` during the
  measurements above; the directory is gitignored but not in `.prettierignore`. With it removed,
  `pnpm run format:check` passes.

## Branch 4 — @azure/msal-node 5.2.2 → 7.1.2 via @azure/identity 4.14.1

Branch 4 adds one override, `'@azure/identity@>=4.0.0 <4.14.1': '^4.14.1'`, inside the declared range of its only
parent. It is the first branch of the series that changes a production closure.

### The advisory and the path

| Advisory            | Severity | Affected                   | Patched | What                                                                                         |
| ------------------- | -------- | -------------------------- | ------- | -------------------------------------------------------------------------------------------- |
| GHSA-xcx6-jx8p-x3h5 | high     | `>= 5.0.0-beta.0, < 7.1.0` | `7.1.0` | CVE-2026-109461, published 2026-10-23. Origin validation error in MSAL Node's auth_code flow |

One path, in production: backend's `dependencies` declare `@confluentinc/schemaregistry ^1.0.0` (1.9.0) →
`@azure/identity ^4.13.0` (4.13.1) → `@azure/msal-node ^5.1.0` (5.2.2).

**Nothing in this repo imports `@confluentinc/schemaregistry`.** No `.ts`, `.js`, `.mjs`, `.cjs` or `.json` file outside
`node_modules` names it except `backend/package.json` (one README, `packages/@cos/shared/README.md`, lists it; see
[Open](#open)), where it has been since the scaffold commit `3378bcec`.
`@cos/kafka` talks to the schema registry through its own HTTP client. The package's `dist/index.js` requires
`rules/encryption/azurekms/azure-driver` eagerly, so `@azure/identity` would load the moment anything required it.

### The fix, inside the declared range (D27)

`@azure/identity` 4.14.1 (2026-10-29, the latest) declares `@azure/msal-node ^7.1.0`; 4.14.0 declared `^6.0.0`.
schemaregistry 1.9.0, and the latest 1.11.0, declare `@azure/identity ^4.13.0`, so 4.14.1 is in range and no
out-of-range override is needed. identity 4.14.x needs Node `>=22` (the repo runs 24); msal-node 7.1.2 needs `>=20`.

What changes on the way, from identity's CHANGELOG: 4.14.0 moves msal-node to `^6.0.0` and fixes
`AzurePipelinesCredential` error details, `InteractiveBrowserCredential` with an already-running browser, and
`AZURE_ADDITIONALLY_ALLOWED_TENANTS`; 4.14.1 moves msal-node to `^7.1.0` ("Interactive browser authentication now
requires `form_post` callbacks", per the MSAL Node v7 migration guide) and restores a `DefaultAzureCredential` →
`ManagedIdentityCredential` option fix. Nothing here constructs a credential.

### What changed

The production closure walker (from [1b](#production-closure)), branch 3's lockfile (`97791d75`) against this
branch's, over 19 importers: only backend changes, and only inside `@azure/identity`'s subtree.

| Removed from backend's closure                                                                                | Added to backend's closure                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@azure/identity@4.13.1`, `@azure/msal-node@5.2.2`, `open@10.2.0`, `wsl-utils@0.1.0`, `default-browser@5.5.0` | `@azure/identity@4.14.1`, `@azure/msal-node@7.1.2`, `@azure/msal-common@16.15.0`, `@azure/core-process@1.0.0`, `open@11.0.4`, `wsl-utils@1.0.1`, `default-browser@5.5.1`, `powershell-utils@0.2.1`, `is-in-ssh@1.0.0` |

`@azure/core-process` is new in identity's dependencies: 4.13.2 and 4.14.0-beta.5 replaced the shell-based developer
credential commands with structured process execution. `open` and its helpers are identity's own dependency
(`open ^11.0.0` in 4.14.1), used to launch a browser for interactive sign-in. msal-node 7.1.2 pins
`@azure/msal-common 16.15.0`, while `@azure/msal-browser 5.11.0` keeps 16.6.2, so there are now two msal-common
copies. `open@11.0.4`, `wsl-utils@1.0.1`, `default-browser@5.5.1`, `powershell-utils@0.2.1` and `is-in-ssh@1.0.0` were
already in the tree under lighthouse 13 (branch 3), so the lockfile adds only four packages. `open` 10 → 11 and
`wsl-utils` 0.1 → 1.0 are majors; both serve only interactive browser sign-in, which nothing here reaches.

Outside production, `@puppeteer/browsers@3.2.6` moved from `yargs@18.1.0` to the `yargs@18.2.0` that lighthouse 13
already brought, and `yargs@18.1.0` left the lockfile. Three re-resolutions from branch 3's lockfile in isolated
copies (`pnpm install --lockfile-only`, `env -i`, sharing one metadata cache), run 2026-11-06T02:48–02:50Z, all
produced the committed lockfile byte for byte. That stopped holding at 03:33Z, when `@azure/msal-node@7.2.0`
(published 2026-11-05T03:33Z) left the 24 h release-age window: a /doubt reviewer's re-resolution at 03:34Z gave
msal-node 7.2.0 and `@azure/msal-common@16.16.0`. The lockfile keeps 7.1.2 on purpose: it is patched (≥ 7.1.0),
everything below was measured on it, and `--frozen-lockfile` does not re-resolve. Every package the lockfile adds was
older than 24 hours, and pnpm added no release-age entry. `pnpm why @azure/msal-node -r` finds one version, 7.1.2.

### Evidence (D2)

Nothing imports the package, so there is no behaviour of this repo to test through it. What is tested is that it still
loads and that the patched msal-node is what it would load: the probe below, run from `backend/` under Node 24 and
offline, printed

```text
schemaregistry 1.9.0 | identity 4.14.1 | msal-node 7.1.2
schemaregistry loads; AzureKmsDriver exported: function
ClientSecretCredential constructed: ClientSecretCredential
msal-node >= 7.1.0: true
```

```js
// Run from backend/: node probe.cjs. Offline: nothing here sends a request.
const path = require('node:path');
const from = (name, dir) => require.resolve(name, { paths: [dir] });
const srPkg = from('@confluentinc/schemaregistry/package.json', process.cwd());
const srDir = path.dirname(srPkg);
const idDir = path.dirname(from('@azure/identity/package.json', srDir));
const msalDir = path.dirname(from('@azure/msal-node/package.json', idDir));
const v = (d) => require(path.join(d, 'package.json')).version;
console.log('schemaregistry', v(srDir), '| identity', v(idDir), '| msal-node', v(msalDir));
const sr = require(from('@confluentinc/schemaregistry', process.cwd()));
console.log('schemaregistry loads; AzureKmsDriver exported:', typeof sr.AzureKmsDriver);
const id = require(from('@azure/identity', srDir));
const cred = new id.ClientSecretCredential(
  '00000000-0000-0000-0000-000000000000',
  'client',
  'secret',
);
console.log('ClientSecretCredential constructed:', cred.constructor.name);
const [maj, min] = v(msalDir).split('.').map(Number);
console.log('msal-node >= 7.1.0:', maj > 7 || (maj === 7 && min >= 1));
```

### Gates (4)

- **`pnpm install --frozen-lockfile`:** passes.
- **`scripts/pnpm-audit.sh`:** `Audit PASSED: 0 high/critical vulnerabilities.` — the first pass of the series.
- **backend:** `pnpm test:cov` passes, 257 suites and 4,207 tests, with its coverage gate; `pnpm build` passes.
- **backend Docker image:** builds, and the probe above, mounted read-only into it and run from `/app/backend`, printed
  the same four lines.
- **`verify-before-push.sh --full`:** 46 passed, 3 failed, 4 skipped. "Audit — pnpm (Node deps)" passes for the first
  time in the series. The three failures are the known ones: pip-audit (Pillow, branch 5), openapi freshness and the
  file-service MinIO suite (quay.io image). When that suite failed, turbo stopped backend's, `@cos/kafka`'s and
  credential-service's integration suites before they reported, so they did not run in it; the separate
  "Multi-tenant isolation" step did run and passed 13 of 13.
- **backend's integration suite, run on its own** (`pnpm --filter @cos/backend test:integration`, 54 spec files, one at
  a time): stopped by product-owner decision after 25 minutes with one file finished, since nothing in backend loads
  `@azure/identity` and the suite runs in CI. That file, `test/auth-tenant/01-entities-rls.integration.spec.ts`,
  failed on `plan_type admits exactly STARTER, PROFESSIONAL, ENTERPRISE`: the enum also has `LITE`, added by
  `512dc085` (trial lifecycle) without updating the spec. See [Open](#open).

## Branch 5 — Pillow 12.3.0 → 13.0.0 in ai-ocr-pipeline

Branch 5 changes one line of `services/ai-ocr-pipeline/requirements.txt`, `Pillow==12.3.0` → `Pillow==13.0.0`, with a
comment. It is the only Pillow pin in the repo, and a runtime dependency of the service.

### The advisories

`pip-audit` 2.10.0 reported 39 vulnerabilities against `pillow 12.3.0`: 18 PYSEC-2026-4326 to 4343 entries, 20 further
CVE ids and GHSA-78g4-xqwv-q3g8 (the bundled OpenJPEG), and gave 13.0.0 as the only fix version for every one; there
is no 12.x fix. 13.0.0 (2026-10-16, the latest) requires Python `>=3.11` (the service and its image run 3.12) and
ships cp312 manylinux wheels for aarch64 and x86_64. `pdf2image 1.17.0` requires `pillow` with no version range.

### What 13.0.0 changes that the service could reach

The service opens uploads with `Image.open(io.BytesIO(bytes))`, renders PDFs with `pdf2image.convert_from_bytes`
(pdftoppm → PPM → RGB images), and passes each image to `pytesseract.image_to_data(…, lang="tha+eng")`, which saves it
to a temporary file in its own `image.format` (PNG if it has none) after flattening any alpha onto white.

Of 13.0.0's backwards-incompatible changes (Python 3.10 dropped; `Image.fromarray` `mode` changing dtype; removed
`get_child_images()`, `Image._show`, `ImageCms` product name / info, `ExifTags.IFD.Makernote`), the one on that path is
**saving I mode images as PNG**: 12 clipped the 32-bit values to 16 bits, 13 raises. Measured inside the service
image on both versions: pytesseract's own `save()` of an I mode image with format PNG succeeded on 12.3.0 and raised
`OSError: cannot write mode I as PNG` on 13.0.0. But a PNG file cannot open in mode I (PNG holds at most 16 bits per
channel): a 16-bit grayscale PNG opens as `I;16` on both versions, and pdf2image yields RGB. So the service's inputs do
not reach it. One other 13.0.0 change is on the path for TIFF uploads: with duplicate TIFF tags, the first value is now
kept. Only crafted or malformed TIFFs carry duplicate tags, and none was tested. A /doubt reviewer ran `Image.open` and
pytesseract's `save()` on 26 further inputs on both versions (PNG variants, CMYK and EXIF-rotated JPEG, WebP, GIF,
TIFF `I;16` / `F`, JPEG 2000, PGM, BMP, PPM, PBM, AVIF) and got identical results; `MAX_IMAGE_PIXELS` is the same.

### Evidence (D2)

**The service's suite**, in scratch venvs on Python 3.12 with `requirements-dev.txt`: 41 passed with 100 % coverage
(gate 99 %) on 12.3.0, and the same on 13.0.0. Those tests mock `Image.open` and pytesseract, so they do not exercise
Pillow itself.

**Real OCR, before and after.** The service's own Dockerfile built twice from the repo root, with 12.3.0 and then with
13.0.0, and the same eight generated inputs run through `ocr_pipeline.process_file` in each, offline
(`--network none`):

| Input           | Mode         | Pillow 12.3.0             | Pillow 13.0.0             |
| --------------- | ------------ | ------------------------- | ------------------------- |
| `gray16.png`    | I;16         | read, confidence 0.958    | read, confidence 0.958    |
| `imode.tif`     | I            | error: `KeyError: 'text'` | error: `KeyError: 'text'` |
| `one_bit.png`   | 1            | read, confidence 0.958    | read, confidence 0.958    |
| `rgb.jpg`       | RGB          | read, confidence 0.958    | read, confidence 0.958    |
| `rgb.png`       | RGB          | read, confidence 0.958    | read, confidence 0.958    |
| `rgb.tif`       | RGB          | read, confidence 0.958    | read, confidence 0.958    |
| `rgba.png`      | RGBA         | read, confidence 0.958    | read, confidence 0.958    |
| `two_pages.pdf` | PDF, 2 pages | read, confidence 0.959    | read, confidence 0.959    |

Every input reads the same text with the same confidence on both versions; the outputs differ only in the version
field. The text read is the text drawn ("Daily report 2026-11-06 Concrete pour level 3 Inspector signed 14:30", and
for the PDF also "Page two Rebar check passed"). The 32-bit I mode TIFF fails on both, before any Pillow 13 change
(see [Open](#open)).

```python
# python make_inputs.py <outdir>: the OCR inputs for branch 5, made once (Pillow 12.3.0), used by both runs.
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

out = Path(sys.argv[1])
font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 40)
LINES = ['Daily report 2026-11-06', 'Concrete pour level 3', 'Inspector signed 14:30']


def page(lines=LINES):
    im = Image.new('RGB', (1000, 260), 'white')
    d = ImageDraw.Draw(im)
    for i, line in enumerate(lines):
        d.text((40, 30 + i * 70), line, fill='black', font=font)
    return im


rgb = page()
rgb.save(out / 'rgb.png')
rgb.save(out / 'rgb.jpg', quality=95)
rgb.save(out / 'rgb.tif')
rgba = rgb.convert('RGBA')
rgba.putalpha(Image.new('L', rgb.size, 255).point(lambda v: v))
alpha = Image.new('L', rgb.size, 255)
ImageDraw.Draw(alpha).rectangle((0, 0, 999, 20), fill=0)  # a transparent band at the top
rgba.putalpha(alpha)
rgba.save(out / 'rgba.png')
rgb.convert('1').save(out / 'one_bit.png')
gray = rgb.convert('L')
gray.convert('I').point(lambda v: v * 257).convert('I;16').save(out / 'gray16.png')  # 16-bit grayscale PNG
gray.convert('I').point(lambda v: v * 65793).save(out / 'imode.tif')  # 32-bit I, TIFF
rgb.save(out / 'two_pages.pdf', save_all=True, append_images=[page(['Page two', 'Rebar check passed'])])
for f in sorted(out.iterdir()):
    print(f.name, Image.open(f).mode if f.suffix != '.pdf' else 'pdf', f.stat().st_size)
```

```python
# Inside the service image: python /probe/run_ocr.py /probe/inputs. One JSON line per input: Pillow version, the mode
# Image.open reports, and process_file's text and confidence, or the exception it raised.
import json, sys, traceback
from pathlib import Path
import PIL
from PIL import Image
import ocr_pipeline

for f in sorted(Path(sys.argv[1]).iterdir()):
    mime = 'application/pdf' if f.suffix == '.pdf' else 'image/' + f.suffix.lstrip('.')
    row = {'pillow': PIL.__version__, 'file': f.name}
    if f.suffix != '.pdf':
        with Image.open(f) as im:
            row['mode'] = im.mode
    try:
        o = ocr_pipeline.process_file(f.stem, f.read_bytes(), mime)
        row.update(text=o.extracted_text, confidence=round(o.confidence_score, 4))
    except Exception as e:  # recorded, not hidden
        row['error'] = f'{type(e).__name__}: {str(e).splitlines()[0][:160]}'
    print(json.dumps(row, ensure_ascii=False), flush=True)
```

```python
# Inside the service image: the one Pillow 13 change that can reach pytesseract — an I mode image whose format is PNG.
import io
import PIL
from PIL import Image
from pytesseract import pytesseract as pt

im = Image.new('I', (50, 20), 70000)  # a value above 16 bits
im.format = 'PNG'
try:
    with pt.save(im) as (_, path):
        print(PIL.__version__, 'I-mode PNG saved by pytesseract; reopened as', Image.open(path).mode)
except Exception as e:
    print(PIL.__version__, 'I-mode PNG save raised', type(e).__name__, str(e)[:120])
# Can a PNG *file* open in mode I at all? (PNG holds at most 16 bits per channel.)
buf = io.BytesIO(); Image.new('I;16', (5, 5), 60000).save(buf, 'PNG')
print(PIL.__version__, '16-bit grayscale PNG file opens as', Image.open(io.BytesIO(buf.getvalue())).mode)
```

### Gates (5)

- **`pip-audit -r requirements.txt`**, in each of the five `services/*` that have one, as CI and vbp run it: "No known
  vulnerabilities found" and exit 0 in all five.
- **Docker build of ai-ocr-pipeline:** passes with 13.0.0 (and passed with 12.3.0 for the comparison).
- **`verify-before-push.sh --full`:** 47 passed, 2 failed, 4 skipped. Both audit steps pass, "Audit — pnpm (Node deps)"
  and "Audit — pip-audit (Python services)", for the first time together. The two failures are the known ones:
  openapi freshness and the integration step (the file-service MinIO image).

## The audit gate re-verified on pnpm 12.18.0

`de660667` moved `packageManager` from pnpm 11.22.0 to 12.18.0, and `scripts/pnpm-audit.sh` stopped by design until
its flags were measured again. Measured on 2026-11-10; `VERIFIED_PNPM` is now 12.18.0.

**Release notes, 12.0 to 12.18.** Two changes touch the gate. From 12.0 the audit settings live in an `audit` section
and `auditConfig` / `auditLevel` are deprecated spellings of it. From 12.4 the printed summary leaves out advisories
an ignore list hides. And 12 adds new places a setting can come from: `include` in `pnpm-workspace.yaml`, config
dependencies (whose own `package.json` names a settings file in `pnpm.config`; the root's `pnpm.config` is not read),
`updateConfig` hooks in `.pnpmfile.cjs` (honoured by `audit` from 12.6), and the global `config.yaml`.

**Positive control.** 1a's tree (`c94c183a`'s `package.json` with `packageManager` set to 12.18.0, its lockfile and
`packages:`), whose four highs are known: pnpm 12.18.0, run as the gate runs it, reports 56 advisories (5 low, 47
moderate, 4 high) over 2,339 dependencies, the same counts 1a measured on 11.22.0, and the gate lists the four.

**Every way to hide them**, each applied to a fresh copy of that tree and checked twice: (a) through the gate; (b)
with the gate's flags alone, in the copy, without the isolation.

| Vector                                                                                                                                                                 | (a) gate     | (b) flags alone, high / metadata high |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------- |
| `pnpm_config_` / `PNPM_CONFIG_` / `npm_config_` variables: `only=prod`, `production`, `dev`, `optional=false`, `audit_level=critical`, `lockfile_dir`, `registry` (10) | 4 unresolved | 4 / 4                                 |
| `.npmrc` in the project and in `HOME`                                                                                                                                  | 4 unresolved | 4 / 4                                 |
| `pnpm-workspace.yaml`: `auditLevel`, `audit.level`, `only` / `production` / `optional`, `audit.ignoreUnfixable`, `registry` / `lockfileDir`                            | 4 unresolved | 4 / 4                                 |
| `package.json`: `pnpm.auditConfig.ignoreGhsas`; `pnpm.config` pointing at a file with an ignore list                                                                   | 4 unresolved | 4 / 4                                 |
| `pnpm-workspace.yaml`: `fix`                                                                                                                                           | 4 unresolved | pnpm errors, no JSON                  |
| `pnpm-workspace.yaml`: `auditConfig.ignoreGhsas`; `audit.ignore`; `include: { ./extra.yaml: [audit] }` with the list in `extra.yaml`                                   | 4 unresolved | **0 / 4**                             |
| `.pnpmfile.cjs` `updateConfig` hook setting an ignore list and `auditLevel`                                                                                            | 4 unresolved | **0 / 4**                             |
| global `config.yaml` with an ignore list, in `HOME` (`Library/Preferences/pnpm` on macOS) and in `XDG_CONFIG_HOME`                                                     | 4 unresolved | **0 / 4**                             |

The gate held against all 26 (and listed the four in the unchanged baseline). The flags alone no longer do: **on pnpm
12 no flag clears an ignore list.** `--config.audit-config=`, `--config.audit=`, `--config.audit.ignore=`,
`--config.audit-config.ignore-ghsas=` and `--config.ignore-ghsas=` each left high at 0 with metadata high at 4. So the
isolated copy, which carries none of these files and runs under `env -i` with a temporary `HOME`, is what stops an
ignore list; the metadata check (`metadata.vulnerabilities` still counts what the list hides, in the JSON as on
11.22.0) catches one that gets through. On pnpm 12 the gate therefore has two lines, not three. Kept as designed, by
product-owner decision (2026-11-10); the script's comments now say so, and the flag stays, harmless. A /doubt reviewer
tried ten more vectors that reach the copy itself (`configDependencies`, `pnpm.audit.ignore`, `pnpm.pnpmfile` in
`package.json`; `settings:` and a config dependency in the lockfile; `devEngines.packageManager`; a duplicated
lockfile key): each either left the four listed or made the gate stop with an error.

On the first run, `pnpm audit` on pnpm 12 also wrote a second YAML document into the copy's lockfile
(`packageManagerDependencies`: pnpm 12.18.0). The repo's lockfile already has it since `de660667`, and the gate audits
a throwaway copy.

**The 15 stub fixtures** from 1a, regenerated from pnpm 12's output, give the results in the table above, case for
case; a stub that reports 11.22.0 is refused ("pnpm 11.22.0 is running; this gate is written for … 12.18.0"). The real
tree: `Audit PASSED: 0 high/critical vulnerabilities.` shellcheck clean.

**The Dockerfiles that pin `pnpm@11.9.0`** (backend twice, file-service, credential-service) no longer run it, and
`apps/web/Dockerfile`'s unversioned `corepack enable pnpm` gets the same: Corepack reads `packageManager` and downloads
12.18.0 ("Corepack is about to download …pnpm-12.18.0.tgz" in file-service's build log; `pnpm --version` prints 12.18.0
in a bare `node:24-alpine` with that `package.json`). file-service builds and its frozen install passes. The pin is now
dead text; `packageManager` carries no `+sha512`, so no hash was pinned (closed in [One pnpm pin, with its
hash](#one-pnpm-pin-with-its-hash-chorepnpm-pin-hash)). CI uses `pnpm/action-setup`, which also follows
`packageManager`.

```bash
#!/usr/bin/env bash
# vectors.sh <base> <gate.sh>: each blinding vector applied to a fresh copy of <base> (1a's tree, 4 known highs).
# Per vector: (a) the gate's exit and unresolved count; (b) the gate's audit flags run in the copy itself, without the
# isolation, as high / metadata.high; (c) whether any file in the copy changed.
set -u
base=$1 gate=$2 W=$(mktemp -d) GH='["GHSA-c475-qrg2-pj4r","GHSA-mrhx-c7xc-m3w5","GHSA-xcx6-jx8p-x3h5","GHSA-qr28-fpjm-wq7f"]'
FLAGS=(--json --audit-level info --config.production=false --config.dev=false --config.only=all --config.optional=true
  --registry=https://registry.npmjs.org/ --config.audit-config= --config.fix=false --lockfile-dir=.)
run() {
  local name=$1; shift; local d="$W/$name" h="$W/$name.home"; rm -rf "$d" "$h"; cp -R "$base" "$d"; mkdir -p "$h"
  ( cd "$d" && eval "$1" ); shift   # mutation, run in the copy
  local envs=("$@") before after; before=$(cd "$d" && find . -type f -not -path "./node_modules/*" -exec shasum {} + | sort)
  local g; g=$(cd "$d" && env ${envs[@]+"${envs[@]}"} HOME="$h" GATE_ROOT="$d" bash "$gate" 2>&1); local gx=$?
  local nu; nu=$(grep -c 'UNRESOLVED/' <<<"$g")
  local raw; raw=$(cd "$d" && env ${envs[@]+"${envs[@]}"} HOME="$h" pnpm audit "${FLAGS[@]}" 2>/dev/null | python3 -c '
import json,sys
try:
  d=json.load(sys.stdin); a=d.get("advisories",{}); m=d.get("metadata",{}).get("vulnerabilities",{})
  print(sum(1 for v in a.values() if v.get("severity")=="high"), m.get("high"))
except Exception as e: print("no-json", type(e).__name__)')
  after=$(cd "$d" && find . -type f -not -path "./node_modules/*" -exec shasum {} + | sort)
  local changed; changed=$(diff <(echo "$before") <(echo "$after") | grep "^>" | awk '{print $3}' | tr "\n" " ")
  printf '%-34s gate_exit=%s unresolved=%s | flags-only high/meta=%s | copy %s\n' "$name" "$gx" "$nu" "$raw" \
    "$([ "$before" = "$after" ] && echo unchanged || echo "CHANGED: $changed")"
}
ign_ws="printf 'auditConfig:\n  ignoreGhsas: %s\n' '$GH' >> pnpm-workspace.yaml"
run baseline ':'
run env-only-prod ':' pnpm_config_only=prod
run env-ONLY-prod-upper ':' PNPM_CONFIG_ONLY=prod
run env-production ':' pnpm_config_production=true
run env-dev ':' pnpm_config_dev=true
run env-optional-false ':' pnpm_config_optional=false
run env-audit-level ':' pnpm_config_audit_level=critical
run env-AUDIT-LEVEL-upper ':' PNPM_CONFIG_AUDIT_LEVEL=critical
run env-npm-audit-level ':' npm_config_audit_level=critical
run env-lockfile-dir ':' pnpm_config_lockfile_dir=/nonexistent
run env-registry ':' pnpm_config_registry=http://127.0.0.1:9/
run npmrc-repo 'printf "only=prod\naudit-level=critical\noptional=false\n" > .npmrc'
run ws-auditConfig-ignore "$ign_ws"
run ws-audit-ignore "printf 'audit:\n  ignore: %s\n' '$GH' >> pnpm-workspace.yaml"
run ws-auditLevel "printf 'auditLevel: critical\n' >> pnpm-workspace.yaml"
run ws-audit-level-section "printf 'audit:\n  level: critical\n' >> pnpm-workspace.yaml"
run ws-only-prod "printf 'only: prod\nproduction: true\noptional: false\n' >> pnpm-workspace.yaml"
run ws-ignoreUnfixable "printf 'audit:\n  ignoreUnfixable: true\n' >> pnpm-workspace.yaml"
run ws-fix "printf 'audit:\n  fix: override\nfix: override\n' >> pnpm-workspace.yaml"
run ws-registry-lockfileDir "printf 'registry: http://127.0.0.1:9/\nlockfileDir: /nonexistent\n' >> pnpm-workspace.yaml"
run ws-include "printf 'audit:\n  ignore: %s\n' '$GH' > extra.yaml; printf 'include:\n  ./extra.yaml: [audit]\n' >> pnpm-workspace.yaml"
run pkg-pnpm-auditConfig "python3 -c 'import json;p=json.load(open(\"package.json\"));p.setdefault(\"pnpm\",{})[\"auditConfig\"]={\"ignoreGhsas\":$GH};json.dump(p,open(\"package.json\",\"w\"),indent=2)'"
run pkg-pnpm-config "printf 'audit:\n  ignore: %s\n' '$GH' > audit.yaml; python3 -c 'import json;p=json.load(open(\"package.json\"));p.setdefault(\"pnpm\",{})[\"config\"]=\"audit.yaml\";json.dump(p,open(\"package.json\",\"w\"),indent=2)'"
run pnpmfile-updateConfig "printf 'module.exports={hooks:{updateConfig(c){c.auditLevel=\"critical\";c.audit={...(c.audit||{}),ignore:$GH};c.auditConfig={ignoreGhsas:$GH};return c}}}\n' > .pnpmfile.cjs"
run home-npmrc 'printf "only=prod\naudit-level=critical\n" > "$h/.npmrc"'
run home-global-config-macos "mkdir -p \"\$h/Library/Preferences/pnpm\"; printf 'audit:\n  ignore: %s\n' '$GH' > \"\$h/Library/Preferences/pnpm/config.yaml\""
run xdg-global-config "mkdir -p '$W/xdg/pnpm'; printf 'audit:\n  ignore: %s\n' '$GH' > '$W/xdg/pnpm/config.yaml'" XDG_CONFIG_HOME="$W/xdg"
```

## One pnpm pin, with its hash (`chore/pnpm-pin-hash`)

pnpm's version and hash now live in one place, `packageManager` in `package.json`, and no Dockerfile names a version
(product-owner decision, 2026-11-10).

**The hash.** `packageManager` is `pnpm@12.18.0+sha512.9d7882d5…63beb3` (the full 128 hex digits are in the file).
The hex is npm's `dist.integrity` for `pnpm@12.18.0` (base64 sha512) written as hex, and it equals `shasum -a 512` of
the `pnpm-12.18.0.tgz` that `npm pack pnpm@12.18.0` downloads. On the dev machine `pnpm --version` prints 12.18.0, the
frozen install passes and leaves the lockfile unchanged, and `scripts/pnpm-audit.sh`, which takes the version from
`packageManager` up to the `+`, prints `Audit PASSED`.

**What the hash covers.** It pins the `pnpm` npm tarball, a JavaScript launcher. On Linux that launcher then downloads a
native binary (`@pnpm/exe.linux-arm64-musl` in these builds: "Downloading the pnpm 12.18.0 binary…"), which is what
runs. pnpm checks that binary against the integrity the configured registry publishes (`COREPACK_NPM_REGISTRY` or
pnpm's own config) and against npm's signature, not against this hash; `COREPACK_INTEGRITY_KEYS` set to `0` or empty
turns the signature check off. The lockfile does record the binary's integrity (`packageManagerDependencies`, e.g.
`@pnpm/exe.linux-arm64-musl@12.18.0`), but the Corepack launcher path does not read it. Read from the tarball's
`dist/node_modules/get-pnpm/lib/downloadExecutable.js` and `get-pnpm/lib/corepack.js`, not run.

**The Dockerfiles.** `backend/Dockerfile` (base and runner stages), `services/file-service/Dockerfile` and
`services/credential-service/Dockerfile` went from `corepack enable && corepack prepare pnpm@11.9.0 --activate` to
`corepack enable`, with a comment where the first one sits saying where pnpm comes from. `apps/web/Dockerfile` already
ran `corepack enable pnpm` with no version and is unchanged. The backend runner stage never runs pnpm (its command is
`node backend/dist/main`); `corepack enable` is kept there, without a version. hadolint now reports two more DL3059
(info: consecutive `RUN`s) in `backend/Dockerfile`, three in all, where `apk add` and `corepack enable` are separate
steps; it is not a CI gate and was left. The two service Dockerfiles report what they reported before.

**Negative control.** In a bare `node:24-alpine` with this `package.json` and its hash's first two digits changed to
`00`, `pnpm --version` stops with `Error: Mismatch hashes. Expected 007882…, got 9d7882…` and exit 1. With the real hash
it prints "Downloading the pnpm 12.18.0 binary…" and `12.18.0`. Seen in the terminal; no log was kept, unlike the builds
below.

**The four images**, each built with `--no-cache-filter deps,builder` so that Corepack downloads pnpm afresh and the log
shows it (exits and times: the session's scratch `summary.txt`; sizes: `docker images` before the images were removed):

| Image                | Exit | Time  | pnpm downloaded | Hash mismatch | Size    |
| -------------------- | ---- | ----- | --------------- | ------------- | ------- |
| `file-service`       | 0    | 342 s | 12.18.0 only    | none          | 3.78 GB |
| `credential-service` | 0    | 370 s | 12.18.0 only    | none          | 3.36 GB |
| `web`                | 1    | 475 s | 12.18.0 only    | none          | —       |
| `backend`            | 0    | 959 s | 12.18.0 only    | none          | 4.46 GB |

`web` fails in `next build`, after pnpm has downloaded, verified and installed: prerendering `/leasing/wizard` stops
on "useSearchParams() should be wrapped in a suspense boundary". Neither `apps/web` nor its Dockerfile changed on this
branch, and pnpm was 12.18.0 before it too (see [Open](#open)).

Most of a cold build is not the build. In file-service's log `pnpm install` takes 152.9 s, 39.3 s of it pnpm 12's
supply-chain policy check over 2,246 lockfile entries and the rest downloading 1,325 packages with nothing reused;
exporting the image takes 101.1 s and the runner's `COPY --from=builder /app` 51.0 s, against 6.3 s for the build.
The cache-busting flag above makes the install cold on purpose.

**CI, not measured.** `pnpm/action-setup@v5` reads `packageManager` and passes the string, hash included, to its bundled
pnpm as `pnpm install <target> --no-lockfile`; the upstream changes that strip the hash first are not in v5. Run the
same way with the dev machine's global pnpm 11.1.3, that spec resolved to 12.18.0. That is evidence, not proof: the
bundled pnpm is a different version and was not run (running downloaded code was not allowed here). The first CI run of
this branch's PR is the measurement. Its `conformance-tests` job will fail for another reason, already failing before
this branch (fixed later on `chore/pnpm-12-spec`; see [Open](#open)). Whether pnpm's own version switching (the audit
gate's isolated run) checks the hash was not tested either; it ran 12.18.0 with the hash present.

## Open

- **Sample records on the `6a076c6d` pages are shown in English.** `SAMPLE_*` / `INITIAL_*` constants in
  `leasing/page.tsx`, `leasing/properties/[id]`, `crm/tenders/[id]`, `finance/factoring` and `safety/ai-vision` hold
  names, asset types, work packages, zones and, on `safety/ai-vision`, alert titles and details ("NO HARD HAT DETECTED",
  "Immediate attention required…") that the pages show as they are. Left as data by D30; whether demo records should be
  translated, or the pages read real data, is a product decision.
- **CI has not run since 2026-11-08.** The last successful `ci.yml` run is `develop` 42437048167 (2026-11-08 02:05 UTC).
  From `develop` 42487331144 (2026-11-08 13:56 UTC) on — `develop` again on 11-08 and 11-10, and every branch from
  `fix/audit-gate-pnpm12` to `fix/web-factoring-rates` — jobs failed without starting ("The job was not started because
  recent account payments have failed or your spending limit needs to be increased", GitHub billing) or were skipped.
  Nothing since has been checked by CI, including `pnpm/action-setup` with the `+sha512` pin.
- **drone-mission-detail's "LandXML Ready" badge claims a readiness nothing provides.** It sits under the net soil
  balance, while no export exists (D36); the large export button also keeps its `picture-as-pdf` icon. Translated with
  its meaning kept ("พร้อม LandXML") on `fix/mobile-6a076c6d-i18n`, not changed there; whether to drop or reword it is a
  product decision.
- **`checkout.tsx` still hard-codes English beyond its back label.** "THB (VAT Included)", "Biller ID", "Reference 1
  (Inv)", "Reference 2 (Project)", "THAI QR PAYMENT" and others bypass `t()`. Only the back label was in scope on
  `fix/mobile-6a076c6d-i18n`.
- **The drone-capture scan-mode buttons show no selected state.** "Point Cloud" / "Orbit Scan" change only a style and
  an icon colour — no text, no `accessibilityState.selected` — so neither a screen reader nor a test can tell which is
  active; they are left out of the render specs for that reason.
- **Re-measure the LCP budget under Lighthouse 13 (D26).** `apps/web/.lighthouserc.json` keeps the LCP
  `maxNumericValue` at 3200, which was set from Lighthouse 12's numbers. Lighthouse 13 reports a much lower simulated
  LCP for /login (see [branch 3](#branch-3--zod-3-second-source-lhcicli-0151--0160)), so the gate has far more
  headroom than when it was ratified. A new budget needs ubuntu-latest runs of `lighthouse.yml` under 13, as that
  workflow requires; it is a product-owner decision.
- **The `allowBuilds` comment in `pnpm-workspace.yaml`** says puppeteer's postinstall never runs on a CI runner. But
  the 12 CI jobs that install, and `apps/web/Dockerfile`, run an unfiltered `pnpm install --frozen-lockfile` that
  includes root devDependencies, so it does run there. Its "~150 MB" is also low: Chrome and chrome-headless-shell
  156 take about 367 MB and 203 MB on macOS. It reaches proxy-agent through `@puppeteer/browsers`' out-of-range
  optional peer (branch 2 removed that link and branch 3 brought it back). This predates the series.

- **Closed — `backend/test/auth-tenant/01-entities-rls.integration.spec.ts` expected three `plan_type` values.** The
  database has four since `512dc085` added `LITE` (trial lifecycle). Fixed on `fix/rls-spec-lite`: the assertion expects
  LITE, the spec's shared-realm comment and `docs/specifications/11-database-schema.md` (`plan_type`, `keycloak_realm`)
  name it too. That spec file alone, against its Testcontainers database: 14 of 15 before, 15 of 15 after.
  `docs/architecture/technical-design/phase-02-authentication-and-tenant-system.md` (the `tenants` row and the realm
  model) names LITE too, with the commit that added it (product-owner decision). A /doubt review of that branch found
  LITE missing in one more place that matters: `services/ai-gateway/usage.py` `QUOTA_BY_PLAN` had no `LITE` key, so a
  LITE tenant's AI usage summary read as uncapped, with no 80 % / 100 % alert, against §26.1's 500K SMB quota. The same
  branch adds `"LITE": 500_000` with a test (ai-gateway: 651 passed, 2 skipped, coverage 99.39 %), and names LITE in
  `docs/api/ai.openapi.yaml` (the `/ai/usage` description and the `quota` field), `apps/mobile/src/api/ai.ts`,
  `docs/specifications/20-ux-flow.md`, `DESIGN.md`, `context/phases/phase-02-authentication-tenant-system.md` (the
  `plan_type` and `keycloak_realm` lines and the realm model), and the shared-realm comments in `tenant.service.ts`,
  `schema.prisma`, `@cos/types` `admin-api.ts`, `backend/src/modules/identity/README.md` and
  `tests/conformance/auth-tenant/01-keycloak-realm.spec.ts`. The RLS spec re-run after the last edit: 15 of 15.
  `docs/architecture/adr/108-platform-settings-store.md` still lists three plans and is left as decided at the time.
  `docs/specifications/11-database-schema.md`'s `platform.tenants` table does not yet show the other columns that
  migration added (`subscription_status`, the `trial_*` columns, `converted_at`) or `tenant_trial_notices`. Documented
  since, on `docs/schema-trial-lifecycle`: the six columns (three carry CHECKs), `tenants_trial_dates_consistent`,
  `tenants_trial_lifecycle_idx`, and a `platform.tenant_trial_notices` section (columns, key, and its RLS, which departs
  from the §11.0 template: one SELECT-only policy, no write policy); a one-off script, not kept, comparing the migration
  with the doc's rows (columns, types, CHECK values, constraint, index and policy names) finds no difference.
  `platform.tenants`' `timezone` column (migration `20260723000002`) was documented next, on
  `docs/schema-tenant-timezone`; the same Prisma-vs-doc script then lists 17 columns on both sides. Its row says no
  endpoint changes it after creation — the code comments' "a tenant may override it afterwards" is not built (nothing in
  `backend/src` outside tests assigns it).
- **Closed — the ai-ocr-pipeline image had no Thai OCR data.** Fixed on `fix/ocr-thai`. Without `tha`, tesseract
  printed "Failed loading language 'tha'", carried on with English only and exited 0, so Thai came back as Latin
  noise. The Dockerfile now installs `tesseract-ocr-tha` (Debian 1:4.1.0-2; the image grows 619.0 → 621.0 MB). That
  showed a second fault: `_ocr_image` joined tesseract's tokens with spaces, and for Thai each token is a character or
  cluster, so the text read "ร า ย ง า น". `_join_words` now joins Thai-to-Thai tokens on one line without a space
  unless the gap is wider than half the line's median token height (product-owner decision to fix it here). Measured
  in the service image before and after, on inputs Chrome rendered (Pillow here has no raqm and dropped Thai tone
  marks) and branch 5's eight English inputs:

  | Input                | CER before | CER after | Spaced CER before | Spaced CER after |
  | -------------------- | ---------- | --------- | ----------------- | ---------------- |
  | Thai, Tahoma         | 0.932      | 0.080     | 0.845             | 0.093            |
  | Thai, Thonburi       | 0.938      | 0.062     | 0.864             | 0.068            |
  | Thai + English       | 0.413      | 0.064     | 0.351             | 0.054            |
  | Thai PDF, two pages  | 0.718      | 0.000     | 0.659             | 0.023            |
  | seven English inputs | 0          | 0         | 0                 | 0                |

  Spaces between Thai words are best-effort: tesseract's gaps separate them only roughly. A /doubt reviewer's six
  further Chrome-rendered pages (Tahoma 16, 20, 28 px; Sukhumvit 28 px; grey text 28 px) gave spaced CER 0.79–0.81
  joined as before, 0.030–0.037 with no Thai spaces, and 0.022–0.030 with this rule, never worse than either; some
  real spaces are still lost and a tone mark on grey text gained one. CER ignores whitespace; spaced CER counts it.
  The English texts are byte-identical before and after. The 32-bit I mode TIFF still fails (now `KeyError: 'conf'`,
  before `'text'`; see below). The service's suite: 50 passed (41 + 9 new), coverage 100 %.
  `verify-before-push.sh --full`: 47 passed, 2 failed (openapi freshness, the MinIO image), 4 skipped; "Python —
  ai-ocr-pipeline", both audits and markdownlint pass. `pip-audit` on the service: no known vulnerabilities.

  ```js
  // node make_thai_inputs.mjs <outdir>: Thai OCR inputs rendered by Chrome (correct Thai shaping), plus truth.json.
  import { writeFileSync, realpathSync } from 'node:fs';
  import { createRequire } from 'node:module';
  const require = createRequire(
    realpathSync(process.env.REPO + '/node_modules/@mermaid-js/mermaid-cli') + '/package.json',
  );
  const puppeteer = require('puppeteer');
  const out = process.argv[2];
  const docs = {
    'thai_tahoma.png': {
      font: 'Tahoma',
      lines: [
        'รายงานประจำวัน ๖ พฤศจิกายน ๒๕๖๙',
        'เทคอนกรีตพื้นชั้นที่ ๓ เรียบร้อยแล้ว',
        'ผู้ตรวจสอบลงนามเวลา 14:30 น.',
      ],
    },
    'thai_thonburi.png': {
      font: 'Thonburi',
      lines: [
        'ใบสั่งซื้อเหล็กเสริม 12 มิลลิเมตร',
        'จำนวน 250 เส้น ส่งที่หน้างาน',
        'กรุณาตรวจรับภายในวันศุกร์',
      ],
    },
    'mixed.png': {
      font: 'Tahoma',
      lines: ['Concrete pour ชั้น 3 เสร็จแล้ว', 'Inspector: สมชาย ใจดี', 'Rebar check ผ่าน 100%'],
    },
  };
  const html = (font, lines) =>
    `<html><body style="margin:0;background:#fff"><div style="font-family:'${font}';font-size:40px;line-height:70px;padding:30px 40px;color:#000">${lines.map((l) => `<div>${l}</div>`).join('')}</div></body></html>`;
  const browser = await puppeteer.launch({ headless: 'shell' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 280 });
  const truth = {};
  for (const [name, d] of Object.entries(docs)) {
    await page.setContent(html(d.font, d.lines));
    await page.screenshot({ path: `${out}/${name}`, fullPage: true });
    truth[name] = d.lines.join('\n');
  }
  const pdfLines = [
    ['งวดงานที่ ๒ ส่งมอบแล้ว', 'ค่าแรงรวม 45,000 บาท'],
    ['หน้าสอง: ตรวจรับโดยวิศวกร', 'Rebar check passed'],
  ];
  await page.setContent(
    `<html><body style="margin:0">${pdfLines.map((p, i) => `<div style="font-family:Tahoma;font-size:40px;line-height:70px;padding:40px;${i ? 'page-break-before:always' : ''}">${p.map((l) => `<div>${l}</div>`).join('')}</div>`).join('')}</body></html>`,
  );
  await page.pdf({
    path: `${out}/thai_two_pages.pdf`,
    format: 'A5',
    landscape: true,
    printBackground: true,
  });
  truth['thai_two_pages.pdf'] = pdfLines.map((p) => p.join('\n')).join('\n\n');
  await browser.close();
  writeFileSync(`${out}/truth.json`, JSON.stringify(truth, null, 1));
  console.log(Object.keys(truth).join(' '));
  ```

  ```python
  # Inside the service image: python run_ocr_cer.py <dir>... Each dir holds inputs and a truth.json. One JSON line per
  # input: text, confidence, and two character error rates against the truth: `cer` with all whitespace removed, and
  # `cer_spaced` with spacing scored (whitespace runs and line breaks count as one space).
  import json, sys
  from pathlib import Path
  import ocr_pipeline

  def _ed(ref, hyp):
      prev = list(range(len(hyp) + 1))
      for i, r in enumerate(ref, 1):
          cur = [i]
          for j, h in enumerate(hyp, 1):
              cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (r != h)))
          prev = cur
      return round(prev[-1] / max(len(ref), 1), 4)


  def cer(ref, hyp):  # spacing ignored
      return _ed(''.join(ref.split()), ''.join(hyp.split()))


  def cer_spaced(ref, hyp):  # spaces count; runs of whitespace and line breaks become one space
      return _ed(' '.join(ref.split()), ' '.join(hyp.split()))

  for d in map(Path, sys.argv[1:]):
      truth = json.loads((d / 'truth.json').read_text(encoding='utf-8'))
      for name, ref in truth.items():
          f = d / name
          mime = 'application/pdf' if f.suffix == '.pdf' else 'image/' + f.suffix.lstrip('.')
          row = {'file': name}
          try:
              o = ocr_pipeline.process_file(f.stem, f.read_bytes(), mime)
              row.update(cer=cer(ref, o.extracted_text), cer_spaced=cer_spaced(ref, o.extracted_text), confidence=round(o.confidence_score, 4), text=o.extracted_text)
          except Exception as e:
              row['error'] = f'{type(e).__name__}: {str(e).splitlines()[0][:120]}'
          print(json.dumps(row, ensure_ascii=False), flush=True)
  ```

- **MLflow server v3.17.2-full is in the manifests, not deployed.** Rolling it out is a deployment step outside this
  work. Back up the backend store first; with `Recreate`, MLflow is down from the old pod's exit until the new one is
  ready, migration included (seconds on the small stores measured; a real-size store was not tried — the `startupProbe`
  allows ten minutes). The packages the `-full` image adds over the plain one (1.93 GB against 1.33 GB) are not audited:
  CI's pip-audit covers the client requirement sets only.
- **Enterprise provisioning has not been run against RDS, and three things it needs are unverified there.**
  `createRdsActivity` creates PostgreSQL 15 on RDS. The migrations call `create_hypertable` without creating the
  TimescaleDB extension, which RDS does not offer, so `prisma migrate deploy` is expected to stop there.
  `20260608000004_rls_policies` creates a role with BYPASSRLS, and the copy needs `SET session_replication_role` and a role
  that bypasses RLS; whether the RDS master user may do each was not checked. The integration spec runs on TimescaleDB
  pg16 as superuser. Found on `fix/enterprise-provisioning-db`; needs a decision on the dedicated database's engine
  (or on making those migrations conditional) and a run against a real RDS instance.
- **Re-inviting a vendor identity for another vendor keeps the old vendor.**
  `VendorIdentityRepository.createRelationship` inserts `ON CONFLICT (tenant_id, vendor_identity_id) DO UPDATE SET
status = 'ACTIVE'` and leaves `vendor_id` as it was. Inviting the same e-mail address for a different vendor of the
  tenant therefore keeps the relationship on the first vendor, and that person's quotations are filed under it
  (`resolveVendorId`). Since D56 the new vendor id is checked to be the tenant's, and then ignored on conflict. Found
  by review on `fix/cross-boundary-fks`; whether one person may act for two vendors of a tenant (and so whether to
  update the vendor or refuse the second invitation) is a product decision.
- **Telemetry and provisioning: runs begun before D48, and MLOps reading the shared database.** A provisioning run
  begun before D48 still switches routing before the approval wait and does not pause the tenant; device sync and CRM
  writes during that wait go to the dedicated database, and since D55 the copy then finds them there and refuses (the
  counts differ). No such run is known to exist — provisioning has not run against a real RDS (Open, above). MLOps
  (`mlops/feast/features/site_features.py`, the Airflow DAG) reads telemetry from the shared database, so for a moved
  tenant it reads the stale copy — true before D55 as well. Found on `fix/copy-remaining-schemas`.
- **A moved tenant's rows stay in the shared database.** The provisioning copy (D46) copies a tenant's rows to its
  dedicated database and does not delete them from the shared one. Nothing reads them there any more — routing (D48,
  D50), the drain (D51) and the sweeps (D54) all skip a tenant with a dedicated database — but they are personal and
  commercial data kept twice, in a database the tenant no longer uses, and a data-subject erasure on the dedicated
  database leaves the old copy. Found on `fix/dedicated-db-sweeps`; deleting them after a verified provisioning (and
  when) is a product decision.
- **What the provisioning pause and refusing an inactive tenant still cost.** D48 pauses a tenant by setting
  `is_active` to false; D50 refuses an inactive tenant on every path; D51–D53 drain, wait and replay around the pause.
  Left: SYSTEM_ADMIN cannot deactivate a tenant while it is paused (`deactivateTenant` finds it inactive), and the
  resume would set it active again — the same for a deactivation between the workflow reading `is_active` and pausing.
  A deactivated tenant's events go to its DLQ and stay there (only a pause's window is replayed); its data subjects
  cannot verify a request and its data export is refused (PDPA may require serving them after deactivation —
  product-owner decision 2026-11-13 to refuse). Procurement RFQ/PO workflow activities of a paused tenant fail and
  retry under their own policies, and fail their workflow if the pause outlasts them. A DLQ replay has no timeout of
  its own: a partition whose remaining entries are never delivered (retention, or an overlapping earlier attempt in
  the same group) holds it until the 30-minute activity limit, and the run shows REPLAYING_EVENTS meanwhile. Each
  tenant transaction on the shared database now makes two more round trips (the lock, the read); `resolveTenantDb`
  still opens and closes a client per call. A shared escalation candidate whose tenant is paused or moved between the
  send and the marker is not marked, and its dedicated copy is escalated again — a duplicate notice. While the pause
  waits for a long tenant transaction, new ones queue behind it and fail at Prisma's 5 s interactive-transaction
  limit. A replay re-delivers to every consumer group of the topic; groups that already handled an event skip it only
  within `@cos/kafka`'s 24 h idempotency window, so a pause longer than that could see an event handled twice; a
  replayed message has no key, so its partition is not the original's. The export's check asks Temporal through
  `getClient()`, which the SDK marks experimental over a NativeConnection. A run begun before D48 also passes through
  MIGRATING_DATA, ASSIGNING_DB and VERIFYING without a pause; a tenant deactivated during such a run would make an
  export wait up to 24 h for nothing. Found on `fix/provisioning-copy-before-switch`, `fix/non-jwt-tenant-routing` and
  `fix/provisioning-pause-gaps`.
- **Closed — the unused `@confluentinc/schemaregistry` removed from backend (D27).** On `chore/remove-schemaregistry`:
  the dependency line goes from `backend/package.json`; backend's production closure loses 89 packages and gains
  none (the lockfile loses 68; the rest are still used elsewhere), and no other importer changes. The Azure SDK
  leaves the lockfile entirely, so branch 4's `@azure/identity` override, which now matched nothing, is removed with a
  note (D14). Four overrides that already matched nothing before this change (`@xmldom/xmldom`,
  `@expo/plist>@xmldom/xmldom`, `@remix-run/server-runtime`, `turbo-stream`) are reported, not touched.
  Six entries are now marked optional in the lockfile, their only remaining path being optional: `joi@17.13.9`,
  `@hapi/hoek@9.3.0`, `@hapi/topo@5.1.0` and the three `@sideway/*`. `packages/@cos/shared/README.md`'s
  dependency list, which named this package and `@cos/kafka`'s dependencies, now lists what `@cos/shared` declares.
  backend: `pnpm test:cov` 257 suites / 4,207 tests with its gate, `pnpm build` and `tsc --noEmit` pass. The backend
  image builds and is 5.48 GB (branch 4: 5.56 GB). Started offline in that image, `node backend/dist/main` loads
  `./app.module` and every module behind it (line 13 of `main.js`), reaches `bootstrap()` and stops at the expected
  `APP_DATABASE_URL is not set` check, with no `MODULE_NOT_FOUND`.
  `verify-before-push.sh --full`: 47 passed, 2 failed (openapi freshness, the MinIO image), 4 skipped; both audits and
  "Lint — markdownlint" (421 files, now actually linted) pass.
- **Closed — the markdownlint step of `verify-before-push.sh` linted nothing on macOS.** Fixed on
  `fix/markdownlint-gate-bash32`. `scripts/ci/check-markdown-changed.sh` built its file list inside `<( … )`, and a
  comment in that body held an unpaired quote (the apostrophe in "CI's Lint job"), which `/bin/bash` 3.2 cannot parse
  there: "bad substitution", an empty list, "nothing to lint", exit 0. The list is now built in a function, and the
  script fails closed when any of its three `git` listings fails. Eight cases, run with the harness below in a scratch
  clone on `/bin/bash` 3.2 and on bash 5.2 (Docker `node:24`): the old script exited 0 in all eight on 3.2, lint
  errors included, and on 5.2 exited 0 in the three cases where `git` failed; the new one fails on lint errors and on
  each `git` failure on both shells, and otherwise behaves as before. The clone links `node_modules` from the repo, so
  the harness runs with `pnpm_config_verify_deps_before_run=false`.

  ```bash
  #!/usr/bin/env bash
  # cases.sh <clone> <script-under-test> [label]: the six M.2 cases, each from a clean state in <clone>
  # (HEAD = upstream, nothing changed). One line per case: name, exit status, the gate's last line.
  set -u
  clone=$1 script=$2 label=${3:-}
  cd "$clone" || exit 2
  LONG=$(for i in $(seq 1 30); do printf 'word%s ' "$i"; done)  # ~200 chars with spaces, so MD013 counts it
  reset_state() {
    # .fakebin is in .git/info/exclude, so `git clean` keeps it: remove it and the PATH entry by hand.
    rm -rf .fakebin; PATH=$BASE_PATH
    "$REAL_GIT" reset -q --hard "$start" && "$REAL_GIT" clean -qfd -e node_modules
  }
  run_case() {
    local name=$1; shift
    reset_state
    "$@"
    out=$(bash "$script" 2>&1); rc=$?
    last=$(printf '%s\n' "$out" | grep -E 'nothing to lint|Summary:|✗|bad substitution' | tail -1)
    printf '%-34s exit=%-3s %s\n' "$label$name" "$rc" "$last"
  }
  start=$(git rev-parse HEAD)
  REAL_GIT=$(command -v git)  # resolved once, before any fake exists
  BASE_PATH=$PATH
  case_a() { printf '\n%s\n' "$LONG" >> docs/runbooks/README.md; git commit -qam 'case a'; }
  case_b() { printf '\nA short, clean line.\n' >> docs/runbooks/README.md; git commit -qam 'case b'; }
  case_c() { :; }
  case_d() { printf '# New\n\n%s\n' "$LONG" > docs/runbooks/brand-new.md; }
  case_e() { printf '\n%s\n' "$LONG" >> docs/specifications/README.md; git commit -qam 'case e'; }
  case_f() {
    mkdir -p .fakebin
    printf '#!/bin/sh\n[ "$1" = ls-files ] && { echo "fatal: simulated failure" >&2; exit 128; }\nexec %s "$@"\n' "$REAL_GIT" > .fakebin/git
    chmod +x .fakebin/git; export PATH="$PWD/.fakebin:$PATH"
  }
  case_f2() {
    mkdir -p .fakebin
    printf '#!/bin/sh\n[ "$1" = diff ] && [ "$4" != HEAD ] && { echo "fatal: simulated failure" >&2; exit 128; }\nexec %s "$@"\n' "$REAL_GIT" > .fakebin/git
    chmod +x .fakebin/git; export PATH="$PWD/.fakebin:$PATH"
  }
  case_f3() {
    mkdir -p .fakebin
    printf '#!/bin/sh\n[ "$1" = diff ] && [ "$4" = HEAD ] && [ "$5" = "--" ] && { echo "fatal: simulated failure" >&2; exit 128; }\nexec %s "$@"\n' "$REAL_GIT" > .fakebin/git
    chmod +x .fakebin/git; export PATH="$PWD/.fakebin:$PATH"
  }
  run_case "a lint error, committed" case_a
  run_case "b clean change, committed" case_b
  run_case "c no Markdown change" case_c
  run_case "d untracked new file, error" case_d
  run_case "e excluded tree only, error" case_e
  run_case "f ls-files fails" case_f
  run_case "f2 the base diff fails" case_f2
  run_case "f3 the HEAD diff fails" case_f3
  reset_state
  ```

- **Closed — Markdown backlog the broken gate hid: 19 markdownlint errors in 3 files, changed since
  `origin/develop`.** Fixed on `fix/markdown-backlog`, formatting only (`git diff --word-diff` changes no word): the
  MD013 lines rewrapped, and ADR-110 keeps its decision numbers 1–22, which run across the amendment rounds and are
  cited by number, under a file-level `markdownlint-disable MD029` with its reason (product-owner decision).
  `docs/architecture/adr/110-first-tenant-admin-bootstrap.md` (17: 15 MD029, 2 MD013), `docs/api/error-codes.md` (1)
  and `docs/runbooks/mfa-enforcement.md` (1), all last changed in `10be1567` (before the series). CI's Lint job would
  have failed on them when this work opened a PR into `develop`; after the fix the three files lint clean and the
  local gate passes on `/bin/bash` 3.2.
- **Closed — four Dockerfiles pinned `pnpm@11.9.0` that no longer ran, and no hash was pinned.** Fixed on
  `chore/pnpm-pin-hash`: `packageManager` carries `+sha512`, and the Dockerfiles run `corepack enable` with no version.
  Corepack refuses a launcher tarball whose hash differs (the native binary it fetches is checked by pnpm against the
  registry, not this hash). See [One pnpm pin, with its hash](#one-pnpm-pin-with-its-hash-chorepnpm-pin-hash).
- **Closed — the conformance test and two docs still said pnpm 11.** Fixed on `chore/pnpm-12-spec`: the product owner
  made 12 the spec's major (D28, 2026-11-10). `context/phases/phase-01-foundation-repository.md` § Tooling, the test
  (`tests/conformance/foundation/02-workspace.spec.ts`), `README.md`, `docs/manual/getting-started.md`,
  `docs/manual/tech-stack.md` and the two JSON helpers that quote README (`.claude/hooks/lib/json-query.mjs`,
  `scripts/readiness/jsonpick.mjs`) say 12, and `engines.pnpm` is `>=12.0.0` (`pnpm install`: lockfile unchanged). The
  foundation conformance specs: 1 failed and 442 passed before (this test), 443 of 443 after. Seven of the eight places
  that said "pnpm 10/11 reads `nodeLinker` from `pnpm-workspace.yaml`" now say 11–12: on 11.1.3 and on 12.18.0, in a
  scratch copy of `apps/mobile`, `pnpm config get nodeLinker` and `node-linker` follow the value in
  `pnpm-workspace.yaml` (`hoisted`, then `isolated` when changed there) and are `undefined` with `node-linker=hoisted`
  only in `.npmrc`. That is how the setting resolves; no install was run. pnpm 10 was not measured, so it is no longer
  named; the dated OQ-5 row in the Phase 1 technical design keeps its wording.
- **Closed — `apps/web` did not build: `/leasing/wizard` called `useSearchParams()` outside `<Suspense>`.** Fixed on
  `fix/web-leasing-wizard-suspense`. The page (from `6a076c6d`, 2026-11-08) read `?property=` and `?unit=` at its top,
  so Next.js 16.4.4 could not prerender it and `next build` stopped ("missing-suspense-with-csr-bailout"); CI's `build`
  job runs `next build` on every PR. The wizard body is now `LeaseWizard`, unchanged, and the page renders it inside
  `<Suspense>` whose fallback is an empty container with no text (the `AppShell` main area gives it no height, so until
  hydration the page shows the shell's own background). `pnpm --filter @cos/web build`: exit 1 before, exit 0 after, 72
  of 72 pages, `/leasing/wizard` static (its prerendered HTML holds only the fallback). web `type-check`, `lint` and its
  413 tests pass. The web image, `docker build -f apps/web/Dockerfile .`: exit 1 on `chore/pnpm-pin-hash` (475 s, that
  branch's build summary), exit 0 now (287 s, 72 of 72 pages, image 322 MB, then removed). Exit codes, times, the size
  and the test summary were saved with each run's output in the session's scratch logs (`before.log`, `after.log`,
  `typecheck.log`, `lint.log`, `test.log`, `docker.log`, `docker-summary.txt`); before and after were each run twice.
  Not measured: the prefilled form in a browser — the `(app)` routes need a Keycloak login, and no Keycloak or test user
  was available locally; the component body is unchanged.
- **Closed — `/leasing/wizard` was in English only.** Fixed on `fix/web-leasing-wizard-i18n`. An inventory of the page
  found 45 user-facing strings outside `t()` (39 by a scan of JSX text, 6 more inside expressions); they are now 45 keys
  under `leasing.wizard` in `en.json` and `th.json`, with the English values word for word as before, so the English
  page reads the same, and variable parts as `{name}` placeholders, filled in one pass by a small `fill()` in the page
  rather than a chain of `.replace` calls (the repo's way elsewhere): the values are typed by the user or come from the
  URL, and a string `.replace` reads `$&` in a value as a pattern and can fill a placeholder an earlier value brought
  in. Three Thai strings were reworded after /doubt (`targetProperty`, `monthlyCommitment`, `step5Title`). Icon ligature
  names and the form's demo defaults (property, unit, company, tax id, signatory, amounts, dates) are data and were
  left. A new test, `apps/web/src/i18n/__tests__/locales.spec.ts`, fails when the two files' keys differ or a key's
  `{placeholders}` differ between languages (both checked by making each mismatch on purpose: 1 failed each); today both
  files hold 1,539 keys. A third check, no empty values, was dropped because `risk.colActions` is empty in both files on
  purpose (the actions column header). After: a rescan finds no English outside `t()` but the data defaults; the web
  build exit 0 (72 of 72 pages), web `type-check` and `lint` exit 0, 415 tests pass. Not checked in a browser in either
  language (Keycloak login, as for the Suspense fix).
- **Closed — five more pages from `6a076c6d` had hard-coded English.** Fixed on `fix/web-6a076c6d-i18n` (D29, D30).
  `leasing/page.tsx` 15 keys (`leasing.portfolio`), `leasing/properties/[id]` 20 (`leasing.property`),
  `crm/tenders/[id]` 24 (`crm.tender`), `finance/factoring` 21 (`finance.factoring`), `safety/ai-vision` 21
  (`safety.aiVision`): 101 keys, English word for word, Thai alongside; both files now hold 1,640 keys. Status values
  keep their code values and are shown through `t()` (`revStatus`, the payout status; the unit status through the
  existing `leasing.status*` keys); demo sentences take their figures and names as `{placeholders}`. `fill()` moved from
  the wizard to `apps/web/src/i18n/fill.ts`, with its own spec (7 cases, including `$&` in a value and a placeholder
  inside a value) and in `collectCoverageFrom`. Of 50 templated strings, 45 render the old English word for word by
  script (whitespace collapsed; the spaces around icons were checked by hand); the other 5 were read: the unit name is
  always `Unit {id}`, `?? ''` renders as `undefined` did, and two `formatMoney` calls are unchanged. After /doubt,
  eleven Thai strings were reworded (two had changed the meaning: `crm.tender.belowCeiling` read as a double negative
  with "-3.67%", and `leasing.property.aiInsight` said "above 15%" for "15% higher"). A rescan finds only the sample
  records, proper names, figures and HUD labels (`FPS: 30 • 1080p`). Web `type-check`, `lint` and the web build (72 of
  72 pages) exit 0; 422 tests pass with coverage at the gate. Not checked in a browser (Keycloak login).
- **Closed — the factoring modal stated 85% and 1.5% for every invoice.** Fixed on `fix/web-factoring-rates`. The labels
  "Advance Capital ({percent}):" and "Fast Factoring Fee ({percent} flat):" now take the open invoice's own
  `advanceRate` and `feeRate` through `formatPercent` (`src/lib/format.ts`, in the coverage gate), the rates the amounts
  beside them were always computed from; the table's advance-rate cell uses it too instead of `rate * 100` and a raw
  `%`. Printed by a throwaway spec with the real `fill` and `formatPercent`, in English and Thai: fac-1, fac-3 and fac-4
  read as before (85%, 1.5%), fac-2 now reads 90% and 1.4% where it said 85% and 1.5%. `formatPercent` keeps at most one
  decimal, so a rate such as 0.0125 would read 1.3% beside an amount worked out at 1.25%; none of the sample rates has a
  second decimal. The page-level KPI "Flat 1.5% discount fee" is not one invoice's figure and was left. Web
  `type-check`, `lint` and the web build (72 of 72 pages) exit 0; 422 tests pass with coverage at the gate.
- **Closed — `apps/mobile` did not get the pinned pnpm, and its lockfile failed a frozen install on pnpm 12.** Fixed on
  `fix/mobile-pnpm-pin` (D31). With 12.18.0 (as CI's mobile jobs run it), `pnpm install --frozen-lockfile` in
  `apps/mobile` stopped with `ERR_PNPM_OUTDATED_LOCKFILE`: "local dependency `@cos/schemas` … is outdated" — `5445f97b`
  (2026-11-08) raised `@cos/schemas`' `zod` to `^4.6.6`, and the mobile lockfile still held `zod` 4.4.3, below that
  range; pnpm 11.1.3 let it through. `apps/mobile/package.json` now carries the root's exact `packageManager` string,
  and against HEAD the lockfile has two changes only: a first YAML document with `packageManagerDependencies` (`pnpm`
  and `@pnpm/exe` 12.18.0) and `zod` 4.4.3 → 4.6.7, the version the root resolves; `pnpm install` (12.18.0) then found
  it up to date and `--frozen-lockfile` exits 0. The `zod` change was written earlier, by the "before" run itself: with
  no pin, `pnpm run type-check` in `apps/mobile` ran the machine's pnpm 11.1.3, whose check before a run re-installed
  and moved `zod` ("Packages: +1 -40"), so the "before" `type-check`, `test:cov` and `test:render:cov` ran with `zod`
  4.6.7 already, while `eslint` and the a11y gate ran on HEAD. No file in `apps/mobile/src` imports `zod` or
  `@cos/schemas`, and the hoisted `zod` stays 3.25.76; the change lands only under `node_modules/@cos/schemas`. A
  scratch `--lockfile-only` run had also added `supports-color` to peer suffixes; the real install did not. Mobile's CI
  commands, before and after: `eslint apps/mobile/src`, the RN a11y gate, `type-check` and `test:cov` (1,149 tests) exit
  0; `test:render:cov` passes 1,751 tests and misses its coverage ratchet the same way both times (Open).
  `docs/manual/mobile.md` and `getting-started.md` say mobile installs with the pinned pnpm. Not measured: `expo
prebuild`, native builds, Detox, EAS.
- **Closed — Rule 28 said a `packageManager` change moves no lockfile; on pnpm 12 it does.** Fixed on
  `chore/rule28-packagemanager`. Measured first, in a scratch copy of `apps/mobile`: with `packageManagerDependencies`
  edited to 12.17.0 and `packageManager` at 12.18.0, `pnpm install --frozen-lockfile --lockfile-only` (12.18.0) exits 0
  and rewrites the document back to 12.18.0 (64 occurrences of 12.17.0 → 0). So a pin bump without its lockfile does not
  fail CI; it leaves a diff for whoever installs next. `scripts/ci/check-lockfile-staged.sh` now gates `packageManager`
  with the dependency fields — its name@version only, and only in a `package.json` with its own lockfile beside it,
  because after /doubt a scratch project showed that adding the `+sha512` part at the same version leaves the lockfile
  byte-identical (pnpm records `specifier: 12.18.0`), and a nested package's pin moves no lockfile (header comment
  dated, the 2840dd7 history kept), and Rule 28 in `context/00_master_construction_os.md` and
  `.claude/rules/rule-26-27-28-dependency-sync.md` lists it, with the amendment dated 2026-11-11. The hook, run in a
  scratch git repo: a root pin change without `pnpm-lock.yaml` → exit 1 naming it; with it staged → 0; a mobile pin
  change → exit 1 naming `apps/mobile/pnpm-lock.yaml`, also when only the root lockfile is staged; with the mobile
  lockfile → 0; a `scripts`-only change → 0; a dependency change without its lockfile → 1; `SKIP_LOCKFILE_CHECK=1` → 0;
  a hash-only change (root) and a hash added (mobile) → 0; a nested package adding `packageManager` → 0, and with a
  dependency too → exit 1 naming the root lockfile; a whitespace-only reformat → 0. shellcheck clean. The measurement is
  of `--frozen-lockfile --lockfile-only`; a full frozen install was not run.
- **Closed — nothing checked that the root and `apps/mobile` carry the same pnpm pin.** Fixed on `test/pnpm-pin-sync`:
  `tests/conformance/foundation/02-workspace.spec.ts` compares `apps/mobile/package.json`'s `packageManager` with the
  root's, whole string (version and hash), next to the existing pnpm-major test; CI's `conformance-tests` job runs it.
  Foundation specs 443 → 444 passed. Negative control: one hash digit changed in the mobile file made it fail, printing
  both strings; the file was restored from a byte copy (`cmp` identical) and the run was green again.
- **Closed — a tenant's `timezone` was checked for shape only.** Fixed on `fix/tenant-timezone-validation`.
  `CreateTenantDto.timezone` (inherited by `CreateTrialTenantDto`) keeps the `Area/Location` regex and the 40-character
  cap and adds class-validator's `@IsTimeZone()`, which runs the same `Intl.DateTimeFormat({ timeZone })` the readers
  do; `docs/api/tenant.openapi.yaml` says so for both request bodies. New spec
  `backend/src/modules/tenant/__tests__/tenant-timezone.dto.spec.ts`, for both DTOs: omitted, and the three region
  defaults, pass; `Mars/Olympus` fails with `isTimeZone`; `UTC` still fails the shape. Before the change: 2 failed (the
  `Mars/Olympus` case, both DTOs), 10 passed; after: green, and backend `test:cov` 4,219 tests with lines and branches
  at 100 %, `type-check` exit 0. Not changed: rows already stored (no production data was read), and the readers, which
  still throw on a zone they do not know.
- **Closed — a 32-bit TIFF failed OCR with `KeyError`.** Fixed on `fix/ocr-32bit-images` (D32). Cause, measured in the
  service image: pytesseract hands the image over in its own format; tesseract's leptonica refuses a signed-integer or
  float TIFF ("Error in pixReadFromTiffStream: sample format = 2 is not uint", 3 for float), exits 0 and writes a TSV
  with the header only; pytesseract returns `{}` and `_ocr_image` indexed it. `ocr_pipeline.py` now scales `I` / `F`
  images from their own min–max to 8-bit `L` (rounded, so the top of the range is 255; a flat image becomes white) and
  returns `("", 0.0)`, logging a warning with the mode it received, when tesseract gives no data; 16-bit `I;16` was left
  alone because it already read (the plan had included it; product-owner decision to narrow D32). In the image, on the
  register's eight inputs regenerated plus three new ones (a Thai page, the same page as 32-bit `I`, a float `F` page):
  the three `I` / `F` files went from `KeyError: 'conf'` to their drawn text (`imode.tif` and `thai_imode.tif` read
  exactly as their RGB counterparts, confidence 0.96 and 0.9425; `float.tif` "FLOAT 42"), and the other eight read the
  same text and confidence before and after. Service tests: 60 passed, coverage 100 %, on Pillow 13.0.0 in an image
  rebuilt from the final tree (the sources' sha256 inside it equal the working tree's; `requirements-dev.txt`'s pytest
  pins) and on the local 12.3.0 venv. The scaling goes through mode `F` (float32), which keeps the full 32-bit range
  (`[-2**31, 0, 2**31-1]` → `[0, 128, 255]`) but cannot tell apart values packed into a narrow band far from zero (2**30
  and 2**30 + 50); after /doubt, `point` straight on the `I` image was tried and dropped — Pillow 13 does that
  arithmetic in float32 too, and shifting by the minimum first overflows int32 on a wide range. Not run here: `ruff`
  (not installed locally; CI runs `ruff check services mlops`).
- **Closed — Pillow outside `services/*` was unpinned and unaudited.** Fixed on `chore/pillow-outside-services` (D33). A
  dry-run resolution of each `mlops` set showed Pillow only in `requirements-mlflow.txt` (13.0.0 through matplotlib
  3.11.2); airflow, feast and base pull none. That file now pins `Pillow==13.0.0` (resolution with the pin: exit 0, same
  89 packages). The mobile screenshot tools get `apps/mobile/scripts/requirements.txt` (`Pillow==13.0.0`,
  `numpy==2.5.4`, both imported by the scripts; their headers say to install it); both scripts import with those
  versions in `python:3.12-slim`; the file, `docs/manual/getting-started.md` and the two capture scripts' comments name
  the Python floor, 3.12 (numpy 2.5.4). CI's pip-audit step now also audits that file, blocking (no known
  vulnerabilities), and a new step audits the four `mlops` sets with `continue-on-error` (Open: their 27 advisories —
  none on Pillow). `docs/runbooks/dependency-upgrade-plan.md` shows Pillow 13.0.0. The mlops conformance specs still
  pass (40). Not run here: the changed CI workflow itself (CI is not running, see Open); its YAML parses.
- **Closed — `mlops` requirement sets carried 27 advisories.** Fixed on `chore/mlops-advisories` (D34). pip-audit on
  candidate sets first: airflow 3.3.2 / 3.4.0, mlflow 3.17.2 / 3.18.0, feast 0.67.0 / 0.68.0 — all clean, including the
  two advisories that had no fix version listed; the lowest of each was taken. Measured in `python:3.12-slim` (one
  container at a time; an earlier parallel attempt failed on PyPI read time-outs): mlops pytest 73 passed on 3.2.2; on
  3.3.2, 22 errors from one cause — Airflow 3.3 removed `DagBag(include_examples=…)` — and with the two test fixtures no
  longer passing it, 73 passed; 3.3.2 without the argument loads the same six DAGs as 3.2.2 with
  `include_examples=False`, no import errors (printed by a probe, not saved). feast 0.64.0 and 0.67.0 both load the
  three feature views (with `psycopg[binary,pool]`, since pinned on `fix/feast-psycopg`; without it, `No module named
'psycopg'`); mlflow 3.14.0 and 3.17.2 both import `update_gateway` and have `MlflowClient.get_latest_versions`. After
  the change, pip-audit on base, mlflow, feast and `requirements-dev.txt` (the airflow set plus pytest, which CI now
  audits in place of `requirements-airflow.txt`): no known vulnerabilities, 62 s with a warm cache (saved in the
  session's scratch `w4b-summary.txt`). The MLflow server image moved to v3.17.2 with the client. CI's mlops audit
  joined the blocking loop; the job timeout went 15 → 25 minutes for it (not yet timed on a runner). mlops conformance
  specs: 40 passed. Comments that named the old versions were updated; `requirements-base.txt` notes that feast 0.67.0
  dropped the uvicorn cap, co-resolution untested.
- **Closed — feast's feature views did not import with `mlops/requirements-feast.txt` alone.** Fixed on
  `fix/feast-psycopg`. They import feast's Postgres offline store, which needs psycopg 3 and its pool; the set had only
  base's `psycopg2-binary`. The file now pins `psycopg[binary,pool]==3.3.8` and `psycopg-pool==3.3.3` (the versions a
  dry-run resolution of the set picked: exit 0, 73 packages; the same as feast's own `postgres` extra,
  `psycopg[binary,pool]>=3.2.5`, pinned). In `python:3.12-slim`, installed from the file alone: psycopg 3.3.8,
  psycopg-binary 3.3.8, psycopg-pool 3.3.3, feast 0.67.0, and all three views load (`procurement_features`,
  `project_features`, `site_features`); pip-audit on the file: no known vulnerabilities (saved in the session's scratch
  `x2-summary.txt` with the command). Only the linux/aarch64 cp312 wheel of psycopg-binary 3.3.8 was exercised (Docker
  on an arm64 Mac); x86_64 and macOS wheels were not checked. Still not exercised by CI: no job imports the feature
  views.
- **Closed — the MLflow manifests could not start or be reached, and the D34 migration note needed a condition.** Fixed
  on `chore/mlflow-db-upgrade` (D35). Measured with Postgres 16 in Docker: (1) the plain `ghcr.io/mlflow/mlflow` image,
  v3.14.0 and v3.17.2 alike, has neither psycopg2 nor boto3, and `mlflow server --backend-store-uri postgresql://…`
  exits with "No module named 'psycopg2'" — neither the k8s Deployment nor the compose file could ever have started; the
  `-full` variant has psycopg2, psycopg and boto3. (2) Under the pod's own constraints (uid 1001, read-only root,
  capabilities dropped) the server also exits — "No usable temporary directory found" — and runs with a writable /tmp.
  (3) A 3.17.2-full server started against a store a 3.14.0-full server had created migrates it itself (alembic
  `b7e4c1a90f23` → `dc11669786a5`) and answers `/health` and `experiments/search` with 200. The code says why (/doubt,
  read from the image): the store runs its upgrade when any table it defines is missing — 3.17.2 defines twelve that
  3.14.0 lacks — and otherwise verifies the schema and refuses an out-of-date one. So the D34 note ("refuses to start
  until `mlflow db upgrade`") is the general rule and this bump is the exception; the initContainer the plan proposed
  was dropped (product-owner decision) and both manifests say to check each future bump. (4) With no `--allowed-hosts`,
  the API answered only localhost / private-IP Host headers: `mlflow.cos.svc.cluster.local:5000` and `mlflow:5000` got
  403 while `/health` stayed 200 — in-cluster clients (e.g. `mlops/kubeflow/training_pipeline.yaml`) would have failed
  with the pod showing Ready. `mlflow db upgrade` itself, run as the pod would run it, needs the same writable /tmp, and
  on an up-to-date or empty store exits 0. Now: both manifests use `v3.17.2-full` with corrected comments and an
  explicit `--allowed-hosts` (the service names, `localhost`, `127.0.0.1`); the Deployment has `strategy: Recreate` (no
  old pod serving a migrated schema), an `emptyDir` at /tmp, and a `startupProbe` (up to ten minutes) so a long
  migration is not killed by the liveness probe. kubeconform: 3 valid, 1 skipped, as at HEAD. Compose, real `up` of
  postgres and mlflow under a throwaway project (host port remapped to 15000 in a scratch override — 5000 is taken on
  the test Mac): `/health` after 7 s, `experiments/search` 200, schema at `dc11669786a5`; with the final command,
  `experiments/search` 200 from the host as `127.0.0.1` and `localhost` and from another container as `mlflow:5000`, 403
  for a foreign Host header; torn down with its volumes each time.
- **Closed — `apps/mobile` render tests missed their coverage ratchet.** Fixed on `test/mobile-render-6a076c6d`. The
  drop came from four screens `6a076c6d` (2026-11-08) added with no render test — `portfolio-leasing`, `drone-capture`,
  `drone-mission-detail`, `line-token-guide` (80 statements and 40 functions uncovered between them). One spec each in
  `apps/mobile/src/app/(app)/__tests__/`, 30 tests, written against what a user sees and does: the guide's four steps in
  order (each title and hint looked up inside its numbered card) and where its two buttons go; the portfolio filters
  ("Logistics" includes cold storage); the survey layers, and that the printed net balance is cut minus fill; the survey
  toggle's text, label and viewport state moving together. `test:render:cov`: before 88.86 / 81.78 / 84 / 89.69
  (statements / branches / functions / lines, exit 1); after 90.09 / 83.20 / 85.64 / 90.97 (exit 0), 1,751 → 1,781
  tests. The floors in `jest.render.config.ts` went up with it, as that file asks (rounded down): 89 / 81 / 85 / 90 → 90
  / 83 / 85 / 90, with a DEPTH PASS 8 entry. After /doubt a scan-mode test was dropped — it could not fail (see Open) —
  and spies are restored in `afterEach`. Mobile `test:cov` (1,149), `type-check`, `eslint apps/mobile/src` and the RN
  a11y gate pass as before. Two things the specs found are Open (below).
- **Closed — two mobile drone screens told the user something that did not happen.** Fixed on
  `fix/mobile-drone-honest-ui` (D36). `drone-mission-detail.tsx`: both export buttons raised "Civil 3D LandXML and PDF
  Topographical Survey Report generated successfully." with nothing behind them; they now say "Report export not
  available yet" / "ยังส่งออกรายงานไม่ได้" and that nothing was generated (new `drone.exportUnavailable*` keys, en and
  th). `drone-capture.tsx`: the link beside "Recent Missions" read "Close" (`common.close`) while opening the mission
  detail, with no role; it now reads `drone.viewAll` ("View all" / "ดูทั้งหมด"), is a button with that accessibility
  label, and goes to the same place. The two render tests that had pinned the old behaviour "as built" now test the new
  one in both languages (19 in the two specs). Mobile `test:render:cov` 1,783 tests, coverage unchanged and over its
  floors; `test:cov` 1,149; the en / th parity spec, `type-check`, `eslint` and the RN a11y gate pass. The rest of these
  screens' English-only text, the export buttons' own wording, and the scan-mode buttons' missing selected state stay
  Open.
- **Closed — mobile screens from `6a076c6d` hard-coded English, and the export buttons promised an export.** Fixed on
  `fix/mobile-6a076c6d-i18n` (D29, D30, D37). `portfolio-leasing`, `drone-capture` and `drone-mission-detail` route
  their text and accessibility labels through `t()` under `leasing.mobile`, `drone.capture` and `drone.mission`: 58 new
  keys, English word for word, Thai alongside; both files now hold 2,783 keys (2,725 before), and the parity spec
  passes. Figures and names (`+1.4%`, `00:14:22`, `Sector 7B`, `+5,330 m³`, `0.5m`, the DSM range's two ends, the six
  GCPs and their RMSE) are `{placeholders}`. Left as data, in English in both languages: the sample properties, the
  "Real Estate V3" badge (the design screen's name), the recent mission "Sector 7B Mesh Gen" and its date "24 Oct 2026",
  the sensor and coordinate-system values, coordinates and GSD, and `line-token-guide`'s four step hints (LINE console
  menus as LINE shows them). The back button on all four screens and on `checkout.tsx` takes `t('common.back')`, as its
  siblings do, so its English label reads "← Back" instead of "Back" — the one English change besides D37. Both export
  buttons now read "Export report (coming soon)" / "ส่งออกรายงาน (เร็วๆ นี้)" (D37), and still raise the D36 alert. The
  five render specs gain 14 tests: Thai text per screen, the filters and the survey toggle working in Thai, both back
  labels, D37 with no "Signed", "PDF" or "Download" left, and one per translated screen that pins its English text word
  for word. 11 of them fail against the screens as they were; the 3 English pins pass there by design and fail when an
  English value in `en.json` is changed. `test:render:cov` 1,797 tests, 90.09 / 83.2 / 85.64 / 90.97 over its 90 / 83 /
  85 / 90 floors (branches measured 83.14–83.22 across runs of the same tree, so its margin is about 0.15 points);
  `test:cov` 1,149; `type-check`, `eslint apps/mobile/src` and the RN a11y gate (0 of 131 tappable files without a
  prop) pass. Found on the way, and Open: the "LandXML Ready" badge, and the rest of `checkout.tsx`.
- **Closed — the backend image was 4.46 GB and baked local secrets in.** Fixed on `perf/backend-image`.
  - Measured first (Docker 29.9.3, 8 CPUs, arm64): 4,460,823,684 bytes, a cold build of 485 s. The 5.56 GB this item's
    Open entry gave was measured in branch 4. The build itself took 15.8 s; the time went into moving a 3.1 GB `/app` —
    the runner copied the builder's whole tree: devDependencies, `infrastructure/terraform/.terraform` (764 MB), the
    other services with their `.venv` (624 MB), `.pnpm-store`, `.claude`, docs. `--workspace-concurrency=1` was left
    alone.
  - **Secrets.** `.dockerignore`'s bare `.env` / `.env.*` matched only the context root, so an image built on a dev
    machine carried `backend/.env` — 46 secret-named keys (database, Redis, Keycloak, AWS, OpenAI, SendGrid, JWT,
    encryption keys, Cloudflare and LINE tokens; whether the values are real was not checked, and if they are they
    warrant rotation) — and `apps/mobile/.env` (`EXPO_PUBLIC_*` only); `services/file-service/.env` and `apps/web/.env`
    are symlinks to the root `.env` (already excluded) and came in dangling. CI's clean checkout has none. The rules are
    now `**/.env`, `**/.env.*`, `!**/.env.example`, with `**/.terraform`, `**/.venv`, `**/__pycache__` and other caches,
    `.pnpm-store` and `.claude`. After: `find` in the backend, file-service and credential-service images finds none of
    them. **Images built locally before this branch still contain `backend/.env` and must not be pushed** — on this
    machine also the measurement tags `cos-backend:before`, `cold2-before`, `lock-before`, `warm-before` and the build
    cache.
  - `backend/Dockerfile`: a `manifests` stage feeds two installs — `deps` (all, to build) and `prod-deps` (`--prod`,
    without `@cos/test-utils`, backend's only workspace devDependency, whose testcontainers tree it would otherwise
    bring). `prod-deps` takes from the builder, by a bind mount, the generated Prisma clients (failing the build if a
    target path is missing), each `@cos/*` package's `dist` and `backend/dist`; the runner copies that tree alone.
    `@cos/kafka`'s manifest, missing from the install stage, is added. `backend/prisma` is not copied, unlike the plan
    said: the API reads nothing from it. Tried and dropped, with the reason in the Dockerfile: `pnpm install --prod`
    over the builder's tree (removed nothing, re-ran `@prisma/client`'s postinstall) and a shared pnpm-store cache mount
    (no faster; 63 MB larger, hard links lost).
  - After: **1,101,568,124 bytes (1.10 GB)**, the runtime layer 3.35 GB → 699 MB. Builds, measured back to back on the
    same machine: cold (`--no-cache`, build cache mounts pruned) 1,369 s → 733 s; a rebuild after a lockfile-only change
    1,381 s → 551 s (export and unpack 465 s → 34 s). The network made single runs vary (the same full install took 70
    to 250 s), so only paired runs are compared.
  - Same behaviour, for the API on arm64 (x86_64 not built): every bare `require("…")` in `backend/dist` and the
    `@cos/*` dists resolves in the new image (70 of 70); the generated Prisma clients are byte-identical to the old
    image's; on the compose infra both images answer `/api/v1/health/live` 200 and `/ready` `ok`, and their startup logs
    (454 lines, sorted, timestamps and ids stripped) differ only in one `TimeoutNegativeWarning` number — the two errors
    in both are the dev database's missing `platform.outbox_events`, which also shows Prisma reaching Postgres from
    musl. The dynamic `import()`s (checked by /doubt: `@keycloak/keycloak-admin-client`, `read-excel-file/node`,
    `cbor-x`, two `@aws-sdk` clients) load in the new image. The final image's files are content-identical to the one
    run there, except pnpm's two state files. The worker entry fails the same way on both (Open, above). file-service
    and credential-service still build. hadolint reports what it reported at HEAD. The conformance suite passes (61
    suites, 2,343 tests), though none of it reads `backend/Dockerfile` or `.dockerignore`.
- **Closed — apps/mobile's lockfile was not audited, and held 126 advisories.** Fixed on `fix/mobile-audit` (D38, D39).
  - Measured first, with `pnpm audit --json` on apps/mobile's `package.json` and lockfile in an isolated copy: 126
    advisories (3 critical, 81 high, 33 moderate, 9 low) in 24 packages, 1,028 dependencies. In the app bundle: `axios`
    1.18.1 and `decode-uri-component` 0.2.2 (expo-router → query-string 7.1.3); the rest build and test tools.
  - 16 packages moved inside their declared ranges (`pnpm update --lockfile-only --depth Infinity`, one name at a time):
    axios 1.21.1 (`package.json` `^1.7.0` → `^1.21.1`), follow-redirects 1.16.3, handlebars 4.7.10, shell-quote 1.12.0,
    node-forge 1.4.3, @xmldom/xmldom 0.8.15 / 0.9.12, browserslist 4.29.5, brace-expansion, js-yaml, fast-uri, postcss,
    nanoid, compression, moment, baseline-browser-mapping, source-map-js. Any update re-resolves the lockfile's peers —
    `pnpm update` of handlebars alone gives the same side effects as of axios — and that moved `@expo/metro-runtime`
    3.2.3 → 56.0.21 (D39); a plain `pnpm install --lockfile-only` on the old files changes nothing, so the stale
    resolution predates this branch.
  - Why the lockfile diff is large (2,359 lines in `git diff --stat`): the same re-resolution links `debug` 4.4.3's
    optional peer `supports-color` (8.1.1, already in the tree), which the old lockfile had not, so
    `(supports-color@8.1.1)` is appended to the key of every package that reaches debug — 820 occurrences, against 2
    before. With peer suffixes stripped from both sides, 599 lines differ (Python difflib, which counts 2,825 without
    stripping): the overrides, the versions above, and packages added or dropped. The suffixes name no new package and
    move no version.
  - Seven overrides in `apps/mobile/pnpm-workspace.yaml`, each keyed on the advisory's affected range (decode-uri-
    component scoped to query-string 7.1.3, as on the root): decode-uri-component 0.5.1, @xmldom/xmldom 0.8.15 (from
    0.7.13), glob 14.0.4, minimatch 11.0.7, image-size 2.1.0, uuid 11.1.1, zod 4.6.7 (under `@expo/cli` 56.1.27).
    stream-json 3 was dropped (Open, below).
  - What the overrides cost, and why it is acceptable: query-string's `parse` throws with the ESM-only 0.5.1, and deep
    links never reach it — a new render spec, `src/__tests__/deep-link-query.spec.tsx`, holds expo-router's
    `getStateFromPath` decoding a query (`a%20b%C3%A9` → `a bé`) without it, `stringify` working, and `parse` throwing
    (on the old dependencies that last test fails). Jest transforms decode-uri-component (`jest.render.config.ts`).
    image-size 2 no longer takes a file path, which metro 0.84.4's `Assets.js` passes; that metro is
    `@react-native/community-cli-plugin`'s, and `react-native bundle` does not run here (no
    `@react-native-community/cli`); Expo's metro 0.84.5 has its own image-size code.
  - After: 0 critical, 0 high; 3 moderate (stream-json) and 1 low (deepmerge); 1,018 dependencies. The checks below were
    first run on a local `node_modules` that /doubt found stale — 18 nested copies pnpm no longer tracked, among them
    zod 3 under `@expo/cli`, so the zod override had not been exercised — and were all re-run after `rm -rf node_modules
&& pnpm install --frozen-lockfile` (zod 4.6.7 resolved from `@expo/cli`); the figures are from that run. `expo
export` for iOS and Android and `expo export:embed` (what the Gradle and Xcode builds run) bundle, with axios
    1.21.1, decode-uri-component 0.5.1 and `@expo/metro-runtime` 56.0.21 in the sourcemaps; `expo start` serves an iOS
    bundle (HTTP 200); `expo prebuild` in a scratch copy writes `ios/` and `android/` identical, file for file, to the
    same run on a clean install of the old dependencies; detox and bunyamin load; /doubt also exercised zod 4 on
    `@expo/cli`'s schemas, uuid 11 in xcode, xmldom 0.8.15 in `@expo/plist` 0.1.3 and minimatch 11 in
    `@expo/fingerprint`. Launched on a simulator later (`docs/mobile-sim-smoke`, Closed below). Mobile `type-check`,
    `eslint`, `test:cov` (1,149), the render suite (1,800, coverage 90.09 / 83.2 / 85.64 / 90.97 over its floors) and
    the RN a11y gate pass.
  - `scripts/pnpm-audit.sh` runs its whole gate — isolated copy, `VERIFIED_PNPM`, metadata cross-check — for each
    lockfile, the root's and apps/mobile's, and fails if either has a high or critical. Run on this branch: both pass.
    Negative controls in scratch copies: the old apps/mobile lockfile with the new root, and the old one in the root's
    place with the new apps/mobile, each fail with exit 1 (84 unresolved high/critical). CI and `verify-before-push.sh`
    already call the script. The conformance suite passes (61 suites, 2,343 tests).
- **Closed — reads of one tenant's workforce telemetry scanned every tenant's chunks.** Fixed on
  `perf/telemetry-tenant-index` (D57).
  - `attendance_logs` and `timesheets` had no index leading with `tenant_id`, so the provisioning copy (and anything
    filtering by tenant alone, as the RLS predicate does) scanned every chunk. Measured on TimescaleDB 2.31 with
    generated data — 200,000 attendance rows in 60 daily chunks, 120,000 timesheets in 24 monthly chunks, 50 tenants;
    not production figures — one tenant's count went from a sequential scan of all 84 chunks (2,700 and 1,608 buffers)
    to index scans only (390 and 852). Migration `20261113000002_telemetry_tenant_indexes` adds the two (built in 170
    ms and 80 ms on that data); its header says that on a hypertable the build blocks writes for its length, and how
    to build them beforehand one chunk per transaction on a large table. A prebuild cut off part-way leaves an invalid
    index that `IF NOT EXISTS` would skip (found in review, reproduced: 20 of 60 chunks indexed); the migration
    refuses to run over an invalid one instead (reproduced: it raises, and after `DROP INDEX` it builds both valid).
    Each insert maintains one more index — check-ins and periods, not sensor readings.
  - On real Postgres the plan of a one-tenant read uses each new index, and both are valid; without the migration it
    does not; the rollback runs twice cleanly and the migration re-applies twice (2 → 0 → 2 indexes); the rollback
    pairing check counts 115 of 115.
- **Closed — foreign keys between `platform` and tenant data could not hold for a tenant in a dedicated database.**
  Fixed on `fix/cross-boundary-fks` (D56).
  - Measured on a fully migrated database: three foreign keys crossed the line, not two —
    `boq.boq_items.central_price_id` → `platform.central_price_catalog`,
    `procurement.rfq_invitations.vendor_identity_id` → `platform.vendor_identities`, and the other way,
    `platform.vendor_trading_relationships.vendor_id` → `procurement.vendors`. In a dedicated database `platform` is
    empty, so an ENTERPRISE tenant could neither link a BOQ line to a central price nor invite a vendor; and a vendor
    created in a dedicated database could not get a trading relationship on the shared one.
  - Migration `20261113000001_drop_cross_boundary_fks` drops the three on every database (the schemas stay one); its
    rollback re-adds them `NOT VALID` (run twice on a scratch database: clean, and the migration drops them again
    after). `central_price_id` only ever comes from a read of the shared catalog and `vendor_identity_id` from
    `upsertIdentity` in the same request; `vendor_id` came from the request body and only the key checked it, so
    `issueInvitation` now refuses a vendor that is not the tenant's (`COS-VND-006`, 404) before writing anything. No
    code deletes the referenced rows, so `ON DELETE RESTRICT` guarded nothing the app did.
  - Specs: the service refuses an unknown vendor and writes nothing (the old service fails it); the repository's check
    reads `procurement.vendors`. On real Postgres (two servers): no foreign key crosses the boundary on either
    database, and a trading relationship names a vendor that lives only in the dedicated database — both fail without
    the migration; and, as `app_user` through the transaction entry the app uses, `vendorExists` sees the tenant's own
    vendor and not another tenant's, in the shared database and in a dedicated one (RLS decides; there is no older
    code to fail it against). `COS-VND-001`…`006` are now listed in `docs/api/error-codes.md`, where none of them was.
- **Closed — a dedicated database left three tenant schemas behind that the app reads from it.** Fixed on
  `fix/copy-remaining-schemas` (D55).
  - After the switch the app reads `crm` (`crm.repository.ts`, `subject-request.repository.ts`), `equipment_telemetry`
    (`equipment.repository.ts`, `sync.service.ts`) and `workforce_telemetry` (`workforce.repository.ts`,
    `sync.service.ts`, the data export) from the dedicated database, and the copy did not move them, so a tenant's
    leads, contacts and telemetry vanished from its view. The three schemas (six tables, each with `tenant_id`;
    `crm.contacts` and `crm.opportunities` reference `crm.leads`) now join `TENANT_DATA_SCHEMAS`. `digital_twin` and
    `credentials` stay out: they are read from the shared database for every tenant.
  - The telemetry tables are TimescaleDB hypertables. Measured on TimescaleDB 2.31 before the change: COPY into a
    parent under `session_replication_role = replica` (as the copy loads) put 3 rows over 3 days into 3 chunks and
    none into the parent, which has no insert-blocking trigger in that version. The integration spec now seeds all six
    tables (telemetry over three days, a crm row of another tenant) and checks the counts, that the hypertable answers
    with all three rows in the dedicated database while `FROM ONLY` the parent holds none, and that no other tenant's
    crm row arrives; with the old list three of its tests fail, and the conformance check that the list holds the
    three fails too.
- **Closed — tenant sweeps never reached a dedicated database and kept reading a moved tenant's stale rows.** Fixed on
  `fix/dedicated-db-sweeps` (D54).
  - Of eight `@Cron` jobs, four read or write tenant data through one superuser client on the shared database: permit
    expiry, notification escalation, cashflow risk and ledger reconciliation (the digest already routes per tenant;
    trial lifecycle, tombstone prune and exchange rates touch `platform` only). An ENTERPRISE tenant's live rows are
    in its dedicated database, which none of them reached, and the copy left its old rows in the shared one, which
    escalation, cashflow and ledger kept reading — alerts and drift from data the tenant no longer uses. The
    escalation marker was also written without the pause lock.
  - D54: `shared/prisma/tenant-databases.ts` lists active tenants with a dedicated database, keeps one client per URL,
    and runs a job per tenant in a transaction entered through `enterTenantTx` (no JOIN on `platform` there — it is
    empty); a tenant whose database fails, whose URL does not decrypt, or a failed list of them, is logged and skipped
    — the shared side (the permit sweep's committed UPDATE and its events) still finishes. One deadline spans the
    sweep, its start plus the job lease: each tenant's transaction gets only the time left and none starts after it,
    since past the lease another replica may run the same sweep (an escalation sent twice is what the lease prevents).
    Cashflow grades each dedicated project in a transaction of its own, so one failed query does not fail the tenant's
    other projects. On the shared side every sweep keeps to tenants active and still there (`sharedTenantFilter`);
    escalation marks a shared candidate through `enterTenantTx` (the pause lock) and a dedicated one in its own
    database.
  - Specs: the helper (a URL that does not decrypt, a failed list, the deadline — each fails with the old handling);
    each sweep's shared filter and dedicated side (each fails against the old service: 1 of 9 for permits, 1 of 42 for
    the escalation repository per change — without the dedicated side, without the shared filter, without the lock — 2
    of 20 for cashflow, 2 of 18 for the ledger). On real Postgres, two servers, all four sweeps: the permit sweep
    expires S on the shared database and E in its own and leaves E's stale copy (the old sweep expired 1, not 2);
    escalation finds S and E, marks each where it lives, and leaves E's stale notice; cashflow raises for S's and E's
    live budgets, not E's stale one; the ledger counts S's orphan and E's live one, not E's two stale ones (the old
    services fail both).
  - Left open: the stale rows themselves (Open, above).
- **Closed — the provisioning pause lost what was written or sent while it ran.** Fixed on
  `fix/provisioning-pause-gaps` (D51, D52, D53).
  - Drain (D51). Nothing bounds how long a handler runs — Fastify sets no timeout (`main.ts:39`), nothing in
    `infrastructure/` does, and Node's `requestTimeout` bounds receiving a request, not running it — so waiting "long
    enough" had nothing to wait for. `enterTenantTx` (`shared/prisma/tenant-tx.ts`), used by
    `TenantPrismaService.run`, `withTenantTx` and `NotificationPrismaService.run`, takes the tenant's advisory lock
    shared and then, in a statement of its own, reads `is_active` on the shared database (skipped on a dedicated one,
    whose `platform.tenants` is empty); `setTenantActiveActivity` takes it exclusive in the transaction that sets
    `is_active` (`setTenantActiveDrained`, plain `pg`, so it is not cut off by Prisma's 5 s limit). The same read
    refuses a tenant already switched to its dedicated database (`TenantMovedError`, retryable; 503 through the global
    filter): a request routed before a pause can outlive the pause, the copy, the switch and the resume. A tenant
    found inactive mid-request answers 401. Two writers outside those paths take the lock too:
    `file-legal-hold.service.ts` (which, besides, wrote only to the shared database, so an ENTERPRISE tenant's hold
    was never placed; it now resolves the tenant's database) and the hourly permit-expiry sweep (each affected
    tenant's lock, in tenant order, then only tenants active and still on the shared database). The protocol needs
    READ COMMITTED, which every caller uses (header of `tenant-tx.ts`). On real Postgres, as `app_user`: a transaction
    open when the pause starts holds it until it commits and its row is kept; one started after it, or queued behind
    it, is refused; another tenant and a dedicated-database transaction are unaffected. With the lock left out of
    either side the first of those fails; without the moved check, a transaction for a tenant already switched writes
    to the shared database. The legal-hold and permit specs fail against the old services.
  - Export (D52). A tenant paused and one deactivated look the same in `platform.tenants`; the provisioning run tells
    them apart. `classifyInactiveTenant` (`shared/workflows/tenant-paused.ts`) turns `TenantInactiveError` into a
    non-retryable `TenantPaused` failure when the run's `workflowState` is between PAUSING_TENANT and RESTORING, a
    non-retryable `TenantInactive` otherwise, and leaves it as it was if the state cannot be read.
    `collectAndUploadActivity` and `notifySubjectActivity` go through it; `dataExportWorkflow` (behind
    `patched('export-waits-out-pause')`) retries on `TenantPaused` every minute for up to 24 h — the copy's own bound,
    a choice. Specs: the paused export completes after two refusals of the collect and one of the notice (the old
    workflow fails it); a history written by the old workflow replays on the new.
  - Replay (D53). `replayTenantDlq` (`@cos/kafka`, `dlq-replay.ts`) reads `{tenant_id}.dlq` up to the end offsets it
    saw at the start and republishes entries whose reason contains `TenantInactiveError`, failed at or after the pause
    and belong to the tenant, onto `dlq.original_topic` with the `tenant_id` header the consumer requires; it commits
    under a group named for the run, so a retried attempt resumes. The provisioning workflow runs it after the resume
    and after a restore, unless the tenant was inactive before the run (its events would only be refused again)
    (REPLAYING_EVENTS, retried until it succeeds, behind `patched('replay-paused-events')`). On a real broker, with
    entries written by `DlqPublisher`: two of four entries come back, with the header and the value as they were; one
    written after the replay began is left; the same group then finds only that one. Without the header, or without
    the reason filter, it fails.
  - Left open: see the Open item above.
- **Closed — paths without the Keycloak JWT ignored a tenant's dedicated database and its `is_active`.** Fixed on
  `fix/non-jwt-tenant-routing` (D50).
  - `TenantPrismaService` connects to `clsDedicatedDbUrl() ?? appDatabaseUrl()`, and only `jwt-auth.guard.ts` set the
    dedicated URL. Five paths set only the tenant — `runInTenantContext` (search indexer, risks),
    `finance.consumer.ts`'s own `cls.run`, `vendor-auth.guard.ts`, `contract-sign-token.guard.ts`,
    `subject-verify-token.guard.ts` — and `tasks.delay.consumer.ts` never entered CLS at all (its `getTask` threw
    "Tenant context missing", which its catch read as "task not found", so no delay event ever blocked a task); the
    first five sent an ENTERPRISE tenant's events, vendor, contract-signing and data-subject requests read and wrote
    the shared database, and none of them checked `is_active`. `getDbUrlForTenant` returned the shared URL for an
    inactive or unknown tenant.
  - D50: `resolveTenantDb` (`get-db-url.ts`) reads `is_active` and `dedicated_db_url` per call and throws
    `TenantInactiveError` for an inactive or unknown tenant; `getDbUrlForTenant` is built on it. `runInTenantContext`
    resolves before entering CLS and sets `CLS_DEDICATED_DB_URL`; `finance.consumer.ts` and `tasks.delay.consumer.ts`
    use it; it always writes the dedicated key (undefined for a shared tenant), as `cls.run` copies an enclosing
    context and a nested one must not inherit another tenant's database. The other two consumers need nothing:
    notifications go through `getDbUrlForTenant`, analytics only drops cache entries. The three guards call
    `tenantDbForRequest` after verifying their token: the dedicated URL into CLS, or 401 with the JWT path's wording
    before any tenant context is published. A database outage is not turned into a 401.
  - Specs for the resolver, `runInTenantContext`, the finance, risks and search consumers, the three guards and the
    helper; each changed behaviour fails against the old code (2 of 6 for `getDbUrlForTenant`, 2 of 7 for
    `runInTenantContext`, 2 of 12 for the finance consumer, 2 of 24 for the risks and search consumers, 2 of 16 for
    the tasks-delay consumer, 1 of 8 for the nested context, 6 for the guards). The integration specs that cross these
    paths on real Postgres (notification delivery, search, contract signing and sign links, budget aggregation) pass:
    63 tests.
  - Left open: requests already admitted when a pause starts, and what refusing an inactive tenant costs (Open,
    above).
- **Closed — provisioning switched routing before the copy, and the copy had 30 minutes and no heartbeat.** Fixed on
  `fix/provisioning-copy-before-switch` (D48, D49).
  - The workflow ran `assignDedicatedDbActivity` before the approval wait. Routing is read per request with no cache
    (`keycloak-jwt.strategy.ts`, `get-db-url.ts`), so for the whole wait the tenant read the new, empty database and
    wrote there; the copy then refused. D48: after the approval the workflow reads `is_active`, sets it false, copies,
    switches routing, verifies, and sets `is_active` back; abort at the gate now deletes the RDS instance only, as
    nothing was assigned. D49: a failure in between unassigns, restores `is_active` and fails the run in RESTORED with
    the original error; unassigning, restoring and the final resume retry until they succeed (backing off to one
    attempt per 10 minutes) and run outside the workflow's cancellation scope, so neither a failing activity nor an
    operator cancelling the run mid-copy leaves the tenant refused; a tenant row that no longer exists fails them for
    good (non-retryable) rather than retrying forever. Workflow specs check the order of every activity on the
    approve, abort, copy-failure and verify-failure paths, that a tenant inactive before the run stays inactive, that
    a failed read of `is_active` changes nothing, that the restore and the resume outlast four failures (with three
    attempts, as before, those two fail), and that a run cancelled mid-copy ends RESTORED with the tenant active
    (without the non-cancellable scope it stays RESTORING); against the old workflow the first six fail.
  - A run parked at AWAITING_APPROVAL on the old code (routing already switched) must finish after a deploy. The new
    order is behind `patched('copy-before-switch')`; a spec parks a run on a frozen copy of the old workflow, approves
    it on the new one, sees it finish the old way, and replays its whole history on the new code. Without the patch
    the new worker fails it with `TMPRL1100 Nondeterminism error`.
  - `migrateDataActivity` runs on its own options — `heartbeatTimeout` 2 min, `startToCloseTimeout` 24 h (chosen
    bounds, not measured) — and heartbeats per table, per streamed chunk and every 30 s (the listing, the counts and
    COMMIT report no progress). Because of the timer, `heartbeatTimeout` catches a dead or blocked worker but not a
    hung query; both connections use TCP keepalive (30 s idle before probing) against a vanished peer, and the 24 h
    limit bounds the rest; Temporal's cancellation reaches the copy as an AbortSignal (`@temporalio/activity` 1.25.0
    added; it was already in the lockfile). On real Postgres a copy cancelled on its first chunk of 100,000 rows
    rejects with the target empty: 0 chunks arrived after the cancel, and 529 (the rest of the table) with the signal
    left off the stream.
  - The Admin UI knows the four new states (PAUSING_TENANT, RESUMING_TENANT, RESTORING, RESTORED; TH and EN), and spec
    §34.3/§34.4, §7 and the phase-25 design and test-design docs show the new order with a dated note.
  - `verifyRoutingActivity` read `platform.tenants` on the dedicated database, which the migrations create empty
    (`platform` never moves), so it failed for every real tenant — with D49 every run would have ended RESTORED. It
    now reads routing on the shared database, requires it to name the new instance, and only pings the dedicated one;
    its unit spec fails against the old activity. No spec had run it against a database.
  - Left open: not every write to the shared database stops during the pause (Open, above).
- **Closed — enterprise provisioning could neither migrate nor fill a dedicated database.** Fixed on
  `fix/enterprise-provisioning-db` (D45, D46, D47).
  - `runMigrationsActivity` ran `npx prisma migrate deploy` with `DATABASE_URL` = the tenant URL. The image had no npx,
    no prisma CLI, no schema, migrations or `prisma.config.ts` — and Prisma 7 takes the migrate URL from
    `DIRECT_DATABASE_URL` (`prisma.config.ts`), which in the worker is the shared database: with the tools in place it
    would have migrated the shared database and left the tenant's empty. D45: `prisma` and `dotenv` are production
    dependencies, the image carries `backend/prisma/{schema.prisma,migrations}` and `backend/prisma.config.ts`, and
    `prismaMigrateDeploy` (`prisma-migrate-deploy.ts`) runs the CLI's entry point with node via `execFile` from
    `backend/` with `DIRECT_DATABASE_URL` and `DATABASE_URL` set to the target. A spec holds it to that and fails
    against the old activity (with `execSync` mocked so the old command does not run); from inside the built image it
    applied all 113 migrations to a scratch Postgres.
  - `migrateDataActivity` ran `pg_dump … --where="tenant_id='…'" | psql …`; `pg_dump` has no `--where` (PostgreSQL 18.6:
    "unrecognized option"), so it never could have run. D46: `tenant-data-copy.ts` lists every table of the ten schemas
    from `pg_catalog` (`information_schema` hides tables the role has no privilege on, which would drop them without an
    error), refusing one without `tenant_id` (all 73 have it), orders them parents first (60 foreign keys between them,
    no cycle), reads the source in one repeatable-read snapshot, and in one target transaction with
    `session_replication_role = replica` COPYs them table by table (`pg-copy-streams` 7.0.0 added), comparing counts per
    table, with DateStyle and IntervalStyle pinned to ISO on both sides. The activity first requires the source role to
    bypass row-level security, before the skip below (the ten schemas FORCE RLS for `app_user` only; under RLS every
    lookup finds nothing, which would read as "no data" and succeed with the rows left behind), and the copy requires
    the same of both roles. Rows of the tenant already in the target are never deleted (they can be the tenant's own
    writes — Open, above): if every table's count equals the source's, an earlier attempt committed the copy and this
    one reports it done (`migrate_data.already_complete`, so a Temporal retry after a commit succeeds); otherwise it
    refuses. A failure rolls the target back and closes the source connection: `ROLLBACK` after a cut-off `COPY TO`
    never returns (measured), and the activity ends both connections with a time limit and logs their connection errors
    instead of leaving them unhandled. The specified skip stays (master:5738: nothing to move, nothing done; a
    conformance test holds it), now checked across every table, not `projects` alone. No shell; the tenant id is still
    asserted a UUID, as it becomes a COPY literal, and the URL check that guarded the shell command is gone with it. An
    integration spec on two real Postgres servers (TimescaleDB pg16, both migrated through `prismaMigrateDeploy`, as
    superuser) copies one tenant out of two across a foreign-key chain and a self-reference, keeps a `platform`
    reference, lists all 73 tables, refuses an RLS-bound role, refuses (and keeps) rows in the target that differ from
    the source, reports a repeat after a committed copy as done without writing, and on a failure halfway through
    100,000 rows rejects in seconds with the target empty and no transaction left open on the source; with the source
    rolled back instead of closed it hangs until Jest's 120-second limit. A unit spec runs the activity with a source
    role under RLS and expects a failure, not a skip; with the role check after the skip it resolves instead.
  - The backend image grows 1,258,708,530 → 1,527,213,081 bytes: the prisma 7 CLI brings 76 packages (218 MB on disk),
    most of them its own tooling — Prisma Studio (`@prisma/studio-core` 38 MB), `effect` 34 MB, PGlite 23 MB, the schema
    engine 21 MB, `@prisma/dev` 14 MB, react-dom, chart.js. Trivy with the job's settings still reports 0 for the image
    and the repository.
  - D47 found three schemas the app reads from the dedicated database that the copy leaves behind (closed by D55,
    above).
  - What is proven is the code path on Postgres with TimescaleDB, as superuser; not on RDS (Open, above).
- **Closed — the `fix/mobile-audit` dependencies had not been launched.** Measured on `docs/mobile-sim-smoke` (no code
  changed). iPhone 17 simulator, Xcode 27.1, `detox build -c ios.sim.release`: native compile and Metro (2,616 modules,
  `@expo/metro-runtime` 56.0.21, axios 1.21.1) pass; with `EXPO_PUBLIC_E2E=1`, as CI builds it, `main.jsbundle` is
  8,040,320 bytes (Hermes). The app launches without a crash (no crash, fatal or exception line in its log). With no
  backend running: with a session left in the keychain it opens on Home (cards, tab bar, action button; System Status
  "Unavailable", the cards empty), and after a keychain reset on the login screen (country picker +66, phone field, send
  OTP, email login; the footer shows a red version-check error). The first build failed before that: the cached
  `ios/Pods/Local Podspecs/hermes-engine.podspec.json` (generated, git-ignored) pointed `hermesc` at the repo's old
  path; with it removed `pod install` wrote the current one (Open, below: the checksum that follows). Detox
  `offline-inspection` did not pass, for a reason that holds on the old dependencies too (`9edde5df^`: axios 1.18.1,
  metro-runtime 3.2.3, built the same way, the same failure at the same line) — Open, below. Not run: the
  backend-dependent specs (`sync-conflict`; `capture` and `benchmark` generate documentation), a physical device,
  Android.
- **Closed — CI's `security-scan` job failed on the repository scan and on all ten images.** Fixed on `fix/ci-trivy`
  (D43). Measured first with the job's thresholds (`CRITICAL,HIGH`, `--ignore-unfixed`; the repository scan with
  `vuln,secret,misconfig`, `.trivyignore.yaml` and the job's skip-dirs), images built from `git archive HEAD` with base
  images pulled fresh — the images first with `--scanners vuln` only, which /doubt caught: the job's image step runs
  Trivy's default scanners, vuln and secret (below); CI has not run since 2026-11-08, so nothing had reported any of it.
  - Repository: 23 HIGH in indirect Go modules → 0. `golang.org/x/net` 0.53 / 0.60 → 0.62.0 and `google.golang.org/grpc`
    1.83.1 → 1.83.2 in `libs/go`, analytics- and kg-ingestion-worker; `github.com/moby/go-archive` 0.2.0 → 0.3.0
    (kg-ingestion); `golang.org/x/crypto` 0.51.0 → 0.58.0 in iot-ingestion (0.55.0 was the advisory's floor, but `x/net`
    0.62.0 requires 0.58.0); `go mod tidy` moved `x/sync`, `x/sys`, `x/text` and two `moby/sys` modules a patch or
    minor. Each module's `go build`, `go vet` and `go test` pass before and after (3 packages each).
  - Repository: 2 HIGH KSV-0014 (Keycloak backup CronJob, no `readOnlyRootFilesystem`) → 0, by repair
    (`.trivyignore.yaml` may only shrink). Measured with the CronJob's image, uid 1000 and a read-only root against the
    compose database: `kc.sh export` re-augments Quarkus for `KC_DB=postgres` and writes `/opt/keycloak/lib/quarkus` —
    an empty mount there fails (rc 1), a copy of the image's own contents exports both realms — and needs `/tmp`;
    `/opt/keycloak/data` is not written. The AWS CLI uploads to MinIO with a read-only root and no mounts, with static
    keys; IRSA (web identity) was not tried, and it may cache credentials under `~/.aws/cli/cache`, so the upload gets
    `HOME=/home/upload` on an emptyDir (re-tested against MinIO). So: every container `readOnlyRootFilesystem: true`, a
    new `seed-quarkus` initContainer copying that directory into an emptyDir, and emptyDirs at
    `/opt/keycloak/lib/quarkus` and `/tmp` for the export. Not proven against a real cluster.
  - backend and file-service: 1 CRITICAL + 10 HIGH each → 0. `zip` 8.5.1 and `quinn-proto` 0.11.14 were compiled into
    `@temporalio/core-bridge`; its `Cargo.lock` still has `zip` 8.5.1 in 1.23.0 and 1.24.0, and 9.0.5 (fixed) with no
    `quinn-proto` in 1.25.0. Temporal moves to 1.25.0 (the manifests' floors to `^1.25.0`; 1.25.0 was in range of the
    old `^1.19.0` / `^1.10.0`). The lockfile update also dropped Temporal's old dependencies and re-resolved unrelated
    peers, three found: `@zenuml/core` 3.50.1 (via `@mermaid-js/mermaid-cli`) pins `playwright-core` 1.57.0 and now gets
    the 1.61.1 already in the tree (no document in `docs/` or `context/` has a zenuml diagram);
    `@sentry/bundler-plugins`, `swc-loader` and `source-map-loader` move from webpack 5.108.2 to the 5.112.2 Temporal
    brings; and — found by /doubt — the `ajv-formats` snapshots of `@fastify/ajv-compiler`, `fast-json-stringify` and
    `@angular-devkit/core` lost their `ajv` peer and fell back to its own dependency, ajv 8.18.0, while the compilers
    run 8.20.0, which broke `formatMinimum` / `formatMaximum` (`TypeError: compare is not a function`, reproduced
    through fastify's compiler; no tracked schema uses them yet). `pnpm dedupe` did not restore the peer and removed
    unrelated `@aws-sdk` versions, so it was not kept; an override `'ajv-formats>ajv': '8.20.0'` in
    `pnpm-workspace.yaml` pins the dependency to the tree's one ajv, after which ajv-formats and the compiler both load
    8.20.0 and the same schema validates. file-service's jest tooling also moved `@swc/core` 1.15.40 → 1.15.43 (dedupe).
    backend unit 4,233 tests, backend workflow specs (TestWorkflowEnvironment, 6 suites, 23 tests, run by /doubt) and
    file-service 291 (coverage 100%) pass on 1.25.0; both images' workers poll all five queues on the compose infra.
  - backend, file-service, credential-service, web: the npm bundled in the Node base images (`brace-expansion` 5.0.9,
    `undici` 6.28.0) → removed from each runner with `npx`; nothing runs them.
  - ai-gateway, ai-embedding-worker, ai-ocr-pipeline, ai-transcription-pipeline: `zlib1g` 1:1.3.dfsg+really1.3.1-1+b1 in
    `python:3.12-slim` (still so on a fresh pull) → `apt-get install --only-upgrade zlib1g` gives -1+deb13u1. Three
    Dockerfiles gain hadolint DL3008 (unpinned apt), as the OCR image and backend already had; the version is not pinned
    because a pinned Debian version disappears from the mirror when superseded.
  - analytics- and kg-ingestion-worker: `musl` in `alpine:3.19` (past end of support) → runners on `alpine:3.24` (alpine
    3.22, 3.23 and 3.24 scan clean), plus the Go modules above in the binaries.
  - ai-gateway: with the image step's default scanners the secret scanner reports 11 CRITICAL `gcp-service-account` in
    the anthropic SDK (2.8.0; `anthropic>=0.40` floats), on the old image as on the new: docstring examples containing
    JSON with a `type` of service_account. D44: the image step now reads `.trivyignore.yaml`, whose new `secrets:` entry
    allows that rule under that package's directory only; a key-shaped file planted at `/app` in the same image is still
    reported, and a conformance block pins the list to that one entry (it fails with a second one).
  - After, with the job's exact settings (image step: default scanners and `.trivyignore.yaml`): the repository scan
    exits 0 (0 vulnerabilities, misconfigurations, secrets) and all ten images exit 0 — measured on arm64 builds; CI
    builds amd64, whose wheels and core-bridge binary differ. Same behaviour, old (HEAD) against new images: on the
    compose infra backend, temporal-worker, file-service, credential-service, ai-gateway, ai-embedding-worker,
    ai-ocr-pipeline, ai-transcription-pipeline, analytics- and kg-ingestion-worker report `healthy` (the last two with
    only Kafka and Neo4j up; with everything running at once Neo4j timed out kg-ingestion's connection on both images
    alike), and Temporal lists pollers on the five queues from the new images; web (not in compose) answers `/login` 200
    on both, and `/api/health` the same on both: with a test-only auth secret it redirects (307) to the sign-in page,
    which the probe followed to 200; without one it ends at `/api/auth/error`, 500 `NO_SECRET`. The conformance suite
    passes (61 suites). x86_64 was not built.
- **Closed — the Temporal workers could not start, and could not have reached Temporal.** Fixed on
  `fix/temporal-worker-glibc` (D40, D41, D42).
  - Measured first: `@temporalio/core-bridge` ships glibc builds only — 1.17.2, 1.19.0 and the newest, 1.25.0. The
    aarch64 gnu `index.node`, `require`d directly: `node:24-alpine` fails (`__register_atfork: symbol not found`), the
    same with `gcompat`, `node:24-slim` (Debian 12) loads it. Both bases: 6 HIGH from Trivy with CI's settings, no OS
    findings.
  - D40: backend/Dockerfile and services/file-service/Dockerfile move every stage to `node:24-slim` (`apt-get install
openssl ca-certificates`; `groupadd`/`useradd` uid/gid 1001, as the charts run; HEALTHCHECK through Node's `fetch`,
    since slim has no wget). Prisma `binaryTargets` → native + `debian-openssl-3.0.x` + `linux-arm64-openssl-3.0.x`; the
    client generated here (Prisma 7, pg adapter) runs the wasm query compiler with no native engine on either base, so
    this changes no engine or binary; only the schema text inlined in the generated client differs. credential-service
    stays on Alpine.
  - Then the workers loaded the bridge, bundled their workflows and exited on `TransportError` to 127.0.0.1:7233: all
    five `Worker.create()` calls passed no `connection`, which defaults to localhost whatever `TEMPORAL_ADDRESS` says.
    D41: backend's three use `connectTemporalWorker()` (`backend/src/shared/workflows/worker-connection.ts`, the
    clients' `TEMPORAL_ADDRESS ?? 'localhost:7233'`), file-service's two `config.temporal.address`; each closes its
    connection when the worker stops. New specs — backend 14 tests, file-service 7 (the address, the connection handed
    to `Worker.create`, closing it on success, on a failed `run` and on a failed `Worker.create`, activity clients
    closed first, the schedule error surfacing) — fail against the old worker files (14 of 14, 7 of 7).
  - Then compose's `temporal-worker` could not resolve `temporal`: it had no `networks`, so it sat alone on the
    project's default network. D42 puts it on `cos-network`. The compose healthchecks of `backend`, `temporal-worker`
    and `file-service` used `wget`; they now use Node's `fetch`.
  - After, on the compose infra: `temporal-worker` (backend image) and the file-service worker run, answer
    `/health/live` on 8090, and Temporal lists workflow and activity pollers on all five queues (`procurement`,
    `enterprise-provisioning`, `data-export`, `file-cleanup`, `file-extraction`); the file-service worker created the
    `file-hard-delete-daily` schedule, which had never existed. `backend`, `temporal-worker` and `file-service` report
    `healthy` from the compose healthchecks. The API answers `/health/live` as on Alpine (`/ready` was not compared).
    Its startup logs differ in what the infra did during each run: on Alpine Kafka timed out, so the outbox poller never
    ran; on slim Kafka connected and every outbox poll failed with `42P01` (the dev database lacks
    `platform.outbox_events`) — which also shows Prisma reaching Postgres from Debian, with no Alpine run to compare it
    with. The health endpoints are static: 8090 answering shows a worker process alive, the pollers show it connected.
    The poller listings, the schedule and the `healthy` states were read in the runs, not saved to files; every bare
    `require` resolves as before (backend 70 of 70, file-service 36 and the same 11 `dist/packages` copies). Cold
    builds, Alpine (HEAD, from `git archive`) then slim, same machine — slim built before the last edits, which changed
    only comments and the schema's `binaryTargets` comment: backend 663 s → 681 s, 1,101,546,887 → 1,225,248,821 bytes;
    file-service 407 s → 535 s, 758,942,128 → 870,216,039 bytes. The images of the final code (partly cached builds) are
    backend 1,225,266,850 bytes and file-service 870,251,704 bytes (after the /doubt fix: the cleanup worker ensures its
    schedule before `Worker.create`, since a created worker blocks `NativeConnection.close()` and a schedule error would
    have surfaced as that; rerun on compose: both queues polled, schedule present, API `healthy`). Trivy: the same
    findings on old and new (Open, above). backend unit 4,226 tests (run before /doubt's additions to the new spec,
    which now has 14, all passing) and file-service 291 (coverage 100%) pass — two health-port specs fail while
    something on the host holds 8090 (Keycloak in compose) and pass without it; type-check, eslint on the changed files,
    hadolint (DL3018 → DL3008, DL3025 gone) and the conformance suite (61 suites) pass. x86_64 was not built.
- **Closed — the file-service and credential-service images copied all of `/app`.** Fixed on `perf/service-images`.
  - Each Dockerfile keeps its builder and gains a `prod-deps` stage: a `--prod` install from the same tree and filter,
    into which a bind mount from the builder copies the `dist` of every `@cos/*` package the builder built (file-service
    6, credential-service 1) and the service's own `dist`; the build fails if that is missing or if any `@cos/*` link
    the install made points at a package with no `dist` (checked: removing `@cos/types`'s `dist` fails it). The runner
    copies that stage's `node_modules`, `package.json`, `packages/` and the service's `package.json`, `node_modules` and
    `dist` — no repo sources, docs, mockups or other services, no devDependencies.
  - Old and new built back to back, `--no-cache`, same machine: file-service 1,872,186,515 → 758,938,438 bytes (runtime
    layers 1.27 GB → about 420 MB), 606 s → 531 s; credential-service 1,452,552,707 → 280,257,775 bytes (942 MB → about
    37 MB), 439 s → 457 s (the second install costs more than the smaller copy and export save).
  - Same behaviour: every bare `require("…")` outside `__tests__` resolves the same in old and new file-service images
    (36 resolved; the same 11 unresolved in both, all in `dist/packages/@cos/*` — copies tsc emits because the service's
    `rootDir` is the repo root, which nothing requires), and every bare `import` in credential-service's ESM `dist`
    resolves by ESM rules in both (18 of 18); its one dynamic import (`@digitalbazaar/ed25519-verification-key-2020`)
    loads in both. On the compose infra (MinIO swapped to `cgr.dev/chainguard/minio` for the run, since the compose
    image no longer pulls; ClamAV unhealthy in both runs) file-service answers `/health/live` and `/health/ready` and
    credential-service `/health` with 200 and the same body from both images, and their startup logs (one line and none)
    match but for timestamps. Those endpoints are static: no request touched the database, MinIO or Kafka. /doubt also
    ran, in old and new images alike, file-service's Swagger UI (same status and length for every asset), the 69
    `@cos/kafka` Avro schemas from `dist/avro`, the production requires (clamscan, minio, pg, opensearch,
    `@temporalio/{client,activity,workflow}`, …), and credential-service issuing and verifying a StatusList2021
    credential offline. The file-service worker fails identically on both (Open, above). hadolint reports what it
    reported at HEAD for each file; the conformance suite passes (61 suites, 2,343 tests), though none of it reads these
    Dockerfiles. x86_64 was not built.
- **apps/mobile: stream-json 1.9.1 keeps three moderate advisories.** GHSA-528h-pc64-c93x, GHSA-hqr4-qq8f-hg3x,
  GHSA-mjw6-4jj6-33hc (patched in 3.6.0). detox 20.51.4, the newest, declares `^1.7.4`, and it and bunyamin require
  `stream-json/jsonl/Parser` and `streamers/StreamArray.js`, which 3.x renamed: with the override both failed to load
  (`MODULE_NOT_FOUND`), so it was dropped (D2). Test tooling only (detox logs); the gate fails on high and critical.
- **apps/mobile: deepmerge 4.3.1 (low, GHSA-gcqx-w48m-w2h4) has no patched version.** Through `@expo/config` and
  jest-config.
- **apps/mobile's committed `Podfile.lock` carries a checksum tied to one machine's path.** CocoaPods hashes the
  `hermes-engine` podspec React Native generates, and that podspec holds `hermesc` as an absolute path. The committed
  checksum (`a3cd8b8…`) is what the podspec hashes to at `…/workspace/github-profile/cos/…`; at this checkout's path
  `pod install` writes `685001a…`. So `pod install` at any other path rewrites the file (a standing diff), and putting
  the committed file back without re-running `pod install` makes Xcode's `[CP] Check Pods Manifest.lock` phase fail —
  the state this checkout was left in on `docs/mobile-sim-smoke` (run `pod install` before the next iOS build).
- **apps/mobile's `offline-inspection` Detox spec did not pass on this machine's simulator.** Built as CI builds it
  (`EXPO_PUBLIC_E2E=1`, so the spec's `resetSession()` deep link clears the keychain session `launchApp({ delete: true
})` leaves), the first test fills the phone form and fails tapping `request-otp-button` — "View is not hittable at its
  visible point … does not pass visibility percent threshold (100)" at `offline-inspection.spec.ts:63`; the other four
  need the login and time out waiting for `home-screen`. The same not-hittable failure, at the same line, occurs on the
  dependencies before `fix/mobile-audit` (`9edde5df^`). Cause not established: the keyboard is up after `typeText`, but
  the layout had already moved the button up, and Detox reports the view's bounds as visible. The OTP step (which needs
  a backend with `E2E_AUTH_BYPASS`) was not reached. Built without `EXPO_PUBLIC_E2E` (the checked-in `.env` leaves it
  empty) `resetSession()` does nothing, and a simulator that ever logged in fails every test at `phone-input`. Found on
  `docs/mobile-sim-smoke`.
- **Local apps/mobile `node_modules` installed before `fix/mobile-audit` can shadow the lockfile.** On this machine it
  held 18 nested copies pnpm no longer tracked (zod 3 under `@expo/cli`, xmldom 0.8.13 under `@expo/plist`, an older
  `@expo/prebuild-config`, a leftover `node_modules/.pnpm` with axios 1.18.1, …); `rm -rf node_modules && pnpm install`
  clears them. CI installs fresh and is not affected.
- **file-service MinIO integration suite.**
  - Its image `quay.io/minio/minio:RELEASE.2024-09-13T20-26-02Z` can no longer be pulled. quay.io returned 401, and on
    2026-11-05 "no such manifest". docker.io's `minio/minio` needs authentication.
  - `cgr.dev/chainguard/minio` can be pulled, and the suite passes 8/8 on it with its data directory moved to
    `/tmp/data` (branch 1c). Switching the suite's image is a separate decision.
  - The series did not cause this.
- **`openapi freshness`.**
  - It reports `auth` and `ai` stale since commit `10be1567`.
  - `requirements.txt` counts as source for `ai`, so branch 5 hits this again.
- **Closed — `tests/e2e/specs/daily-report.spec.ts:70-71` used an undeclared `notificationBell` (TS2552).** Fixed on
  `fix/small-test-docs`: the spec declares it as `approval-escalation.spec.ts:112-114` does — a button named
  `/notification|bell/i`, or the test id `notification-bell`, the locator `safety-incident.spec.ts:80-82` calls `bell`.
  `tsc --noEmit --strict` (bundler resolution, node types) on the spec: TS2552 twice before, clean after. The spec was
  compiled, not run.
- **Closed — `docs/architecture/technical-design/phase-07-finance-service.md` had a mermaid parse error.** Fixed on
  `fix/small-test-docs`. Line 13 of the second block, the Note `tenant middleware excluded; token guard authorises`,
  held a `;`, which separates statements in a sequence diagram (mermaid 11.16.1's sequence lexer has `;` as a token of
  its own, and note text is `[^#\n;]*`); it is now `—`, and neither mermaid block holds a `;` or `#`. **Not
  rendered:** running `mmdc` was not permitted in the session that made the fix, so the parse error's absence is
  reasoned from the grammar, not measured.
- **Closed — the `docs/README.md` assessments row pointed into `registers/`.** Fixed on `fix/small-test-docs`: its entry
  point is `assessments/thai-eta-signature-briefing.md`, the first assessment the row names (`docs/assessments/` has no
  README), instead of `registers/data-flow-map.md`, which `fe35fff7` reclassified as a register.
- **Closed — `docs/specifications/07-multi-tenant-architecture.md` failed markdownlint.** Not listed before; found
  alongside the three above. markdownlint on `2b8dc5f8`: 10 errors — MD013 at 637 (142 characters) and 653 (136), and
  MD049 eight times on 633, 634, 636 and 637 (four asterisk emphases, each reported at both delimiters; the file uses
  underscores). Fixed on `fix/small-test-docs`, formatting only (`git diff --word-diff` changes no word): the two lines
  rewrapped, and the four UI labels use `_…_`. 0 issues after. Line 638 is still 130 characters; it passes because
  MD013 (not strict) skips a line with no whitespace past column 120, and its overflow is inside a code span.
- **Closed — three web E2E notification checks could not fail.** Found by /doubt on `fix/small-test-docs`; fixed on
  `test/e2e-notification-asserts`.
  - `daily-report.spec.ts` and `safety-incident.spec.ts`: the PM's bell and the notification text were looked up inside
    `if (await …isVisible().catch(() => false))`, and daily-report matched `/report|daily|site/i` anywhere on the page.
    Both now assert the bell unconditionally and require the run's own text — a per-run summary, and the incident type
    that was already unique — inside the bell's panel (`data-testid="notification-panel"`, added to
    `NotificationBell.tsx`), reloading the PM's page and reopening the bell until it appears (`toPass`, 45 s; test
    timeout 120 s). Reload, because the bell loads `/notifications` once and its SSE stream is process-local
    (`notification.sse.service.ts:2-3`) while staging runs two or more backend replicas (`values-staging.yaml`); the
    local runs below had one backend, so the multi-replica case is reasoned, not run.
  - `approval-escalation.spec.ts` "escalated notification appears for next approver" stays skipped, its body removed:
    the PO workflow waits a constant 48 h (`po.workflow.ts:49`) before escalating, which no E2E run reaches;
    `po.workflow.spec.ts` "48h timeout escalates to TENANT_ADMIN" covers it with Temporal time-skipping.
  - Both specs' form steps had not run since `598c8b11` (2026-08-03) moved the forms from placeholders to labels; they
    use `getByLabel` now. `budget-exceeded`, `procurement`, `project` and `report` specs still use `getByPlaceholder`
    and were not checked.
  - Run on a local stack (2026-11-13; the recipe is the Open item below): daily-report 4/4 and safety-incident 5/5
    pass, the escalation test is skipped. Negative control: with the two IN_APP templates set `is_active=false` in the
    local database, both new tests fail at the panel assertion (`daily-report.spec.ts:94`, `safety-incident.spec.ts:99`)
    while copies keeping the old checks pass; templates restored, both pass again.
- **Closed — the backend did not boot from a local build.** Fixed on `test/e2e-notification-asserts`. `nest build`
  compiles with the TypeScript it resolves from `backend/` upwards (the root's 6.0.3, `@nestjs/cli/lib/compiler/typescript-loader.js:10`),
  while `@nestjs/swagger`'s plugin `require`s an undeclared `typescript` and got the hoisted 5.9.3 (a direct
  dependency of `@nestjs/cli`). It emitted `enum: string` / `type: () => Object` in 97 files of
  `backend/dist`, and loading `update-preferences.dto.js` threw `ReferenceError: string is not defined`. The backend
  Docker image was not affected (its build emitted `type: () => String`, 0 such files). `pnpm-workspace.yaml`
  `packageExtensions` now gives the plugin an optional `typescript` peer; the lockfile changes by the checksum and that
  one peer (resolved to 6.0.3, listed under the snapshot's `optionalDependencies`). Optional because the plugin's
  package is a production dependency: a required peer put `typescript@6.0.3` (24 MB) into the backend image
  (1,556,938,386 bytes); with the optional peer the image has no TypeScript (1,527,499,814 bytes), its `dist` has no
  `enum: string`, and it starts healthy on the compose infra. Locally, with the required peer: 0 such files,
  `dist/app.module.js` loads, `node dist/main` answers `/health/live` 200 and the two notification tests pass against
  it; with the optional peer the local `nest build` again has 0 such files (not booted again).
  `pnpm install --frozen-lockfile`, `scripts/pnpm-audit.sh` (PASS) and backend `tsc --noEmit` pass; `pnpm peers check`
  lists no swagger or typescript peer.
- **Closed — a tenant's events were not consumed until the backend restarted if its topics appeared after startup.**
  Fixed on `fix/kafka-late-topics`. Consumers subscribe per event type with a RegExp over `{tenant_id}.{event_type}`
  (`packages/@cos/kafka/src/consumer.ts`), and two comments said KafkaJS picks up matching topics created later. KafkaJS
  2.2.4 resolves a RegExp once, inside `subscribe()` (`kafkajs/src/consumer/index.js:157-185`), and nothing re-evaluates
  it. Standard tenants' topics are created by their first publish (`KafkaProducer.ensureTopic`; the brokers do not
  auto-create), and enterprise provisioning creates them while the backend runs, so all six backend consumers
  (notification, tasks.delay, search-indexer, risks, finance, analytics-invalidation) missed every topic newer than the
  process. Worse than late: a topic first subscribed after messages were written has no committed offset for the group,
  and with `fromBeginning: false` the group starts at the latest offset, so those messages were never read, restart or
  not. Measured on 2026-11-13 (local stack): the first `site.report.created.v1` and `safety.incident.created.v1` were
  published and the PM received nothing until `docker restart cos-backend`.
  - Change: `KafkaConsumer` lists topics through an admin client and subscribes the matching ones by name, from that
    one listing (a RegExp would be resolved against KafkaJS's own metadata request, possibly another broker's view).
    Then every `KAFKA_TOPIC_REFRESH_MS` (default 30 000; anything but a positive whole number gives the default) it
    lists again and subscribes the new matches with `fromBeginning: true`. `subscribe()` throws while running, so it
    stops, subscribes and runs again: a group rebalance, only when a topic is new. KafkaJS applies `fromBeginning` where
    the group has no committed offset, and when a committed offset is out of range (a recreated topic), which replays
    rather than skips. A failed refresh is logged and the next tick retries; a failed subscribe still resumes the
    consumer. Crash restarts moved off KafkaJS's own timer: it arms that timer after its crash handler disconnects, and
    its `start()` does not check whether something ran the consumer meanwhile (`consumer/index.js:246-300`), so a
    refresh in that window would have left two runners. KafkaJS is told not to restart (`restartOnFailure` → false,
    which it calls only for retriable errors; `retries: 5` kept), and the consumer restarts itself after KafkaJS's delay
    (`retryTime`, else 300 ms) on the same serial lane as the refresh. After a non-retriable crash it stays down, as
    before, and the refresh does not revive it. `disconnect()` no longer waits for a refresh in progress; that refresh
    checks a closing flag after each await and never runs the consumer again. A second `connect()` is refused, and a
    failed `connect()` closes what it opened. The two code comments and
    `docs/architecture/technical-design/phase-08-event-driven-infrastructure.md` now say what KafkaJS does.
  - Evidence: unit `consumer.topic-refresh.spec.ts` (29 tests) and the updated connect tests in
    `consumer.idempotency.spec.ts`; integration `test/kafka/kafka.integration.spec.ts` "consumer started before a topic
    exists receives the event that creates it" (testcontainers Kafka, default `fromBeginning`, refresh 1 s): the topic
    is absent at connect, the first publish creates it, the handler receives that event (subscribed about 5 s after the
    publish; KafkaJS's `stop()` waits for the in-flight fetch, up to `maxWaitTimeInMs`, 5 s). Negative controls, each
    applied alone and reverted: refresh disabled, 9 of the 29 unit tests fail and the integration test times out after
    30 s; the consumer's own crash restart removed, 5 fail; the serial lane bypassed, 1 fails; the closing check before
    `run()` removed, 1 fails. `@cos/kafka` unit 179 and integration 3 pass; backend `tsc` 0 and the six consumers'
    specs (233 tests) pass; eslint, prettier and markdownlint clean. `TimeoutNegativeWarning` from KafkaJS in the
    integration run appears on HEAD too.
  - Not checked: a multi-replica deployment. Each replica refreshes on its own timer and leaves and rejoins the group
    for each new topic (about two rebalances per replica per group, every member pausing for each); KafkaJS's leader
    assigns only topics it has itself subscribed (`consumerGroup.js:220`), so a new topic waits until the leader and
    the assignee have both refreshed — later by up to an interval plus the skew between replicas, not lost. Nor the
    cost of `listTopics` on MSK: each call is a full-cluster metadata request, six per replica every 30 s, and the topic
    count grows with tenants × event types. One shared lister per process, or jitter, are the options if either shows.
- **Messages written while no consumer runs, to a topic it never subscribed, are still skipped.** After the fix above,
  a topic created between a consumer's last refresh and its shutdown (or while every replica is down) exists at the
  next startup; `connect()` subscribes it with the caller's `fromBeginning` (false for the backend), so its messages
  are read from the latest offset. Not fixed: using `fromBeginning: true` at startup would also make a new consumer
  group read every existing topic's full retention.
- **Closed — site-report events named a report id that did not exist after an upsert.** Fixed on
  `fix/site-report-event-id`. A site report is unique per (project, day, submitter), and
  `SiteOpsRepository.createSiteReport` upserts on that key, keeping the existing row's `report_id`. Both callers built
  their event before the write: `createSiteReport` put the UUID it had just generated into `site.report.created.v1`, and
  the sync create path put the device's `client_id` into `site.report.submitted.v1`. On a same-day resubmission, or a
  second device id for the same day, the event named a report that does not exist. Who read it: the PM's in-app
  notification ends "report {{report_id}}" (`20260824000002_routed_event_notification_templates/migration.sql:49`),
  and the search indexer loads the row by that id (`search-indexer.consumer.ts:92-98`), found nothing, and never
  indexed the resubmitted summary, so search kept the first version's text. `site.report.submitted.v1` is also read by
  `analytics-invalidation` (project only) and the Go analytics-worker (`report_count`); neither reads the id.
  - Change: `createSiteReport` takes a builder over the RETURNING row, `(row) => OutboxEventInput`, called in the same
    transaction, as `updateIssueStatus` already did; both callers build from `row.report_id`. The event type of a
    resubmission is still `site.report.created.v1`: whether a resubmission should emit a different event is a contract
    decision, not made here.
  - Evidence: unit — the repository passes the RETURNING row to the builder; the service's created and sync-submitted
    events name the row's id when it differs from the generated / client id (site-ops units 193 pass). Integration
    `test/site-ops/08-site-report-event-id.integration.spec.ts` (testcontainers TimescaleDB): two same-day POSTs give
    one row with the second summary and two `site.report.created.v1` outbox rows naming that row; two syncs with
    different `client_id`s for one day give one row (the first id) and two `site.report.submitted.v1` rows naming it.
    Negative control: with the events built from the generated id and `client_id` again, the two new unit tests fail,
    and both integration tests fail on the second outbox row (the first submission's was right); restored, all pass.
    All eight `test/site-ops/` integration suites pass (140 tests). The integration database URL is the container's
    own user, so RLS on the upsert's RETURNING is not exercised there.
- **Mobile sync never learns the report id the server kept.** `/sync/push` with `site_report`
  (`backend/src/modules/sync/sync.service.ts:287-294`) returns only `{ status }`, and the device keeps the report under
  its own `client_id`. When that id lands on an existing (project, day, submitter) report, the device's id names no
  server row; its next edit misses `findReportsByIds`, takes the create path and upserts again. That create path
  (`site-ops.service.ts:222-259`) also skips the last-write-wins check and conflict record of the edit path, and the
  sync item carries no `blocker_category` or `shift`, so the upsert sets both to NULL over values entered on the web.
  Found by /doubt on `fix/site-report-event-id`; not fixed. Options: return the kept `report_id` from push and remap on
  the device, or treat an id miss with a natural-key hit as the edit path.
- **One report can count twice in `site_activity_daily`.** The Go analytics-worker adds one to `report_count` per
  `site.report.submitted.v1` (`services/analytics-worker/internal/metrics/consumer.go:279-293`); two device ids for
  one (project, day, submitter) are one report and two events. Not fixed.
- **Reports written through sync are not indexed for search.** The search indexer subscribes
  `site.report.created.v1` only (`search-indexer.consumer.ts:42-46`), which sync never emits; sync emits
  `site.report.submitted.v1`. Not fixed.
- **The site-report notification says "0 issue(s), 0 photo(s)" on every submission.** `issue_count` and `photo_count`
  are the constants 0 in `site.report.created.v1` (`site-ops.service.ts`, `createSiteReport`), also when a resubmitted
  report already has issues or photos. Not fixed.
- **`approval-escalation.spec.ts` "approval item shows pending status" still cannot fail.** Its only row assertion sits
  in `if (await pendingRow.isVisible(…).catch(() => false))`. "purchase order approval state is inspectable" needs
  `E2E_ADMIN_EMAIL`, a TENANT_ADMIN, whose login requires a second factor; locally it timed out at login.
- **The web E2E suite has no working local recipe.** `scripts/dev/seed-e2e-users.sh` creates its users in realm
  `construction-os`, which the local Keycloak does not have (404; `construction-os-dev` is 200), and on a fresh
  database `prisma/seed.ts` stops at its inspection fixture (`inspections_project_id_fkey`: project
  `00000000-0000-4000-8000-000000000061` does not exist). What ran on 2026-11-13: infra `postgres pgbouncer redis kafka
schema-registry keycloak temporal` (minio's image does not pull, above), migrations, `prisma/seed-realistic.ts`,
  `prisma/provision-keycloak-demo.ts`, web on 3001, and the specs with `BASE_URL=http://localhost:3001` and
  `E2E_SE_*` / `E2E_PM_*` / `E2E_SAFETY_*` set to the EKC demo accounts.
