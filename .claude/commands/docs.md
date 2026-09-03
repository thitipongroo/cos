---
description: Dispatch documentation work to doc-agent — API reference, user guides, code examples, release notes, migration guides, knowledge base
argument-hint: [what to document, or the document to fix]
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash
  - Agent
---

# Docs

Target: `$ARGUMENTS`

Route this to `doc-agent`. Documentation that describes the last release is worse
than none — it teaches the wrong thing confidently — so the method each of its
six skills carries is verification against the running code, not against the
ticket.

## What binds documentation here

- **QM-11** — a README per module, an ADR in `docs/architecture/adr/` for every
  architectural decision, one OpenAPI document per service kept in sync by CI,
  and a `BREAKING CHANGE:` entry in `CHANGELOG.md`
- **Rule 29** — `rule-29-check-adrs.sh` blocks a write citing an ADR number with
  no matching file
- **Rule 37** — touching `docs/specifications/` means grepping `context.md`, all
  of `context/` (the 25 Phase files live in `context/phases/`) and
  `.claude/rules/` for the changed term, and fixing every match in the same commit

Authority order is `docs/specifications/` first, then `context/`, then
`context.md`. A disagreement between them is a finding, and the specification
wins.

## Dispatch

Use the Agent tool:

- subagent_type: `doc-agent`
- prompt: the document, its audience, the source of truth it must be checked
  against, and which of the constraints above apply

## On the way back

If what came back is a claim about drift rather than a document, that is `/drift`
territory — confirm each finding yourself before it reaches anyone. Otherwise
verify the document against the code it describes, then report under Rule 36.
