#!/usr/bin/env bash
# Rule 38: Before writing source files, require PO approval when an implementation is pending.
# Fires on PreToolUse Write|Edit for .ts/.tsx/.sql files.
# Flow:
#   1. Agent writes .claude/impl-pending.md with tagged todo list
#   2. PO creates .claude/impl-approved to approve
#   3. This hook blocks source writes until .claude/impl-approved approves THAT plan
#   4. After phase complete, delete both files for the next phase
#
# IMPORTANT: Only the product owner should create .claude/impl-approved.
# The agent must NOT create this file — doing so defeats the human gate.
#
# ── THE MARKER MUST NAME THE PLAN IT APPROVED (added 2026-09-08, PO decision) ────────────────────
#
# Until this date the check was `[[ -f "$APPROVED" ]]` and nothing else. A file whose PRESENCE alone
# opens the gate cannot say WHICH plan it opened it for, so a marker outlived its plan three rounds
# running and the gate was open for a list nobody had read:
#
#   .claude/impl-approved created 2026-09-04 23:56  →  still open for the 2026-09-07 plan
#   the same marker, or its successor of 2026-09-08 01:21  →  still open for the plan written that
#                                                             afternoon, which the PO had not seen
#
# Both archived plans carry a warning paragraph about it in their own headers. Prose did not fix it
# and was never going to: the agent wrote the warning, and the agent is the party the gate exists to
# stop. So the binding is now mechanical, and it fails CLOSED in every ambiguous case.
#
# TWO WAYS TO APPROVE, and the weaker one is still the documented gesture:
#
#   touch .claude/impl-approved
#       An empty marker. Accepted, and checked by TIME: the marker must be at least as new as
#       .claude/impl-pending.md. A marker created before the plan it supposedly approves did not
#       approve it. This is what catches every case above, and it keeps `touch` — the gesture
#       CLAUDE.md, the plan-gate skill and .gitignore all document — working unchanged.
#
#   sha256sum .claude/impl-pending.md | cut -d ' ' -f 1 > .claude/impl-approved
#       A marker naming the exact plan. Checked by CONTENT, and content beats time: the plan may be
#       re-saved, reformatted or have its boxes ticked afterwards without re-approval being needed,
#       as long as the words did not change. Edit the plan and the hash stops matching, which is the
#       correct answer — an edited plan is not the plan that was approved.
#
# WHY NOT REQUIRE THE HASH. It would change what a human has to type to approve, in three documented
# places, to catch one case the time rule already catches. The hash is offered for anyone who wants
# the exact binding; the time rule is what makes the default gesture safe.

source "$(dirname "${BASH_SOURCE[0]}")/lib/hook-input.sh"
hook_init PreToolUse deny
hook_read_input
FILE_PATH="$HOOK_FILE_PATH"

# Only block source file writes (.ts, .tsx, .sql)
[[ "$FILE_PATH" =~ \.(ts|tsx|sql)$ ]] || exit 0

# Skip test files, declarations, node_modules, .claude/ itself
[[ "$FILE_PATH" =~ (__tests__|\.spec\.|\.test\.|\.d\.ts|node_modules|\.claude/) ]] && exit 0

# CLAUDE_PROJECT_DIR, not `pwd`. The hook does not choose its own working directory, and the two
# markers live at a fixed place in the project. Resolved against the wrong root, both files are
# absent, the `-f "$PENDING"` test below exits 0 and the gate silently passes — the exact
# fail-open shape .claude/hooks/lib/hook-input.sh was written to remove.
PROJECT_DIR="$(hook_project_dir)"
PENDING="$PROJECT_DIR/.claude/impl-pending.md"
APPROVED="$PROJECT_DIR/.claude/impl-approved"

deny() {
  # Reason text carries no double quotes and no backslashes — see hook-input.sh, it is interpolated
  # into JSON without an escaper.
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}' "$1"
  exit 0
}

# Only enforce when an implementation is explicitly pending
[[ -f "$PENDING" ]] || exit 0

# If pending exists but approved does not → block
if [[ ! -f "$APPROVED" ]]; then
  deny 'Rule 38: .claude/impl-pending.md exists but .claude/impl-approved has not been created. Present .claude/impl-pending.md to the product owner and wait for them to create .claude/impl-approved before writing source code.'
fi

# The marker names a plan: its first token must be the plan's SHA-256.
CLAIM="$(tr -d '[:space:]' <"$APPROVED" 2>/dev/null | head -c 64)"

if [[ -n "$CLAIM" ]]; then
  HASHER=""
  command -v sha256sum >/dev/null 2>&1 && HASHER="sha256sum"
  [[ -z "$HASHER" ]] && command -v shasum >/dev/null 2>&1 && HASHER="shasum -a 256"
  # A marker that claims a plan we cannot verify is worse than no claim, so this refuses rather than
  # falling back to the time rule — falling back would let a wrong hash pass on any machine without
  # a hasher, which is the silent pass this whole change is about.
  [[ -z "$HASHER" ]] && hook_fail "the marker .claude/impl-approved names a plan hash but neither sha256sum nor shasum is on PATH, so it cannot be checked"

  ACTUAL="$($HASHER "$PENDING" 2>/dev/null | cut -d ' ' -f 1)"
  [[ -z "$ACTUAL" ]] && hook_fail "the plan .claude/impl-pending.md could not be hashed"

  if [[ "$CLAIM" != "$ACTUAL" ]]; then
    deny 'Rule 38: .claude/impl-approved names a different plan than the one in .claude/impl-pending.md. The marker approved some earlier version or some earlier round; the plan on disk now has not been approved. Present the current plan to the product owner and ask them to re-approve it.'
  fi
  exit 0
fi

# An empty marker approves by TIME. Older than the plan means it cannot have approved it.
if [[ "$APPROVED" -ot "$PENDING" ]]; then
  deny 'Rule 38: .claude/impl-approved is older than .claude/impl-pending.md, so it approved an earlier plan and not this one. This is the stale-marker case that left the gate open for three rounds. Present the current plan to the product owner and ask them to remove the old marker and create a new one.'
fi

exit 0
