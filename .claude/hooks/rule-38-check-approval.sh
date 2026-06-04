#!/usr/bin/env bash
# Rule 38: Before writing source files, require PO approval when an implementation is pending.
# Fires on PreToolUse Write|Edit for .ts/.tsx/.sql files.
# Flow:
#   1. Agent writes .claude/impl-pending.md with tagged todo list
#   2. PO creates .claude/impl-approved to approve
#   3. This hook blocks source writes until .claude/impl-approved exists
#   4. After phase complete, delete both files for the next phase
#
# IMPORTANT: Only the product owner should create .claude/impl-approved.
# The agent must NOT create this file — doing so defeats the human gate.

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Only block source file writes (.ts, .tsx, .sql)
[[ "$FILE_PATH" =~ \.(ts|tsx|sql)$ ]] || exit 0

# Skip test files, declarations, node_modules, .claude/ itself
[[ "$FILE_PATH" =~ (__tests__|\.spec\.|\.test\.|\.d\.ts|node_modules|\.claude/) ]] && exit 0

PENDING="$(pwd)/.claude/impl-pending.md"
APPROVED="$(pwd)/.claude/impl-approved"

# Only enforce when an implementation is explicitly pending
[[ -f "$PENDING" ]] || exit 0

# If pending exists but approved does not → block
if [[ ! -f "$APPROVED" ]]; then
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Rule 38: .claude/impl-pending.md exists but .claude/impl-approved has not been created. Present .claude/impl-pending.md to the product owner and wait for them to create .claude/impl-approved before writing source code."}}'
fi
exit 0
