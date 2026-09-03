---
description: Set up the workspace a multi-step change will be built in — detect the isolation you already have, choose branch or worktree deliberately, prove the baseline is clean
argument-hint: [what the change is, and the branch name if you have one in mind]
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash
  - Skill
---

# Workspace

Target: `$ARGUMENTS`

Decide where this work is going to be built, before the first edit rather than
after a half-finished change is sitting on a shared branch.

## Step 1 — Follow the skill

Invoke the `workspace-isolation` skill and carry it out as written. It holds the
detection commands, the ordering of the three mechanisms, and the baseline rule.
This command exists so the decision is reached by name instead of by chance; it
does not restate the method.

## Step 2 — Report before moving on

State, in this shape, what you ended up with:

```text
Workspace: <path> on <branch> (<mechanism, and why that one>)
Baseline:  <N> passed, <M> failed
```

A baseline that was not run is reported as not run, never as clean.

## Step 3 — Hand over to the gate

An isolated workspace is where an approved plan gets implemented. It is not a
plan and does not substitute for one.

If this is a Phase, a task, or any multi-step deliverable, run `/plan-gate` next
and wait for the product owner. Say so explicitly in your report, so the next
turn does not open with code.
