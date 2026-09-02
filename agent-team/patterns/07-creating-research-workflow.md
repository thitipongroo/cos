# 7. Read-then-report

**Creates**: `.claude/commands/workflows/*.md` (coordinator) + `.claude/agents/*.md` (read-only researcher)
**Extracted from** — paths below are in the source repository, not in this kit:
`.claude/commands/workflows/best-practice/*.md` — 5 files carrying "read-then-report" ·
`.claude/agents/workflows/best-practice/*.md` — 5 files carrying "Do NOT modify any files" · "Never guess" appears in 13
files across both

---

Split "find out" from "change it":

```text
/command                 coordinator
   └─ research agent     read-only — no Write, no Edit
        └─ findings
   └─ re-confirm each finding yourself
   └─ present, and stop
```

## The coordinator

Phased, and the phases are numbered in the file: launch the agent → merge
findings → run the checklist → present → apply only after approval.

Takes its scope from `$ARGUMENTS` with a stated default, declared in
`argument-hint`.

> This is a **read-then-report** workflow. Launch the agent, merge findings, and
> produce a report. Only take action if the user approves.

## The researcher

Read-only by allowlist, not by instruction — no `Write`, no `Edit` in `tools:`.
Its own file repeats the constraint so the reason survives:

> This is a **read-only research** workflow. Fetch sources, read local files,
> compare, and return findings. Do NOT modify any files.

Two more rules the source states outright:

- **Never guess** versions or dates — extract them from fetched data
- Report **additions and removals only** — not wording changes

## Why the coordinator re-checks

Findings arrive as claims. Re-run the command behind each one before it reaches
the user. A finding that does not reproduce is dropped, not softened — that step
is cheaper than sending someone to fix a file that was already correct.

_Prevents:_ an agent editing files based on its own unverified conclusion.
