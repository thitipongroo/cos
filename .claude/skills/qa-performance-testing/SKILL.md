---
name: qa-performance-testing
description: Measure latency and throughput against a stated budget under expected conditions. Use when a budget exists and you need to know whether the system meets it, or which part does not.
allowed-tools:
  - "Read"
  - "Glob"
  - "Grep"
  - "Bash"
---

# Performance Testing

Measure against a number that was agreed in advance. Without a budget you are
collecting figures, not testing.

## Before measuring

- **Get the budget** - the metric, the percentile, and the threshold. "Fast
  enough" cannot pass or fail
- **Percentiles, never averages.** p95 and p99 are where users live; the mean
  hides everything that matters
- **Fix the environment.** Note hardware, dataset size and concurrency. A result
  from a different shape of environment is not comparable

## Measuring

- **Warm up first**, then measure. Cold caches and JIT produce numbers that
  describe startup, not steady state
- **Run three times.** A single run tells you nothing about variance
- **Change one thing between runs.** Two changes produce a delta you cannot
  attribute

## Reporting

State the budget, the measured percentiles, the environment, and pass or fail per
metric. When something fails, name the slowest component with the evidence that
identified it - not a guess about where the time went.

## Rules

- Never quote an improvement without the baseline it improved on
- Never compare a number from one environment to a budget set for another
- A measurement you cannot reproduce is not a measurement
