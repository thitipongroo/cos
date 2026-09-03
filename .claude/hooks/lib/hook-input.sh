#!/usr/bin/env bash
# Shared payload access for the .claude/hooks/ scripts. Source it, call hook_init with the
# event name and the failure mode, then call hook_read_input.
#
#   source "$(dirname "${BASH_SOURCE[0]}")/lib/hook-input.sh"
#   hook_init PreToolUse deny
#   hook_read_input          # sets HOOK_FILE_PATH and HOOK_CONTENT
#
# Failure modes decide what a hook says when it CANNOT do its job — which is the defect this
# file was written to remove. Every hook previously answered "nothing to check here" when its
# parser was missing, and that is the same output as a clean pass.
#
#   deny   PreToolUse gates. An unusable parser refuses the write. Fail-closed, per the
#          guardrail in .claude/agents/engineering-agent.md — more disruptive than a silent
#          pass, and that is the point
#   block  PostToolUse gates. The write already happened; blocking prompts the agent to fix it
#   warn   advisory hooks that inject context rather than gate anything (rule 37). Blocking a
#          completed write over a broken advisor would be a worse trade than saying so
#
# The process still exits 0 in every path — agent-team/patterns/04-creating-hooks.md line 54:
# a hook must never take the session down. The signal is the stdout JSON, never the exit code.

HOOK_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK_PARSER="$HOOK_LIB_DIR/json-query.mjs"
HOOK_EVENT="PreToolUse"
HOOK_FAILMODE="deny"
HOOK_FILE_PATH=""
HOOK_CONTENT=""

hook_init() {
  HOOK_EVENT="$1"
  HOOK_FAILMODE="$2"
  HOOK_SELF="$(basename "${BASH_SOURCE[1]:-unknown}")"
}

# Emit the failure signal for this hook's mode and stop. Reason text must stay free of double
# quotes and backslashes: it is interpolated into JSON without an escaper, and an escaper here
# would be one more thing that can fail silently.
hook_fail() {
  case "$HOOK_FAILMODE" in
    deny)
      printf '{"hookSpecificOutput":{"hookEventName":"%s","permissionDecision":"deny","permissionDecisionReason":"Hook %s could not run: %s. This gate is fail-closed — fix the hook rather than working around it."}}' \
        "$HOOK_EVENT" "$HOOK_SELF" "$1"
      ;;
    block)
      printf '{"decision":"block","reason":"Hook %s could not run: %s. Fix the hook before continuing."}' \
        "$HOOK_SELF" "$1"
      ;;
    warn)
      printf '{"hookSpecificOutput":{"hookEventName":"%s","additionalContext":"Hook %s could not run: %s. Its check did not happen — do not read silence as a pass."}}' \
        "$HOOK_EVENT" "$HOOK_SELF" "$1"
      ;;
  esac
  exit 0
}

hook_read_input() {
  command -v node >/dev/null 2>&1 || hook_fail "node is not on PATH"
  [[ -f "$HOOK_PARSER" ]] || hook_fail "the parser at .claude/hooks/lib/json-query.mjs is missing"

  local tmp
  tmp="$(mktemp)" || hook_fail "mktemp failed"

  if ! node "$HOOK_PARSER" input >"$tmp" 2>/dev/null; then
    rm -f "$tmp"
    hook_fail "the hook payload could not be parsed"
  fi

  { IFS= read -r -d '' HOOK_FILE_PATH; IFS= read -r -d '' HOOK_CONTENT; } <"$tmp"
  rm -f "$tmp"
}

# Absolute path of a file the payload named, resolved against the project root the same way
# every hook did before. CLAUDE_PROJECT_DIR is set by Claude Code; pwd is the fallback.
hook_abs_path() {
  local p="$1"
  if [[ "$p" != /* && "$p" != [A-Za-z]:* ]]; then
    printf '%s/%s' "${CLAUDE_PROJECT_DIR:-$(pwd)}" "$p"
  else
    printf '%s' "$p"
  fi
}

hook_project_dir() {
  printf '%s' "${CLAUDE_PROJECT_DIR:-$(pwd)}"
}
