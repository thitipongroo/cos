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

# Node builtins are not packages and can never appear in package.json — listing them there would
# shadow the real module. Generated from `require('module').builtinModules` on Node 24 (the version
# CI pins via NODE_VERSION), with subpaths collapsed to their top-level name and the private `_*`
# modules dropped. Anything reachable only as `node:<name>` (sea, sqlite, test) is covered by the
# prefix check below instead, since no npm package may be named `node:*`.
BUILTINS=" assert async_hooks buffer child_process cluster console constants crypto dgram \
diagnostics_channel dns domain events fs http http2 https inspector module net os path perf_hooks \
process punycode querystring readline repl stream string_decoder sys timers tls trace_events tty \
url util v8 vm wasi worker_threads zlib "

MISSING=()
while IFS= read -r pkg; do
  [[ -z "$pkg" ]] && continue
  # `node:` prefix is reserved for builtins — always allowed.
  [[ "$pkg" == node:* ]] && continue
  # Normalize to top-level package name
  if [[ "$pkg" == @* ]]; then
    NAME=$(printf '%s' "$pkg" | cut -d/ -f1-2)
  else
    NAME=$(printf '%s' "$pkg" | cut -d/ -f1)
  fi
  # Bare builtin (`fs`, `path`, `fs/promises`) — also allowed.
  [[ "$BUILTINS" == *" $NAME "* ]] && continue
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
