---
name: qa-performance-verification
description: Decide whether a performance change is worth keeping — re-measure it the way the baseline was measured, compare the number against run-to-run variance, and revert anything that did not beat it. Use after a change made to run faster, when an optimisation barely moved the number, or when deciding whether a speed change stays or is reverted.
allowed-tools:
  - "Read"
  - "Glob"
  - "Grep"
  - "Bash"
  - "Edit"
---

# Performance Verification

`qa-performance-testing` measures against a budget. QM-6 holds the budgets and
`.github/workflows/lighthouse.yml` and `load-tests.yml` guard them in CI. All of that answers "are we
inside the budget?"

None of it answers the question this skill exists for: **did this particular change help, and does it
earn the complexity it costs?** Without that step, work that moved nothing lands anyway — because it
was already written — and the codebase accretes optimisations that never bought anything.

## When to use

- A change was made for speed and is about to be kept
- A budget in QM-6 or an SLO in QM-14 was missed and something was done about it
- Someone proposes an optimisation that "obviously helps"

**Not for:** finding the bottleneck (`qa-performance-testing`, `qa-load-testing`), or a change made
for correctness that happens to be faster.

## 1. Re-measure the way the baseline was measured

Same command, same conditions, same fixed budget of requests or iterations. A baseline on a cold
cache against a result on a warm one measures the cache.

```bash
pnpm --filter @cos/web build          # bundle
npx lhci autorun                      # LCP / INP / CLS, per QM-6
k6 run tests/load/<scenario>.k6.js    # p95, per QM-14
```

Whatever produced the baseline number produces the comparison number. If you cannot reproduce the
baseline conditions, you do not have a baseline — take one first and say so.

## 2. Change one thing

Three optimisations measured together produce one number and no attribution. If they must ship
together, measure each alone first.

## 3. Beat the noise, not the mean

Repeat the measurement. Compare the delta against run-to-run variance, not against a single prior
run. A 3% gain inside ±5% variance is a different sample, not a gain.

## 4. Decide — and "neutral" is a revert

| Result versus baseline                       | Decision                                                    |
| -------------------------------------------- | ----------------------------------------------------------- |
| past the threshold, suite green               | **keep** — put the before and after numbers in the commit    |
| no measurable change beyond variance          | **revert**                                                   |
| worse                                         | **revert**                                                   |
| improved, but a test went red or was changed  | **revert** — a regression wearing a win's clothing           |

Neutral is the one people get wrong. The change is already written, throwing it away feels wasteful,
and so it lands unmeasured. Code that is kept is maintained forever; make it pay for itself. QM-1 is
100% lines and branches here, so an optimisation that needed a test skipped, deleted or loosened has
failed a mandate as well as this step.

## 5. Log the attempt — kept and reverted alike

A revert leaves no trace in git history, which is exactly why the same dead idea is tried again next
quarter. Add one row to `docs/registers/performance-attempts.md` for every attempt, including the
ones that went nowhere. Read that file before proposing an experiment.

## Before reporting

Show the two measurements, the variance, the decision, and the register row. "It felt faster" is not
a measurement, and neither is a single run either side.

## This project decides it

The budgets are QM-6 and the SLOs are QM-14 — this skill does not set numbers, it decides whether a
change earned its place against them. The keep-or-revert rule and the attempt register are new here
and are recorded in `docs/registers/quality-baselines.md`; if you settle a variance threshold for a
particular measurement, put it there rather than in this file.
