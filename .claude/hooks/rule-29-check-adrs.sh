#!/usr/bin/env bash
# Rule 29: Before writing content that references (see ADR-NNN), verify the ADR file exists.
# Fires on PreToolUse Write|Edit for any file.
# Blocks if any referenced ADR-NNN does not have a matching file in docs/architecture/adr/.

source "$(dirname "${BASH_SOURCE[0]}")/lib/hook-input.sh"
hook_init PreToolUse deny
hook_read_input
CONTENT="$HOOK_CONTENT"

[[ -z "$CONTENT" ]] && exit 0

ADR_DIR="$(pwd)/docs/architecture/adr"
[[ -d "$ADR_DIR" ]] || exit 0

MISSING=()
while IFS= read -r adr_ref; do
  # Extract the number, zero-pad to 3 digits
  NUM=$(printf '%s' "$adr_ref" | grep -oE '[0-9]+')
  PADDED=$(printf '%03d' "$((10#$NUM))")
  if ! ls "$ADR_DIR/${PADDED}"*.md >/dev/null 2>&1; then
    MISSING+=("ADR-${NUM}")
  fi
done < <(printf '%s' "$CONTENT" | grep -oE 'ADR-[0-9]+' | sort -u)

if [[ ${#MISSING[@]} -gt 0 ]]; then
  LIST=$(IFS=', '; echo "${MISSING[*]}")
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Rule 29: [%s] referenced but file(s) not found in docs/architecture/adr/ — create the ADR first."}}' \
    "$LIST"
fi
exit 0
