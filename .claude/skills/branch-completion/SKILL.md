---
name: branch-completion
description: Decide how finished work gets integrated — prove the suite is green, present the options, execute the one chosen, then clean up. Use when implementation is complete and the branch needs to become a merge, a pull request, or nothing yet.
allowed-tools:
  - "Read"
  - "Glob"
  - "Grep"
  - "Bash"
---

# Branch Completion

Integration is a decision, not a step. This skill gets the branch into a state where the decision can be made, presents
it, and carries out the answer.

## Step 1 — Prove the suite is green

Run the full suite on the tree you are about to integrate, now. A green run earlier in the session proves only the tree
it ran on.

If anything fails, report the failures and stop. The options below come after a green suite, never instead of one.

## Step 2 — Establish where it goes

Two things must be known before any option is presented:

- **The base branch** — whatever this work forked from. If it is not stated in the plan or the branch's upstream, ask.
  Merging into the wrong base is expensive to undo.
- **The workspace kind** — a normal checkout, a named-branch worktree, or a detached HEAD:

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" && pwd -P)
WORKTREE_PATH=$(git rev-parse --show-toplevel)   # capture now; later steps change directory
```

A detached HEAD is externally managed: it cannot offer a local merge, and its workspace is not yours to remove.

## Step 3 — Present the options and wait

On a normal checkout or a named-branch worktree, present exactly these:

```text
Implementation complete, suite green.

1. Merge into <base> locally
2. Push and open a pull request
3. Keep the branch as it is

Which?
```

On a detached HEAD, present only options 2 and 3.

Present the list as written and wait for the answer. Do not infer the choice from the conversation, and do not add a
fourth option. Discarding the work is not on this menu — it happens only when it is asked for, in those words.

## Step 4 — Carry out the answer

**Merge locally.** Merge first, re-run the suite on the merged result, and only then delete anything. If the merged
result is red, stop and investigate: nothing has been pushed, so it is recoverable. When it is green, remove the
workspace before deleting the branch.

**Push and open a pull request.** Push the branch, open the request against the confirmed base, follow the repository's
pull request template, and report the URL. Keep the workspace — feedback gets fixed in it.

**Keep as it is.** Report the branch name and where the workspace is. Nothing is removed.

**Discard**, when explicitly asked: show what will be destroyed — branch, commit list, workspace path — and require the
word `discard` back before doing anything. "Get rid of it" is not that word.

## Step 5 — Clean up only what you created

Cleanup runs after a local merge and after a confirmed discard. It never runs after a pull request, and never after
"keep as it is".

Remove a worktree only if you created it and it sits under `.worktrees/` or `worktrees/`. Anything else belongs to the
host environment; leave it. Run the removal from outside the worktree, using the path captured in Step 2.

If removal is refused because the tree holds modified or untracked files, those files exist nowhere else. Never force
it. Show the list and ask whether to commit them, move them, or delete them.

## Common rationalizations

| Excuse | Reality |
| --- | --- |
| "The suite passed an hour ago" | It passed on that tree. Run it on this one. |
| "They obviously want it merged" | The integration decision is the product owner's. Present the list and wait. |
| "They seem finished — I will offer to discard it" | Discard is not on the menu. It happens only when asked for. |
| "'Yeah, drop it' is confirmation enough" | Only the typed word `discard` authorizes deletion. |
| "The pull request is open, the workspace is clutter" | Review feedback gets fixed there. It stays until the work lands. |
| "The merged result failure looks flaky" | A red merged result stops everything. Branch and workspace stay put. |
| "Removal was refused, `--force` finishes the job" | The refusal means files exist only there. Force destroys them. |
| "The push was rejected, force-push will fix it" | A rejected push means the remote moved. Investigate. |
| "This other stale worktree may as well go too" | Remove only what you created. |

## In this repository

The base is `develop` unless the task says otherwise; `main` is the released branch.

**Before any push**, run `bash scripts/ci/verify-before-push.sh` and report its output. `.husky/pre-push` runs it too,
and `SKIP_PREPUSH=1` exists for a docs-only branch, a revert or an outage — it is not the way past a failing test. The
script is honest about its own coverage: it prints the jobs it does not run and reports `SKIP` separately from `PASS`, so
a green run here is not a claim that CI is green. Report what it actually printed.

The suite in Step 1 is `pnpm test`; `pnpm type-check` and `pnpm lint` are part of what `verify-before-push.sh` covers.

Rule 36 governs Step 1 and the final report: completion is a claim about the filesystem, so run `/verify` and show the
command output per obligation before calling the branch finished. A green suite is one obligation among the list, not
the list.

`scripts/ci/check-branch-has-ci-run.sh` exists because a branch can be merged without CI having run on it. Check it
before a local merge.

Method adapted from the `finishing-a-development-branch` skill in obra/superpowers (MIT). The repository-specific
paragraphs above are this project's.
