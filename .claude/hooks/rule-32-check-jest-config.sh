#!/usr/bin/env bash
# Rule 32: jest.config.js is the single source of truth.
# After editing package.json, block if it contains a "jest" key AND jest.config.js exists in the same directory.
# Fires on PostToolUse Write|Edit for package.json files.

source "$(dirname "${BASH_SOURCE[0]}")/lib/hook-input.sh"
hook_init PostToolUse block
hook_read_input
FILE_PATH="$HOOK_FILE_PATH"

[[ "$FILE_PATH" == *"package.json" ]] || exit 0
[[ "$FILE_PATH" == *"node_modules"* ]] && exit 0

[[ "$FILE_PATH" != /* ]] && ABS="$(pwd)/$FILE_PATH" || ABS="$FILE_PATH"
[[ -f "$ABS" ]] || exit 0

PKG_DIR=$(dirname "$ABS")

# Check if package.json has a "jest" key. Exit 1 is the answer "no such key"; anything else
# means the file is unreadable and must not be reported as a clean pass.
node "$HOOK_PARSER" has-key "$ABS" jest >/dev/null 2>&1
HAS_JEST=$?
[[ $HAS_JEST -gt 1 ]] && hook_fail "the edited package.json could not be read"
if [[ $HAS_JEST -eq 0 ]]; then
  # Check if jest.config.js also exists in the same directory
  if [[ -f "$PKG_DIR/jest.config.js" || -f "$PKG_DIR/jest.config.ts" ]]; then
    # The key name is quoted with apostrophes, not escaped double quotes. printf drops the
    # backslash from \" and the bare quote then closes the JSON string early, which is how this
    # message spent its life unparseable — the harness discards the payload and the rule blocks
    # nothing. Apostrophes need no escaping in JSON, so there is nothing left to get wrong.
    printf '{"decision":"block","reason":"Rule 32: %s contains a '"'"'jest'"'"' key AND jest.config.js exists in the same directory — remove the '"'"'jest'"'"' key from package.json. jest.config.js is the single source of truth."}' \
      "$FILE_PATH"
  fi
fi
exit 0
