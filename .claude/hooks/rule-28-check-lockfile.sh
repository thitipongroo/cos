#!/usr/bin/env bash
# Rule 28: After editing any package.json, verify pnpm-lock.yaml is not stale.
# Fires on PostToolUse Write|Edit for package.json files.
# Blocks if pnpm-lock.yaml is missing or older than any package.json.

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

[[ "$FILE_PATH" == *"package.json" ]] || exit 0
[[ "$FILE_PATH" == *"node_modules"* ]] && exit 0

LOCKFILE="$(pwd)/pnpm-lock.yaml"

if [[ ! -f "$LOCKFILE" ]]; then
  printf '{"decision":"block","reason":"Rule 28: pnpm-lock.yaml does not exist — run pnpm install to generate it before committing."}'
  exit 0
fi

[[ "$FILE_PATH" != /* ]] && ABS_PKG="$(pwd)/$FILE_PATH" || ABS_PKG="$FILE_PATH"

# Block if lockfile is older than the modified package.json
if [[ "$ABS_PKG" -nt "$LOCKFILE" ]]; then
  printf '{"decision":"block","reason":"Rule 28: pnpm-lock.yaml is stale — %s was modified after the lockfile. Run pnpm install and commit pnpm-lock.yaml."}' \
    "$FILE_PATH"
fi
exit 0
