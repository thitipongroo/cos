#!/usr/bin/env bash
# Rule 35: Every @cos/* package with executable logic must have jest.config.js and unit tests.
# Fires on PostToolUse Write|Edit for files inside packages/@cos/*/src/.
# Blocks if the package is missing jest.config.js or has no test files.

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Only care about packages/@cos/*/src/ files
[[ "$FILE_PATH" == *"packages/@cos/"* ]] || exit 0
[[ "$FILE_PATH" == *"/src/"* ]]           || exit 0
[[ "$FILE_PATH" == *"node_modules"* ]]    && exit 0

[[ "$FILE_PATH" != /* ]] && ABS="$(pwd)/$FILE_PATH" || ABS="$FILE_PATH"

# Find the package root: first ancestor dir that has package.json AND whose parent is @cos
PKG_ROOT=""
DIR=$(dirname "$ABS")
while [[ "$DIR" != "/" ]]; do
  if [[ -f "$DIR/package.json" ]] && [[ "$(basename "$(dirname "$DIR")")" == "@cos" ]]; then
    PKG_ROOT="$DIR"
    break
  fi
  DIR=$(dirname "$DIR")
done
[[ -z "$PKG_ROOT" ]] && exit 0

# Skip type-only packages (no executable logic)
PKG_NAME=$(basename "$PKG_ROOT")
[[ "$PKG_NAME" == "types" ]] && exit 0

ERRORS=()

[[ -f "$PKG_ROOT/jest.config.js" || -f "$PKG_ROOT/jest.config.ts" ]] \
  || ERRORS+=("jest.config.js missing in $PKG_NAME")

# Check for at least one test file
if ! find "$PKG_ROOT" -name "*.spec.ts" -o -name "*.test.ts" 2>/dev/null | grep -q .; then
  ERRORS+=("no unit tests (*.spec.ts / *.test.ts) found in $PKG_NAME")
fi

if [[ ${#ERRORS[@]} -gt 0 ]]; then
  LIST=$(IFS='; '; echo "${ERRORS[*]}")
  printf '{"decision":"block","reason":"Rule 35: %s — every @cos/* package with executable logic requires jest.config.js and unit tests."}' \
    "$LIST"
fi
exit 0
