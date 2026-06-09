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

## Rule 38 reading must be done by the agent — never delegated

Rule 38 step 1 says "read the spec line by line." This means:

- Read the Phase/task spec section **yourself**, using the Read tool directly
- Do NOT use a subagent (Explore, general-purpose, or any other) to extract
  spec items on your behalf — subagents summarize and will drop critical details
- Do NOT accept a subagent's summary as a substitute for line-by-line reading
- If the spec section is long: read it in chunks via Read tool with offset/limit

**Why:** In a prior session, an Explore subagent extracted Phase 21 Generate items
but missed the line `"IoT platform RESOLVED — EMQX"` on the same page, causing
three incorrect NEEDS_ESCALATION items. The resolution was in the file all along.

## NEEDS_ESCALATION criteria — exact definition

Before tagging any item as `NEEDS_ESCALATION`, verify it meets one of these two
definitions from context.md. If it does not match either — it is NOT an escalation.

| Tag                 | Definition                                                      | Required action                      |
| ------------------- | --------------------------------------------------------------- | ------------------------------------ |
| `UNSPECIFIED`       | Information is absent from ALL spec files and context files     | STOP — do not implement, do not stub |
| `AWAITING_DECISION` | Spec files contain a pending decision marker (files 05–11 only) | BLOCK until product owner answers    |

Items that do NOT qualify as NEEDS_ESCALATION:

- Infrastructure credentials (API keys, secrets) — these are config, not decisions
- Technology choices already resolved anywhere in `docs/specifications/` or `context/`
- Items where the spec says "RESOLVED" or names a specific technology

---

## All other rules

Rules 1–38 are defined in:

- `context/00_master_construction_os.md` — Rules 1–38 (authoritative)
- `context.md` — Rules 26–38 (agent-optimized form)

All rules apply to every task. Rules 36 and 38 are repeated here because they are
the two gates most likely to be skipped under time pressure.
