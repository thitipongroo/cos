# Construction OS — Claude Code Instructions

## MANDATORY FIRST ACTION — every session, no exceptions

Read `context.md` in full before doing anything else.
Do not answer questions, do not write code, do not run commands until `context.md` is loaded.

`context.md` is the entry point, not the corpus. Everything under `context/` loads
on demand from there. `context/00_master_construction_os.md` was 6,407 lines and
cost ~98,500 tokens to read whole, two thirds of it Phase blocks that do not apply
to the task in hand; the 25 Phase commands moved to `context/phases/` on 2026-09-02
and it is now 1,099 lines. Use `.claude/skills/phase-index/SKILL.md` to find the
phase, then read that one file — not a line range of the master, which no longer
holds them.

**This is a change of mechanism, not of obligation.** Every Quality Mandate, every
numbered Rule and every Phase block still binds in full. What changed on 2026-09-02
is that they arrive when the work reaches them instead of all at once: the files in
`.claude/rules/` carry `paths:` frontmatter and load automatically when a matching
file is edited. Not having read a section is not a defence for breaching it — if
the task touches something and the rule did not fire, go and read the section.

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

## When to invoke what — not a suggestion

Skill and agent auto-discovery is the model reading a `description` and deciding.
It is a convenience, not a guarantee, and nothing enforces it. These triggers are
written here so the decision is not left to judgement.

| When                                                                                | Invoke                                                                            | Not optional because                                                                                              |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Before writing the first line of code for any Phase, task or multi-step deliverable | `/plan-gate`                                                                      | Rule 38. `rule-38-check-approval.sh` blocks `.ts/.tsx/.sql` writes once a plan is pending and unapproved          |
| Before reporting anything complete or done                                          | `/verify`                                                                         | Rule 36. An item without command output is not complete                                                           |
| **Before every `git push`**                                                         | `bash scripts/ci/verify-before-push.sh`                                           | It runs the CI jobs that can run here. Saying "verified" without it means a subset was checked and called a whole |
| Writing or changing a test                                                          | `engineering-unit-testing` · `engineering-integration-testing` · `qa-test-design` | QM-1 is 100% lines and branches; the traps are recorded there, not discoverable from the code                     |
| Reviewing a diff before merge                                                       | `engineering-code-reviewer`                                                       | Nothing else in this repository covers code review                                                                |
| Touching CI, deployment, infrastructure or secrets                                  | `devops-agent`                                                                    | QM-4, QM-16, QM-18 and ADR-012 all constrain this and are easy to breach by habit                                 |
| Writing or fixing documentation                                                     | `doc-agent`                                                                       | QM-11, Rule 29 and Rule 37 all apply and each has caught a real mistake                                           |
| A defect with a stack trace or a failing test                                       | `engineering-debugging`                                                           | Fixing the symptom is the default failure mode                                                                    |

**A `/verify` or a push-check that was not run is not a check.** Report what you
actually ran, with its output — never "looks good", never "should pass".

---

## All other rules

Rules 1–40 are defined in:

- `context/00_master_construction_os.md` — Rules 1–40 (authoritative)
- `context.md` — Rules 26–40 (agent-optimized form)

`.claude/rules/rationalization-guard.md` is not one of them. It is not a rule to obey; it lists the sentences that
precede a skipped Rule 36 or Rule 38, so that meeting one in your own reasoning is recognisable as the signal to run the
gate. It loads in every session for that reason.

All rules apply to every task. Rules 36 and 38 are repeated here because they are
the two gates most likely to be skipped under time pressure.
