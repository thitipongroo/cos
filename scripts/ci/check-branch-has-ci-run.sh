#!/usr/bin/env bash
# Guard: the tip of every protected-in-practice branch must have a CI workflow run.
#
# WHY THIS EXISTS
#   On 2026-08-06 two pushes landed on `develop` — 8857bb1 (21:29Z) and 094b6c7 (21:58Z) — and
#   GitHub created ZERO workflow runs for either, across every workflow. Both were the head of their
#   own push event, so this was not the normal "a push creates one run, for its head commit"
#   behaviour. `8857bb1` left 16 Markdown files failing `format:check`; nobody found out until an
#   unrelated push on 2026-08-07 finally triggered a build and the Lint job went red.
#
#   The root cause was never established. Ruled out with evidence at the time: the workflow files
#   were valid YAML at both commits and neither commit touched `.github/`; Actions was enabled
#   (`allowed_actions: all`) with every workflow `active`; the repository is public, so Actions
#   minutes are not metered. What remains — a GitHub-side incident, or a repository setting changed
#   and reverted — cannot be checked after the fact.
#
#   So this script does not try to prevent the cause. It makes the SYMPTOM loud: if the tip of a
#   branch has no CI run, say so within a day instead of within a week.
#
# THE INVARIANT, precisely
#   NOT "every commit has a run" — that is false by design. GitHub creates one run per push, for the
#   push's head commit only. de80f80, e87ef89 and 24bf680 legitimately have zero runs: all three
#   arrived in the same push as 5e33eb3, which has the run. Checking every commit would cry wolf on
#   every multi-commit push.
#
#   The invariant that holds is: THE TIP of a branch must have a run. Whatever else is in the push,
#   the tip is always what GitHub builds — so a tip with no run means no run happened at all.
#
# Usage: ./scripts/ci/check-branch-has-ci-run.sh [branch ...]     (default: develop main)
# Exit:  0 = every branch tip has a run (or is within the grace period), 1 = at least one has none

set -euo pipefail

BRANCHES=("$@")
[[ ${#BRANCHES[@]} -eq 0 ]] && BRANCHES=(develop main)

# A run is created a few seconds after a push, and this may execute mid-push. Don't report a tip
# that is younger than this.
GRACE_MINUTES=15

command -v gh >/dev/null || {
  echo "gh CLI not available — cannot query workflow runs"
  exit 1
}

FAIL=0
echo "==> CI coverage guard — every branch tip must have a workflow run"
echo ""

for BRANCH in "${BRANCHES[@]}"; do
  TIP="$(gh api "repos/:owner/:repo/branches/$BRANCH" --jq '.commit.sha' 2>/dev/null || true)"
  if [[ -z "$TIP" ]]; then
    echo "  - $BRANCH — branch does not exist; skipping"
    continue
  fi

  RUNS="$(gh api "repos/:owner/:repo/actions/runs?head_sha=$TIP" --jq '.total_count' 2>/dev/null || echo 0)"
  SHORT="${TIP:0:7}"

  if [[ "$RUNS" -gt 0 ]]; then
    echo "  ✓ $BRANCH — tip $SHORT has $RUNS run(s)"
    continue
  fi

  # No run. Young enough that one may still be on its way?
  COMMITTED="$(gh api "repos/:owner/:repo/commits/$TIP" --jq '.commit.committer.date' 2>/dev/null || true)"
  if [[ -n "$COMMITTED" ]]; then
    AGE_MIN=$((($(date -u +%s) - $(date -u -d "$COMMITTED" +%s)) / 60))
    if [[ "$AGE_MIN" -lt "$GRACE_MINUTES" ]]; then
      echo "  - $BRANCH — tip $SHORT has no run yet, but is only ${AGE_MIN}m old (grace ${GRACE_MINUTES}m)"
      continue
    fi
    echo "  ✗ $BRANCH — tip $SHORT has NO workflow run and is ${AGE_MIN}m old"
  else
    echo "  ✗ $BRANCH — tip $SHORT has NO workflow run (commit date unavailable)"
  fi

  echo "      Nothing has verified this commit. Re-run CI on it before trusting the branch:"
  echo "      gh workflow run CI --ref $BRANCH"
  FAIL=$((FAIL + 1))
done

echo ""
if [[ $FAIL -gt 0 ]]; then
  echo "FAILED — $FAIL branch tip(s) with no CI run"
  exit 1
fi
echo "PASSED — every branch tip has a workflow run"
exit 0
