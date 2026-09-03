---
name: workspace-isolation
description: Establish an isolated workspace before starting feature work — detect the isolation you already have, choose a branch or a worktree deliberately, then prove the baseline is clean. Use before the first commit of any multi-step change.
allowed-tools:
  - "Read"
  - "Glob"
  - "Grep"
  - "Bash"
---

# Workspace Isolation

Work that changes more than one file needs somewhere to fail safely. This skill decides where, before the first edit —
not after a half-finished change is sitting on a shared branch.

## Step 1 — Detect what you already have

Check before creating anything. Harness-created isolation is invisible to inspection.

```bash
git rev-parse --show-toplevel
git branch --show-current
git status --porcelain | head
GIT_DIR=$(cd "$(git rev-parse --git-dir)" && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" && pwd -P)
```

`GIT_DIR != GIT_COMMON` means you are already in a linked worktree — or in a submodule. Rule out the submodule before
concluding anything:

```bash
git rev-parse --show-superproject-working-tree 2>/dev/null
```

A path back means submodule; treat it as a normal checkout. Already isolated means skip to Step 3. Do not nest a
worktree inside a worktree.

If the working tree is dirty, stop and say so. Uncommitted work belonging to someone else is not yours to branch away
from or to carry into a new change.

## Step 2 — Choose the mechanism, and say which

Three options, in order of preference:

1. **A native worktree tool** the harness provides — a `EnterWorktree` tool, a `/worktree` command, a `--worktree`
   flag. If one exists, use it. It owns placement, branch creation and cleanup; creating a worktree by hand beside it
   leaves state the harness cannot see or remove.
2. **A branch on the current checkout** — the default when there is no native tool. Cheapest, and it reuses the
   installed dependencies and build cache already present.
3. **A manual `git worktree`** — only when the work genuinely needs two trees at once: comparing behaviour across
   branches, or a long-running change that must not block a hotfix.

Option 3 has a real cost in a package-managed monorepo: a new worktree has no installed dependencies and no build cache,
so it pays a full install and a cold build before the first test runs. Choose it because the work needs two trees, not
because isolation sounds safer.

Name the option you chose and why, in one sentence, before acting on it.

### If you create a worktree by hand

The directory must be ignored before the worktree is created, or the entire tree gets committed into the repository:

```bash
git check-ignore -q .worktrees || echo "NOT IGNORED — add to .gitignore and commit that first"
git worktree add ".worktrees/<branch>" -b "<branch>"
```

If `git worktree add` fails on permissions, the sandbox refused it. Say so and work in place rather than retrying.

## Step 3 — Install, then prove the baseline

Install dependencies for the mechanism you chose, then run the test suite **before** making any change.

A baseline that was not run makes every later failure ambiguous: you cannot tell your break from the one that was
already there. If the baseline is red, report which tests fail and ask whether to proceed — that call is the product
owner's, not yours.

Report when ready:

```text
Workspace: <path> on <branch> (<mechanism>)
Baseline: <N> passed, <M> failed
```

## Common rationalizations

| Excuse | Reality |
| --- | --- |
| "Obviously not in a worktree, no need to check" | Harness isolation and submodules both fool inspection. The commands settle it in two seconds. |
| "`git worktree add` is faster than finding the native tool" | The native tool owns cleanup. A hand-made worktree beside it becomes state nobody removes. |
| "The worktree directory is surely ignored" | Run `git check-ignore`. An unignored worktree commits the whole tree. |
| "The tree is fresh, baseline tests can wait" | Then the first red run is unattributable. Run it now. |
| "The baseline is red but unrelated to my change" | Say that to the product owner and let them decide. Deciding it yourself is how a pre-existing failure becomes yours. |
| "I will branch after I see whether the change works" | The change that "works" is the one you then have to move off a shared branch by hand. |

## In this repository

`develop` is the integration branch and `main` is released; branch from `develop` unless the task says otherwise.
Existing agent work uses `claude/<topic>` branch names.

This is a pnpm + turbo monorepo. Install with `pnpm install` and take the baseline with `pnpm test` — or the narrower
`turbo run test --filter=<package>` when the change is confined to one package and the full suite is not the useful
signal. There is no `.worktrees/` directory here and it is not in `.gitignore`; creating one means adding the ignore
entry and committing it first, in its own commit.

Rule 38 still comes before the first line of code: an isolated workspace is where the approved plan gets implemented,
not a substitute for having one. Set up the workspace, then run `/plan-gate`.

Method adapted from the `using-git-worktrees` skill in obra/superpowers (MIT). The mechanism ordering and the
repository-specific paragraphs above are this project's.
