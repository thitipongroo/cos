---
description: Dispatch quality work to qa-agent — test design, execution, triage, and the performance, security, accessibility and load disciplines
argument-hint: [what to test, or the readiness question being asked]
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash
  - Agent
---

# QA

Target: `$ARGUMENTS`

Route this to `qa-agent`. Its twelve skills each decide what to test and at which
level before anything is written; improvised testing skips that decision and
usually lands on the level that is easiest rather than the one that carries the
risk.

## Before dispatching

Establish which numbers apply and name them in the prompt. This repository does
not accept a budget or a threshold invented during the work:

- **QM-6** holds the performance budgets
- **QM-14** holds the SLOs and the error budget
- **QM-1** is 100% lines and branches
- **Phase 19** in `context.md` is the readiness protocol — 39 automated checks,
  22 manual, then Section B, one line per Quality Mandate

If the answer being asked for is "is this ready to ship", the shape of the answer
is Phase 19's, not a summary of a test run.

## Dispatch

Use the Agent tool:

- subagent_type: `qa-agent`
- prompt: what is under test, which of the numbers above apply, what evidence is
  required back, and what is deliberately out of scope

## On the way back

A finding without a reproduction is an opinion, and a pass without output is a
claim. Re-run the commands behind anything you are about to repeat as fact, then
report under Rule 36 — a mixed result is never summarized as success.
