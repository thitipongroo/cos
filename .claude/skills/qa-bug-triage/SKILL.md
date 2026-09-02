---
name: qa-bug-triage
description: Assess incoming defect reports - reproduce, classify, prioritise and route. Use when a backlog of reports has built up, or a new report needs a severity before anyone commits time to it.
allowed-tools:
  - "Read"
  - "Glob"
  - "Grep"
  - "Bash"
---

# Bug Triage

Triage decides what happens to a report, quickly and consistently. Consistency
matters more than any individual call.

## Steps per report

1. **Reproduce.** On the stated version and environment. If you cannot, say what
   you tried and ask for the missing detail - do not close it as irreproducible
   on one attempt
2. **Classify** - defect, expected behaviour, duplicate, environment, or feature
   request. Say which and why
3. **Severity** - the impact, independent of who is asking:

   | Severity | Meaning |
   |---|---|
   | Critical | data loss, security exposure, or the core flow is unusable |
   | High | a main flow fails, with no reasonable workaround |
   | Medium | a flow fails but has a workaround |
   | Low | cosmetic, or affects a rare path |

4. **Priority** - severity weighed against frequency and who is affected.
   Severity is a property of the defect; priority is a decision
5. **Route** with the reproduction, the version, and the expected behaviour

## Rules

- **Severity is not negotiated by volume.** Ten reports of a cosmetic issue do not
  make it critical - they make it frequent, which is what priority is for
- **A duplicate is linked, never silently closed.** The reporter needs to see it
  is known
- **Never close as "works on my machine".** Record the environment difference;
  that difference is the defect

## This project decides it

The method above is general. Where this repository has already fixed a number, a tool or a procedure, that decision wins
— read it before applying anything here.

- `context.md` QM-17 — Incident Management
- QM-10 — Error Taxonomy

QM-17 sets the severity ladder and the response time for each — P0 within 15 minutes, P1 within 30. QM-10 fixes the
error code format a report should quote.
