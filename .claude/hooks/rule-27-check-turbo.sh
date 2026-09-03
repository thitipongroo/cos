#!/usr/bin/env bash
# Rule 27: After editing any package.json, verify every script key exists in root turbo.json.
# Fires on PostToolUse Write|Edit for package.json files.
# Blocks if any script in the package.json has no matching task in turbo.json.

source "$(dirname "${BASH_SOURCE[0]}")/lib/hook-input.sh"
hook_init PostToolUse block
hook_read_input
FILE_PATH="$HOOK_FILE_PATH"

[[ "$FILE_PATH" == *"package.json" ]] || exit 0
[[ "$FILE_PATH" == *"node_modules"* ]] && exit 0

[[ "$FILE_PATH" != /* ]] && FILE_PATH="$(pwd)/$FILE_PATH"
[[ -f "$FILE_PATH" ]] || exit 0

TURBO="$(pwd)/turbo.json"
[[ -f "$TURBO" ]] || exit 0

# Get all script names from the modified package.json. Exit 1 means the file declares no
# scripts at all — nothing for this rule to say. Any other non-zero means it is unreadable.
SCRIPTS=$(node "$HOOK_PARSER" keys "$FILE_PATH" scripts 2>/dev/null)
case $? in
  0) ;;
  1) exit 0 ;;
  *) hook_fail "the edited package.json could not be read" ;;
esac
[[ -z "$SCRIPTS" ]] && exit 0

# Get all task names defined in turbo.json. Turborepo 2.x renamed `pipeline` to `tasks`, so
# both are accepted and the first present one wins.
TURBO_TASKS=$(node "$HOOK_PARSER" keys "$TURBO" pipeline tasks 2>/dev/null)
case $? in
  0 | 1) ;;
  *) hook_fail "turbo.json could not be read" ;;
esac

MISSING=()
while IFS= read -r script; do
  if ! echo "$TURBO_TASKS" | grep -qxF "$script"; then
    # Only flag standard pipeline scripts (build, test, lint, dev, typecheck, etc.)
    if [[ "$script" =~ ^(build|test|test:cov|test:integration|test:unit|lint|lint:fix|dev|typecheck|type-check|clean)$ ]]; then
      MISSING+=("$script")
    fi
  fi
done <<< "$SCRIPTS"

if [[ ${#MISSING[@]} -gt 0 ]]; then
  LIST=$(IFS=', '; echo "${MISSING[*]}")
  printf '{"decision":"block","reason":"Rule 27: Scripts [%s] in %s have no matching task in turbo.json — add them to the pipeline before committing."}' \
    "$LIST" "$FILE_PATH"
fi
exit 0
