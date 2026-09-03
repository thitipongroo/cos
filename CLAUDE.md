# Construction OS — Claude Code Instructions

## MANDATORY FIRST ACTION — every session, no exceptions

Read `context.md` in full before doing anything else.
Do not answer questions, do not write code, do not run commands until `context.md` is loaded.

`context.md` is the entry point, not the corpus. Everything under `context/` loads
on demand from there. `context/00_master_construction_os.md` was 6,407 lines and
cost ~98,500 tokens to read whole, two thirds of it Phase blocks that do not apply
to the task in hand; the 25 Phase commands moved to `context/phases/` on 2026-09-02
and it is now 1,099 lines. Invoke the `phase-index` skill to find the
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

| When                                                                                     | Invoke                                  | Not optional because                                                                                                                                               |
| ---------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Starting a multi-step change, before the first edit                                      | `/workspace`                            | Which branch or worktree the work lands in, and a clean baseline — without one, the first red run cannot be attributed                                             |
| Before writing the first line of code for any Phase, task or multi-step deliverable      | `/plan-gate`                            | Rule 38. `rule-38-check-approval.sh` blocks `.ts/.tsx/.sql` writes once a plan is pending and unapproved                                                           |
| Before a non-trivial decision stands — a migration, a Kafka contract, a guard, money     | `/doubt`                                | Rule 41. Between the plan gate and the verification gate nothing checks the decision itself, and that is where it is still cheap to change                         |
| Before reporting anything complete or done                                               | `/verify`                               | Rule 36. An item without command output is not complete                                                                                                            |
| **Before every `git push`**                                                              | `bash scripts/ci/verify-before-push.sh` | It runs the CI jobs that can run here. Saying "verified" without it means a subset was checked and called a whole                                                  |
| Finishing a branch — merge, pull request, or leave it                                    | `/finish`                               | The integration decision is the product owner's, and the cleanup step destroys work when it is guessed                                                             |
| Changing code — a feature, a fix, a refactor                                             | `/engineering`                          | The agent's fail-closed contract: when no skill covers the request it says so and stops, instead of improvising a method                                           |
| Writing or changing a test                                                               | `/engineering` · `/qa`                  | QM-1 is 100% lines and branches; the agents reach `engineering-unit-testing`, `engineering-integration-testing` and `qa-test-design`, where the traps are recorded |
| Reviewing a diff before merge                                                            | `/engineering`                          | Nothing else here covers code review; the agent reaches `engineering-code-reviewer`                                                                                |
| Acting on review feedback, a bug report or a comment thread                              | `/engineering`                          | The agent reaches `engineering-receiving-review`; an item that adds scope goes back through `/plan-gate`                                                           |
| Touching CI, deployment, infrastructure or secrets                                       | `/devops`                               | QM-4, QM-16, QM-18 and ADR-012 all constrain this and are easy to breach by habit                                                                                  |
| Writing or fixing documentation                                                          | `/docs`                                 | QM-11, Rule 29 and Rule 37 all apply and each has caught a real mistake                                                                                            |
| Writing a framework call — a Next.js hook, an Expo API, a Detox matcher, a Prisma option | `/engineering`                          | The agent reaches `engineering-source-verification`; every entry in §Never below was found by writing it from memory first                                         |
| Unsure what step comes next, or picking up work someone else started                     | `workflow-sequence` skill               | Domain filing answers who does the work and not what follows it; a guessed order is how a gate gets skipped                                                        |
| A `NEEDS_ESCALATION` item nobody has decided                                             | `decision-elicitation` skill            | The AWAITING_DECISION protocol blocks well and says nothing about how the answer gets obtained; a batch of questions comes back thin or not at all                 |
| Keeping or reverting a change made to run faster                                         | `/qa`                                   | The agent reaches `qa-performance-verification`; a result inside run-to-run variance is a revert, and unmeasured wins are how neutral complexity lands             |
| A defect with a stack trace or a failing test                                            | `/engineering`                          | Fixing the symptom is the default failure mode; the agent reaches `engineering-debugging`                                                                          |
| Judging readiness, or hunting defects rather than fixing a known one                     | `/qa`                                   | Phase 19, the QM-6 budgets and the QM-14 SLOs are the numbers; improvised testing measures against none of them                                                    |

**A `/verify` or a push-check that was not run is not a check.** Report what you
actually ran, with its output — never "looks good", never "should pass".

---

## All other rules

Rules 1–41 are defined in:

- `context/00_master_construction_os.md` — Rules 1–40 (authoritative)
- `context.md` — Rules 26–41 (agent-optimized form)
- `.claude/rules/rule-41-doubt-driven.md` — Rule 41, which is **not** in the master: it was
  written on 2026-09-03 rather than moved, so that file is its authority

`.claude/rules/rationalization-guard.md` is not one of them. It is not a rule to obey; it lists the sentences that
precede a skipped Rule 36 or Rule 38, so that meeting one in your own reasoning is recognisable as the signal to run the
gate. It loads in every session for that reason.

All rules apply to every task. Rules 36 and 38 are repeated here because they are
the two gates most likely to be skipped under time pressure.
