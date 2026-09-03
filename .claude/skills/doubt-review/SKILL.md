---
name: doubt-review
description: Cross-examine a non-trivial decision with a fresh-context reviewer prompted to disprove it, before it stands or is committed. Use when you feel confident but are not certain — a migration that must be reversible, a Kafka contract, a permission check, a retry path — or when the claim asserts that something is idempotent, correctly ordered, or holds an invariant no type can check.
allowed-tools:
  - "Read"
  - "Glob"
  - "Grep"
  - "Bash"
  - "Task"
---

# Doubt Review

A confident answer is not a correct one. A long session turns its own assumptions into facts without
anyone noticing, and the author is the last person able to see it happen.

This is the method behind `/doubt` and Rule 41. Prefer the command: it carries the report format and
the cycle count. Use the skill directly only when the review is one step inside a longer piece of
work.

## When it applies

A decision is non-trivial when it asserts a property no compiler can check, crosses a module or
service boundary, cannot be reversed on its own, or depends on context the diff does not show. See
`.claude/rules/rule-41-doubt-driven.md` for the full list — that file is the authority.

## The five steps

1. **CLAIM** — write what is being asserted, in two or three lines, and what breaks if it is false
2. **EXTRACT** — artefact plus contract, both small, with your reasoning stripped out
3. **DOUBT** — one fresh-context reviewer, adversarial prompt, **artefact and contract only**
4. **RECONCILE** — classify each finding yourself: contract misread, actionable, trade-off, noise
5. **STOP** — trivial findings, three cycles, or the product owner says ship

## The two things that make it work

**The prompt is adversarial.** "Find what is wrong with this" and "is this good?" produce different
reviews of the same artefact. Ask for issues, and say explicitly not to validate and not to
summarize.

**The claim is withheld.** The reviewer must decide for itself whether the artefact satisfies the
contract. Give it your conclusion and you will get your conclusion back.

## Never from inside a persona

Step 3 spawns a subagent. A persona that does this spawns a second persona — forbidden by
`agent-team/PATTERNS.md`, and blocked by the runtime regardless. This skill therefore appears in no
agent's routing table, and must not be added to one. If you find yourself here inside a subagent,
report that the review cannot run nested and return the decision to the main session.

## This project decides it

Rule 41 in `context.md` §GLOBAL EXECUTION RULES defines what is non-trivial here and which paths
load the rule automatically. The contract in step 2 is never invented: it comes from the Quality
Mandate, the `.avsc`, the OpenAPI document, or the Phase file that already governs the surface.

If you settle a threshold or a procedure while using this skill, record it in `context.md` under a
Quality Mandate or a Rule — not here. A decision left in a skill file is invisible to Phase 19, to
the hooks, and to anyone reading the mandates.
