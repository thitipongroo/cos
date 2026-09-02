#!/usr/bin/env bash
# markdownlint over the Markdown this branch changed — the local mirror of ci.yml's
# "markdownlint (changed Markdown only)" step.
#
# WHY THIS EXISTS. `verify-before-push.sh` claims every command in it is copied from ci.yml. It was
# not: the Lint job's markdownlint, yamllint, sqlfluff, ruff and terraform steps had no local
# counterpart, so the gate reported a green Lint job while CI's Lint job failed on the very next
# push. On 2026-09-03 that cost a red build with 241 markdownlint errors across 74 files — a
# backlog that existed for weeks and only surfaced when those files entered a changed-file set.
#
# WHY A SEPARATE SCRIPT. The CI step is eight lines of shell that pick a base commit and build a
# pathspec. Inlining that into verify-before-push.sh would put the interesting part of a gate inside
# a one-line runner and make the two copies drift silently, which is the same failure again.
#
# THE BASE COMMIT is the one thing that cannot be mirrored exactly. CI knows the push range
# (`github.event.before`) or the PR base; before a push, neither exists. `@{upstream}` is the honest
# local equivalent — what the remote already has — and it degrades to the merge-base with the
# default branch when the branch has no upstream yet.
#
# markdownlint lints the WHOLE changed file, not the changed lines, so touching one line of a
# legacy document means tidying that document. The four excluded trees carry a backlog too large to
# clear (~101k violations); everything else must be clean. Keep this list identical to the pathspec
# in ci.yml — they are two copies of one decision.

set -uo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo .)"
cd "$ROOT"

echo "==> markdownlint (changed Markdown only)"

if base="$(git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null)"; then
  echo "  base: $base (the branch's upstream — what the remote already has)"
else
  for candidate in origin/main origin/master main master; do
    if git rev-parse --verify --quiet "$candidate" >/dev/null; then
      base="$(git merge-base HEAD "$candidate" 2>/dev/null)" && break
    fi
  done
  if [[ -z "${base:-}" ]]; then
    echo "  ✗ no upstream and no default branch to compare against — cannot determine the changed set."
    echo "    Set an upstream (git push -u) or lint explicitly with: pnpm exec markdownlint-cli2 <files>"
    exit 1
  fi
  echo "  base: $base (merge-base with the default branch — this branch has no upstream yet)"
fi

mapfile -t changed < <(
  git diff --name-only --diff-filter=ACMR "$base" HEAD -- '*.md' \
    ':(exclude)context.md' ':(exclude)context/**' ':(exclude)docs/specifications/**' \
    ':(exclude)mockup/**' 2>/dev/null
)

# Uncommitted work is what a pre-push check is usually asked about, and a file edited but not yet
# committed is still going to reach CI on the next commit. Include it.
mapfile -t -O "${#changed[@]}" changed < <(
  git diff --name-only --diff-filter=ACMR HEAD -- '*.md' \
    ':(exclude)context.md' ':(exclude)context/**' ':(exclude)docs/specifications/**' \
    ':(exclude)mockup/**' 2>/dev/null
)

mapfile -t changed < <(printf '%s\n' "${changed[@]}" | sort -u | grep -v '^$' || true)

if [[ ${#changed[@]} -eq 0 ]]; then
  echo "  - no changed (non-legacy) Markdown files — nothing to lint"
  exit 0
fi

echo "  ${#changed[@]} changed Markdown file(s)"
pnpm exec markdownlint-cli2 "${changed[@]}"
