#!/usr/bin/env bash
# Rule 32: jest.config.js is the single source of truth.
# After editing package.json, block if it contains a "jest" key AND jest.config.js exists in the same directory.
# Fires on PostToolUse Write|Edit for package.json files.

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

[[ "$FILE_PATH" == *"package.json" ]] || exit 0
[[ "$FILE_PATH" == *"node_modules"* ]] && exit 0

[[ "$FILE_PATH" != /* ]] && ABS="$(pwd)/$FILE_PATH" || ABS="$FILE_PATH"
[[ -f "$ABS" ]] || exit 0

PKG_DIR=$(dirname "$ABS")

# Check if package.json has a "jest" key
if jq -e '.jest' "$ABS" >/dev/null 2>&1; then
  # Check if jest.config.js also exists in the same directory
  if [[ -f "$PKG_DIR/jest.config.js" || -f "$PKG_DIR/jest.config.ts" ]]; then
    printf '{"decision":"block","reason":"Rule 32: %s contains a \"jest\" key AND jest.config.js exists in the same directory — remove the \"jest\" key from package.json. jest.config.js is the single source of truth."}' \
      "$FILE_PATH"
  fi
fi
exit 0
