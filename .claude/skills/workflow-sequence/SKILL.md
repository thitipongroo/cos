---
name: workflow-sequence
description: The order work moves through this repository — which command comes before which, where the three gates sit, and which skill hands off to which. Use when you know what to do but not what comes next, when picking up work someone else started, or to check the order and see which gates a change must not skip.
allowed-tools:
  - "Read"
  - "Glob"
  - "Grep"
---

# Workflow Sequence

The skills here are filed by domain, because that is how the Quality Mandates and the routing agents
are organised. Domain answers *who does this*. It does not answer *what comes next*, and nothing in
this repository answered that until this file.

**Everything below is transcribed from somewhere else, with the source named.** Where the repository
records no order, this file says so rather than inventing one — an invented sequence is worse than no
sequence, because it will be followed.

## The spine

The order in the `CLAUDE.md` §When to invoke what table, which is itself ordered by when each step
happens:

```text
  /workspace ──→ /plan-gate ──→ ( work ) ──→ /verify ──→ verify-before-push.sh ──→ /finish
                     │              │            │
                  RULE 38        RULE 41      RULE 36
                 human gate     in flight    evidence gate
```

| Step                          | When                                                 | Gate                                      |
| ----------------------------- | ---------------------------------------------------- | ----------------------------------------- |
| `/workspace`                  | before the first edit of a multi-step change         | —                                         |
| `/plan-gate`                  | before the first line of code                        | **Rule 38** — product owner approval      |
| `/doubt`                      | before a non-trivial decision stands                 | **Rule 41** — adversarial review          |
| `/verify`                     | before reporting anything complete                   | **Rule 36** — one command per obligation  |
| `bash scripts/ci/verify-before-push.sh` | before every `git push`                    | mirrors the ci.yml jobs that run locally  |
| `/finish`                     | when the branch becomes a merge, a PR, or nothing    | the integration decision is the owner's   |

The work in the middle is dispatched by domain, not by position: `/engineering`, `/qa`, `/devops`,
`/docs`. Which one is a question about the task, not about how far along it is — that is why this
repository files skills by domain and why this file does not renumber them.

Three properties of the spine that are easy to lose:

- **Rule 38 and Rule 36 are bookends, not a pair of reviews.** One gates the plan, the other gates the
  claim of completion. Rule 41 is the only thing between them.
- **Only Rule 38 is a human gate.** `/doubt` and `/verify` produce evidence; they do not grant
  permission. Neither substitutes for the product owner's approval.
- **`/verify` and `verify-before-push.sh` are different claims.** The first says each obligation has
  filesystem evidence. The second says the CI jobs that can run locally would pass. Neither implies
  the other.

## Handoffs the skills themselves record

Transcribed verbatim from the skill files. These are the only skill-level edges written down.

| From                           | To                              | What the source says                                                                 |
| ------------------------------ | ------------------------------- | ------------------------------------------------------------------------------------ |
| `workspace-isolation`          | `/plan-gate`                    | "Set up the workspace, then run `/plan-gate`."                                        |
| `decision-elicitation`         | `/plan-gate`                    | "Then return to `/plan-gate` and re-tag the item `READY`."                            |
| `doubt-review`                 | `/doubt`                        | "This is the method behind `/doubt` and Rule 41. Prefer the command."                 |
| `engineering-receiving-review` | `/plan-gate`                    | a review item that adds scope "goes back through `/plan-gate`"                        |
| `engineering-receiving-review` | `/verify`                       | "Before reporting the items fixed, `/verify` applies as it does to any completion claim" |
| `engineering-receiving-review` | `engineering-code-reviewer`     | "When the review is a diff review you are performing rather than receiving"           |
| `branch-completion`            | `verify-before-push.sh`         | "**Before any push**, run `bash scripts/ci/verify-before-push.sh` and report its output" |
| `branch-completion`            | `/verify`                       | "completion is a claim about the filesystem, so run `/verify`"                        |
| `qa-performance-verification`  | `qa-performance-testing` · `qa-load-testing` | a boundary, not an order: those find the bottleneck, this decides whether the fix earns keeping |

`scripts/ci/check-skill-routing.mjs` proves every skill named above still exists. A rename that
leaves this table pointing at nothing fails the Lint job.

## What is NOT recorded — do not infer it

**There is no written order among the skills inside a domain.** Nothing says whether
`qa-test-design` precedes `qa-automation-testing`, or where `engineering-refactoring` sits relative to
`engineering-code-reviewer`. That is deliberate as far as this file can tell: the routing agents pick
per task, from the task, and their tables are keyed on "use when", not on position.

So: if you are here looking for what follows a domain skill and the table above does not have it,
**the answer is that this repository has not decided it.** Choose from the task, say which skill you
chose and why — the routing agents require that sentence anyway — and do not treat a plausible order
as a documented one.

**The `context/phases/` files are a different lifecycle.** Phase 01–25 are the order the *product*
gets built. The spine above is the order a *change* gets made. Every Phase runs the whole spine; the
spine runs inside every Phase. Use `phase-index` for the first, this file for the second, and keep
the word "Phase" for the first — it already means that everywhere else here.

## Adding an edge

An edge belongs in the skill that owns the handoff, not here first:

1. Write the sentence in the source skill's own file, in its own words
2. Add the row above, quoting it
3. Run `node scripts/ci/check-skill-routing.mjs` — it fails if the row names a skill that does not exist

Adding a row here without step 1 makes this file the only place the handoff exists, which is how an
index drifts from what it indexes.

## This project decides it

The spine is `CLAUDE.md` §When to invoke what and the Rules in `context.md` §GLOBAL EXECUTION RULES —
both authoritative over this file. The handoff table is a transcription; if a quoted sentence and its
source ever disagree, the source wins and the row is the bug.

This file records order. It grants nothing: Rule 38 still needs the product owner, Rule 36 still needs
command output, and no amount of knowing what comes next substitutes for either.
