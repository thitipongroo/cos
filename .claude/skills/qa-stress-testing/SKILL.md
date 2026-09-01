---
name: qa-stress-testing
description: Push the system past its expected capacity to find where it breaks and how it behaves when it does. Use to establish real limits, and to check that failure is graceful rather than catastrophic.
allowed-tools:
  - "Read"
  - "Glob"
  - "Grep"
  - "Bash"
---

# Stress Testing

The question is not whether it breaks - everything does. The questions are where,
how, and whether it comes back.

## Method

1. **Start at the known-good load** established by load testing
2. **Increase until something fails.** Record the level at which each thing
   starts to degrade, not only where it stops
3. **Hold past the failure point**, then remove the load and watch recovery
4. **Repeat with one resource constrained** - memory, connections, disk - to find
   which one binds first

## What to observe

- **The first thing to degrade**, and whether it degrades or falls over
- **The failure mode.** Rejecting requests with a clear error is acceptable;
  timing out, corrupting data, or losing writes is not
- **Backpressure** - does the system shed load, or does it queue until it dies
- **Recovery** - does it return to normal on its own once load drops, and how
  long does that take

## Reporting

The breaking point per resource, the failure mode at each, the recovery time, and
which failures were graceful. The failure mode matters more than the number - a
system that fails cleanly at a lower limit is better than one that corrupts data
at a higher one.

## Rules

- Never stress-test shared or production infrastructure without agreement
- Record what you had to restart afterwards. That is part of the result
