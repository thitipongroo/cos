#!/usr/bin/env bash
# Rule 37: After modifying docs/specifications/, grep context files for the changed keyword.
# Fires on PostToolUse Write|Edit for docs/specifications/** files.
# Injects grep results as additionalContext — agent must verify consistency before proceeding.

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

[[ "$FILE_PATH" == *"docs/specifications/"* ]] || exit 0

# Extract keywords to search: section numbers (§N.N), tech names from filename
FILENAME=$(basename "$FILE_PATH" .md)
# Build keyword list from filename words (e.g. "05-security-compliance" → "security", "compliance")
KEYWORDS=$(echo "$FILENAME" | tr '-' '\n' | grep -vE '^[0-9]+$' | head -5 | tr '\n' '|' | sed 's/|$//')
[[ -z "$KEYWORDS" ]] && exit 0

CONTEXT_MD="$(pwd)/context.md"
# The whole of context/, not just 00_master: on 2026-09-02 the 25 Phase command
# blocks moved to context/phases/, so a hook that greps only 00_master would be
# blind to 83% of what it used to cover.
CONTEXT_DIR="$(pwd)/context"
# .claude/rules/ holds the Quality Mandates, the path-triggered Rules and the
# master's four cross-cutting specifications, moved there the same day. Those files
# are what the agent actually sees during work, so a spec change that updates
# context.md and leaves a rule file behind makes the stale copy authoritative in
# practice.
RULES_DIR="$(pwd)/.claude/rules"

FINDINGS=""

if [[ -f "$CONTEXT_MD" ]]; then
  MATCHES=$(grep -inE "$KEYWORDS" "$CONTEXT_MD" 2>/dev/null | head -5)
  [[ -n "$MATCHES" ]] && FINDINGS="${FINDINGS}context.md:\n${MATCHES}\n"
fi

for d in "$CONTEXT_DIR" "$RULES_DIR"; do
  [[ -d "$d" ]] || continue
  label="${d#"$(pwd)/"}/"
  MATCHES=$(grep -rinE "$KEYWORDS" "$d" 2>/dev/null | head -5)
  [[ -n "$MATCHES" ]] && FINDINGS="${FINDINGS}${label}\n${MATCHES}\n"
done

if [[ -n "$FINDINGS" ]]; then
  # Escape for JSON
  SAFE=$(printf '%s' "$FINDINGS" | tr '"' "'" | tr '\n' ' ')
  printf '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"Rule 37: %s was modified. Grep found these matches in context files — verify consistency and update in the same commit if needed: %s"}}' \
    "$FILE_PATH" "$SAFE"
fi
exit 0
