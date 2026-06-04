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
MASTER_MD="$(pwd)/context/00_master_construction_os.md"

FINDINGS=""
for f in "$CONTEXT_MD" "$MASTER_MD"; do
  [[ -f "$f" ]] || continue
  MATCHES=$(grep -inE "$KEYWORDS" "$f" 2>/dev/null | head -5)
  if [[ -n "$MATCHES" ]]; then
    FINDINGS="${FINDINGS}$(basename "$f"):\n${MATCHES}\n"
  fi
done

if [[ -n "$FINDINGS" ]]; then
  # Escape for JSON
  SAFE=$(printf '%s' "$FINDINGS" | tr '"' "'" | tr '\n' ' ')
  printf '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"Rule 37: %s was modified. Grep found these matches in context files — verify consistency and update in the same commit if needed: %s"}}' \
    "$FILE_PATH" "$SAFE"
fi
exit 0
