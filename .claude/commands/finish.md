---
description: Finish a branch — prove the suite is green, present merge / pull request / keep to the product owner, carry out the answer, clean up only what was created here
argument-hint: [branch name, or blank for the current branch]
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash
  - Skill
---

# Finish

Target: `$ARGUMENTS` (defaults to the current branch)

Integration is a decision, and it is the product owner's. This command gets the
branch into a state where that decision can be made, presents it, and carries out
the answer.

## Step 1 — Follow the skill

Invoke the `branch-completion` skill and carry it out as written. It holds the
green-suite precondition, the environment detection, the exact option list, and
the cleanup rules. This command does not restate them.

## Step 2 — Two things this repository adds

Before any push, run `bash scripts/ci/verify-before-push.sh` and report what it
printed — including the jobs it says it did not cover. Nothing runs it for you:
`.husky/pre-push` was removed on 2026-09-04 by product-owner decision, so this
line is now the only thing standing between an unverified tree and the remote.
There is no `SKIP_PREPUSH` to reach for and nothing to override — which also means
there is no hook to blame when a push goes out unverified.

Before a local merge, check `bash scripts/ci/check-branch-has-ci-run.sh` — a
branch can reach a merge without CI having run on it at all.

## Step 3 — Close under Rule 36

A green suite is one obligation, not the list. Run `/verify` and show the command
output per obligation before the branch is described as finished, and report the
state of `.claude/impl-pending.md` and `.claude/impl-approved` — leaving both in
place is what leaves the Rule 38 gate permanently open.

## The one thing never to infer

Discarding work is not on the option list and is never offered. It happens only
when the product owner asks for it in those words, and only after the typed
confirmation the skill requires.
