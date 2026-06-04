# Construction OS — Claude Code Instructions

## MANDATORY FIRST ACTION — every session, no exceptions

Read `context.md` in full before doing anything else.
Do not answer questions, do not write code, do not run commands until `context.md` is loaded.

---

## Two gates that can never be skipped

### Rule 38 — Human gate: before writing the first line of code

For every Phase, task, or multi-step deliverable:

1. Read the Generate / Deliverables / Constraints section of the spec **line by line**
2. Create a `TodoWrite` list — one task per line item — tagged `READY` or `NEEDS_ESCALATION: <reason>`
3. **Present the list to the product owner and wait for explicit approval** before writing any code
4. For any `NEEDS_ESCALATION` item — wait for product owner decision; never stub, never skip, never proceed unilaterally
5. Mark each task complete only when it has filesystem evidence (`ls`/`grep`/`cat` output)

**This is a human gate. Product owner approval is required. Automation cannot replace it.**

### Rule 36 — Verification gate: before claiming anything complete

Before reporting any Phase, task, or fix as "complete" or "done":

1. Read the relevant spec section (Generate / Constraints / Exit Criteria) **line by line**
2. For **each item**: run `ls`/`grep`/`cat` — show the actual command output
3. Only then summarize — any item without filesystem evidence = NOT complete

> "I verified X" ≠ "everything is complete."

---

## All other rules

Rules 1–38 are defined in:

- `context/00_master_construction_os.md` — Rules 1–38 (authoritative)
- `context.md` — Rules 26–38 (agent-optimized form)

All rules apply to every task. Rules 36 and 38 are repeated here because they are
the two gates most likely to be skipped under time pressure.
