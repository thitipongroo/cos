---
description: Dispatch engineering work to engineering-agent — the agent picks the skill that covers it, or says nothing does and stops
argument-hint: [what to build, fix, refactor or test]
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash
  - Agent
---

# Engineering

Target: `$ARGUMENTS`

Route this to `engineering-agent` rather than working it here. The agent's value
is its Execution Contract: it must carry out the work through the skill that
covers it, and when no skill does, it says so and stops instead of improvising a
method. Working the task inline loses that guarantee.

## Before dispatching

If this is a Phase, a task, or any multi-step deliverable, **run `/plan-gate`
first and get the product owner's approval.** Rule 38 is a human gate; sending a
subagent does not satisfy it and does not move it. Rule 38 also forbids
delegating the spec reading — that reading happens here, with the Read tool, not
inside the agent.

If the request is a single, already-approved change, dispatch straight away.

## Dispatch

Use the Agent tool:

- subagent_type: `engineering-agent`
- prompt: the concrete change, the files it touches, the approved obligation
  items it implements, and the acceptance condition. Construct that context
  explicitly — the agent does not inherit this session's history

Name which skill you expect it to reach for, so a different choice is visible in
its report rather than silent.

## On the way back

The agent reports what it did and what each method required it to check. That is
its claim, not your verification.

- Run `/verify` before any of it is described as complete — Rule 36 wants one
  command and its output per obligation
- Re-run the tests yourself on the resulting tree; a passing run reported by a
  subagent is a claim about a tree you have not seen
- If it reports that no skill covered the request, that is a correct outcome.
  Take it to the product owner; do not re-dispatch with the constraint removed
