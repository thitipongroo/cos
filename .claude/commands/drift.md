---
description: Check whether documentation still matches the repository, report the gaps, and change nothing without approval
argument-hint: [docs to check, e.g. README.md or docs/]
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash
  - Agent
---

# Drift Check

Target: `$ARGUMENTS` (defaults to `README.md`, `docs/`, and `agent-team/`)

Authority order in this repository: `docs/specifications/` first, then
`context/` as the compiled execution view of it (`00_master_construction_os.md` plus
`context/phases/`), then
`context.md`. A disagreement between those three is a finding in its own right —
Rule 37 exists because that drift has happened twice, and
`rule-37-check-spec-drift.sh` only fires on writes to `docs/specifications/`, so a
drift nobody wrote into is invisible to it.

Do not report `docs/specifications/` as wrong because `context.md` disagrees. The
specification wins; the context file is what needs updating.

Read-then-report. This command finds what has gone stale and stops; the repair is
a separate, approved step.

## Phase 1 — Research

Use the Agent tool to run `doc-drift-researcher`:

- subagent_type: `doc-drift-researcher`
- prompt: name the documents to read and the directories to check them against.
  Ask for the structured report defined in that agent's own definition.

Wait for it to finish. The agent is read-only — it cannot have changed anything.

## Phase 2 — Confirm before believing

Findings arrive as claims. Re-run the command behind each one yourself before it
reaches the user. A finding that does not reproduce is dropped, not softened.

This step is not optional. It is cheaper than sending someone to fix a file that
was correct all along.

## Phase 3 — Report

| # | Type | Location | Finding | Confirmed by |
|---|------|----------|---------|--------------|
| 1 | broken-reference | `README.md:42` | names `scripts/build.sh`, absent | `ls: no such file` |

State plainly when nothing drifted, with the counts that show the check was real:
"checked N claims across M documents, no drift".

## Phase 4 — Stop

Do not edit any file. Present the table and ask which findings to fix. Fixes
happen in a following turn, on the user's word — a drift report that repairs
itself gives no one the chance to say the document was right and the code was
wrong.
