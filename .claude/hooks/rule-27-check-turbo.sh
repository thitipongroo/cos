#!/usr/bin/env bash
# Rule 27: After editing any package.json, verify every script key exists in root turbo.json.
# Fires on PostToolUse Write|Edit for package.json files.
# Blocks if any script in the package.json has no matching task in turbo.json.

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

[[ "$FILE_PATH" == *"package.json" ]] || exit 0
[[ "$FILE_PATH" == *"node_modules"* ]] && exit 0

[[ "$FILE_PATH" != /* ]] && FILE_PATH="$(pwd)/$FILE_PATH"
[[ -f "$FILE_PATH" ]] || exit 0

TURBO="$(pwd)/turbo.json"
[[ -f "$TURBO" ]] || exit 0

# Get all script names from the modified package.json
SCRIPTS=$(jq -r '.scripts // {} | keys[]' "$FILE_PATH" 2>/dev/null)
[[ -z "$SCRIPTS" ]] && exit 0

# Get all task names defined in turbo.json pipeline
TURBO_TASKS=$(jq -r '.pipeline // .tasks // {} | keys[]' "$TURBO" 2>/dev/null)

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
