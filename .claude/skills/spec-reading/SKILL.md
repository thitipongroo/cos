---
name: spec-reading
description: How to turn a written requirement into an exhaustive, verifiable task list — read line by line yourself, never delegate the reading, tag each item, and prove completion with filesystem evidence. Load before planning any multi-step deliverable.
user-invocable: false
allowed-tools:
  - "Read"
  - "Glob"
  - "Grep"
---

# Spec Reading

The obligation list comes from the requirement text, not from your model of what
the task probably needs. This skill is the discipline that keeps those two apart.

## Read it yourself — never delegate

Read the requirement with the Read tool, directly, in this context.

Do **not** send a subagent to extract the items for you. A subagent returns a
summary, and a summary is exactly where obligations are lost — the item that gets
dropped is the one that was phrased unlike its neighbours. If the source is long,
read it in chunks with `offset`/`limit`; do not switch to a summarizer.

The same applies to a file you have "already read" in an earlier session. Read it
again. Files change.

## One task per line item

Walk the requirement top to bottom and emit one task per obligation **as written**.

- A sentence containing two deliverables is two tasks
- A parenthetical that names a file, script, or config is its own task
- "including X" and "and also Y" are additional tasks, not decoration
- A constraint ("must be under N", "must not use Z") is a task — it is verifiable

Do not merge items because they look related. Do not drop an item because it
looks implied by another. Do not add items the text does not contain.

## Tag every item

| Tag | Meaning | Action |
|---|---|---|
| `READY` | Everything needed to do this is present in the source material | Implement after approval |
| `BLOCKED: <reason>` | A fact the work depends on is absent from **all** available sources | Stop; ask; never stub |

Before tagging `BLOCKED`, search for the answer first — `Grep` the whole
repository for the term, and read the surrounding lines of any hit. Most apparent
gaps are resolved somewhere in the same document. A wrong `BLOCKED` costs more
than a missing one: it sends a question back that the text already answered.

Something being unbuilt is not `BLOCKED`. Something being undecided is.

## Completion needs evidence

An item is complete when a command proves it, not when you remember doing it.

```bash
ls -la <path>          # it exists
grep -n "<symbol>" <f> # it contains what it must
cat <path>             # it says what it must say
```

Paste the actual output. No output = not complete. Verifying part of a list is
not verifying the list — "I checked X" and "everything is done" are different
claims, and only the second one closes the task.

## This project decides it

The method above is general. Where this repository has already fixed a number, a tool or a procedure, that decision wins — read it before applying anything here.

- `CLAUDE.md` Rule 38 and Rule 36
- `context.md` GLOBAL EXECUTION RULES

In this repository the tags are `READY` and `NEEDS_ESCALATION`, and an escalation must meet one of two definitions: `UNSPECIFIED` (absent from all spec and context files) or `AWAITING_DECISION` (a pending decision marker in context files 05-11). Credentials, resolved technologies, and anything the spec marks RESOLVED do not qualify. Rule 38 also forbids delegating the reading to a subagent.
