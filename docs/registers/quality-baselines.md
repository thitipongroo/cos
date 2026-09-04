# Quality Baselines Register

The Quality Mandates say what must be true. This register says three things they do not:

1. which numbers are **enforced** today, and by which command
2. which are **measured but not yet enforced**, with today's value and the direction they may move
3. which exceptions are open, who owns each, and when it expires

A mandate with a number and no command behind it is an aspiration. A number nobody has recorded
cannot be held. Both are why this file exists.

**Authority:** the Quality Mandates in `.claude/rules/` remain authoritative for every number in the
Enforced table below — this register indexes them, it does not set them. Rows in the Measured table
are set here, because no mandate covers them yet.

---

## 1. Enforced today

Every row names the command that produces the verdict. If a command cannot be named, the row belongs
in the Measured table instead.

| Dimension             | Rule                              | Checked by                                                        | Runs at        | Authority   |
| --------------------- | --------------------------------- | ----------------------------------------------------------------- | -------------- | ----------- |
| Unit coverage         | 100% lines, 100% branches         | `pnpm --filter @cos/backend test:cov`                             | task end, CI   | QM-1        |
| Python coverage       | lines ≥ 99%                       | `pytest --cov --cov-fail-under=99`                                | CI             | QM-1        |
| Types                 | zero errors                       | `pnpm type-check`                                                 | every edit, CI | Rule 32     |
| Lint                  | zero errors                       | `pnpm lint`                                                       | every edit, CI | ci.yml      |
| Secrets               | none in source                    | `.github/workflows/ci.yml` → `secret-scan`                        | CI             | QM-4        |
| Static security       | no unresolved findings            | `.github/workflows/semgrep.yml`, `.semgrep/cos-rules.yml`         | CI             | QM-4        |
| Dependency advisories | no unmitigated high or critical   | `.github/workflows/ci.yml` → `dependency-audit`                   | CI             | QM-4        |
| Container / IaC       | no unignored findings             | `.github/workflows/ci.yml` → `security-scan`, `.trivyignore.yaml` | CI             | QM-4        |
| Mutation score        | per `backend/stryker.config.json` | `.github/workflows/mutation-tests.yml`                            | CI             | QM-1        |
| Core Web Vitals       | per QM-6                          | `.github/workflows/lighthouse.yml`                                | CI             | QM-6        |
| Load / p95            | per QM-6 and QM-14                | `.github/workflows/load-tests.yml`                                | CI             | QM-6, QM-14 |
| Rules index integrity | every rule reachable from index   | `scripts/ci/check-claude-rules-mirror.sh`                         | CI             | —           |
| Hooks still fire      | all nine emit parseable JSON      | `scripts/ci/check-hooks-fire.sh`                                  | CI             | —           |
| Skill routing         | positives rank, negatives lose    | `scripts/ci/check-skill-routing.mjs`                              | CI             | —           |

### How circular is each check

Ranked by one question: **can the agent make this pass by writing code that does not work?**

| Kind     | Checks                                                                                          | Can the agent argue with it |
| -------- | ----------------------------------------------------------------------------------------------- | --------------------------- |
| External | Lighthouse, k6 load, Trivy, Semgrep registry rules, dependency advisories, secret scan          | No                          |
| Project  | ESLint, ruff, sqlfluff, markdownlint, `check-*.mjs` fitness functions, `.semgrep/cos-rules.yml` | A human owns the rule file  |
| Suite    | jest, pytest, Stryker mutation score                                                            | Yes — the agent writes them |

At least one external check must remain in the gate. A bar made entirely of the project's own test
suite proves only that the author agrees with the author.

---

## 2. Measured, not yet enforced

Recorded so they cannot get quietly worse. No target is invented here: the rule is the direction, and
the value is whatever was last recorded. A number that improves is updated in the same commit; a
number that drops is the finding.

Tolerance for all rows: **0.5%**, to absorb drift when an unrelated file moves the number.

| Metric                      | Recorded value                            | Recorded on | Direction     | Source of the number                       |
| --------------------------- | ----------------------------------------- | ----------- | ------------- | ------------------------------------------ |
| Backend unit suites / tests | 139 suites, 1879 tests at 100/100/100/100 | 2026-07-21  | must not fall | QM-1, verified run                         |
| Backend integration suites  | 13 suites, 129 tests                      | 2026-07-21  | must not fall | QM-1                                       |
| Temporal workflow suites    | 3 suites, 12 tests (serial)               | 2026-07-21  | must not fall | QM-1                                       |
| ADRs on record              | 97 numbered (99 files)                    | 2026-09-03  | informational | `ls docs/architecture/adr`                 |
| `.claude` skills            | 44                                        | 2026-09-03  | informational | `ls -d .claude/skills/*/`                  |
| `.claude` commands          | 11                                        | 2026-09-03  | informational | `ls .claude/commands/*.md`                 |
| Web bundle, initial route   | _not yet recorded_                        | —           | must not grow | record with `pnpm --filter @cos/web build` |
| Mobile JS bundle            | _not yet recorded_                        | —           | must not grow | record with the Expo export                |
| CI wall-clock, `lint` job   | _not yet recorded_                        | —           | must not grow | `.github/workflows/ci.yml`                 |

Rows marked _not yet recorded_ are deliberately empty. A number guessed into this table is worse than
a blank one, because the blank is visible and the guess is not. Fill each in the commit that first
measures it, with the command that produced it.

---

## 3. Exceptions

Every exception has an owner and an expiry. An exception with neither is a silent permanent
weakening of the bar.

| ID  | Rule relaxed | Path / scope | Reason | Owner | Expires |
| --- | ------------ | ------------ | ------ | ----- | ------- |
| —   | —            | —            | —      | —     | —       |

Standing exception lists that live in tool config — `.trivyignore.yaml`, `.markdownlintignore`,
`.sqlfluffignore`, `.prettierignore`, `.jscpd.json` — are not duplicated here. Add a row only when an
exception is granted **against a Quality Mandate**, which those files cannot express.

Default lifetime: **90 days** — long enough to plan the fix, short enough to remember why it was
granted.

---

## 4. Changing this file

- A number moves only in the commit that measured it, with the command in the message
- Tightening the bar is silent; **loosening it is loud** — a row edited downward in the same commit
  as the change that was failing is the pattern Rule 41 and `/verify` both exist to catch
- New dimensions go to a Quality Mandate in `.claude/rules/` first; this register indexes mandates,
  it does not replace them
