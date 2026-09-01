---
name: qa-load-testing
description: Measure how the system behaves at expected and peak volume, sustained over time. Use before a launch, a campaign, or any event with a known traffic increase.
allowed-tools:
  - "Read"
  - "Glob"
  - "Grep"
  - "Bash"
---

# Load Testing

Load testing answers whether the system holds up at the volume you expect. It is
not about finding the breaking point - that is stress testing.

## Define the load first

- **Concurrent users or requests per second**, taken from real traffic where it
  exists
- **The mix** - which endpoints, in what proportion. A test that hammers one
  cheap endpoint proves nothing about a real morning
- **Duration** - long enough to expose leaks, cache eviction and queue growth. A
  two-minute run hides all three
- **The pass criteria** - the same budgets performance testing uses

## Running

- Warm the system, then start measuring
- Generate load from outside the system under test, or you are measuring your own
  generator
- Watch the system, not only the client: CPU, memory, connection pools, queue
  depth, error rate. The client sees latency; the server explains it

## Reporting

The load profile, the duration, the percentiles over time, the error rate, and
the resource curves. State whether the system met the budget for the whole run,
not merely at the end.

## Rules

- **Rising latency at constant load is a failure**, even if the final number
  passes. It means something is accumulating
- Never load-test production without agreement and a window
- Compare against the previous run on the same profile, or the number has no
  meaning

## This project decides it

The method above is general. Where this repository has already fixed a number, a tool or a procedure, that decision wins — read it before applying anything here.

- `context.md` QM-6 — Performance Budgets
- PHASE 19 check #7

The load profile is fixed: `tests/load/qm6-baseline.js`, 100 VU for 5 minutes. `tests/load/api-baseline.js` is a different scenario (200 VU, reads only) and asserts none of the QM-6 budgets — the two were confused for each other once, recorded as §35.13 ESC-12.
