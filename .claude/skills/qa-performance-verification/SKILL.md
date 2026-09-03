---
name: qa-performance-verification
description: Decide whether a performance change is kept or reverted, once the numbers already exist. Use after a change made to run faster, when an optimisation barely moved the number, or when a change must earn its place before it stays. Produces no measurements of its own — qa-performance-testing supplies the figures this skill judges.
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

## 1. Get the numbers from qa-performance-testing

This skill does not measure anything. `qa-performance-testing` owns that and says how: the budget,
the percentiles, the warm-up, three runs, a fixed environment, and one change between runs. Run it,
or read the run someone else already did, and come back with three things.

| What you need | Why the decision below cannot be made without it            |
| ------------- | ------------------------------------------------------------ |
| the baseline  | "faster" means nothing without the number it beat            |
| the result    | produced the same way, or it is a different experiment       |
| the variance  | a delta inside the noise is a different sample, not a gain   |

If any of the three is missing, stop and go get it rather than deciding around it. A verdict from one
run either side is a preference wearing a number.

The reason this boundary is drawn and not blurred: a behavioural routing eval on 2026-09-03 found
that when this skill also explained how to measure, requests belonging to `qa-performance-testing`
and `qa-test-execution` landed here instead — five times across three repeats. Keeping the method in
one place is what stops that.

## 2. Decide — and "neutral" is a revert

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

## 3. Log the attempt — kept and reverted alike

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
