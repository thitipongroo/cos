#!/usr/bin/env bash
# Rule 26: Before importing any package, verify it is in the file's own package.json.
# Fires on PreToolUse Write|Edit for .ts/.tsx files.
# Blocks if any non-relative import is missing from the nearest package.json.

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
CONTENT=$(echo "$INPUT" | jq -r '.tool_input.content // .tool_input.new_string // empty')

# Only .ts/.tsx — skip tests, declarations, node_modules
[[ "$FILE_PATH" =~ \.(ts|tsx)$ ]]         || exit 0
[[ "$FILE_PATH" =~ (node_modules|\.d\.ts) ]] && exit 0
[[ -z "$CONTENT" ]]                          && exit 0

# Resolve relative path to absolute
[[ "$FILE_PATH" != /* ]] && FILE_PATH="$(pwd)/$FILE_PATH"

# Walk up to find nearest package.json
PKG_JSON=""
DIR=$(dirname "$FILE_PATH")
while [[ "$DIR" != "/" && "$DIR" != "$(pwd)" ]]; do
  if [[ -f "$DIR/package.json" ]]; then
    PKG_JSON="$DIR/package.json"
    break
  fi
  DIR=$(dirname "$DIR")
done
# Fallback: root package.json
[[ -z "$PKG_JSON" && -f "package.json" ]] && PKG_JSON="package.json"
[[ -z "$PKG_JSON" ]] && exit 0

MISSING=()
while IFS= read -r pkg; do
  [[ -z "$pkg" ]] && continue
  # Normalize to top-level package name
  if [[ "$pkg" == @* ]]; then
    NAME=$(printf '%s' "$pkg" | cut -d/ -f1-2)
  else
    NAME=$(printf '%s' "$pkg" | cut -d/ -f1)
  fi
  # Check all dep fields
  if ! jq -e --arg n "$NAME" \
    '.dependencies[$n] // .devDependencies[$n] // .peerDependencies[$n] // .optionalDependencies[$n]' \
    "$PKG_JSON" >/dev/null 2>&1; then
    MISSING+=("$NAME")
  fi
done < <(
  printf '%s' "$CONTENT" \
    | grep -oE "from ['\"][^./][^'\"]+['\"]" \
    | grep -oE "['\"][^'\"]+['\"]" \
    | tr -d "'\"" \
    | sort -u
)

if [[ ${#MISSING[@]} -gt 0 ]]; then
  LIST=$(IFS=', '; echo "${MISSING[*]}")
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Rule 26: [%s] not found in %s — add to package.json before importing."}}' \
    "$LIST" "$PKG_JSON"
fi
exit 0
