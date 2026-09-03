#!/usr/bin/env bash
# Proves the .claude/hooks/ gates still fire.
#
# Why this exists: from at least 2026-07-24 every hook was disabled and nothing reported it.
# They parsed their payload with `jq`, which is not a prerequisite of this repository, so on a
# machine without it each hook read an empty value and took its "nothing to check here" branch
# and exited 0. That output is identical to a clean pass. 305 commits touching .ts/.tsx/.sql
# landed through gates that were not running.
#
# So this script asserts three things per hook, and the third is the one that matters:
#   1. a payload that MUST trigger the rule produces a signal
#   2. a payload that must NOT trigger it produces silence  (a hook that always fires is not
#      a working hook, and asserting only 1 would pass for one that does)
#   3. with its parser unavailable, the hook still produces a signal rather than silence
#
# Everything runs against a disposable fake project in a temp directory. The hooks resolve
# their inputs against the working directory, so nothing here reads or writes the real
# repository — in particular it never touches .claude/impl-pending.md or .claude/impl-approved.
#
# Note on ABSENT_ADR below: the identifier is composed at run time rather than written out.
# Spelling it literally would make this file itself a dangling ADR reference, and rule 29 —
# correctly — refuses to let that be written.
#
# Usage: bash scripts/ci/check-hooks-fire.sh

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HOOKS_DIR="$REPO_ROOT/.claude/hooks"
ABSENT_ADR="$(printf 'ADR-%s' 999)"
FAILURES=0
CHECKS=0

pass() {
  CHECKS=$((CHECKS + 1))
  printf '  ok    %s\n' "$1"
}

fail() {
  CHECKS=$((CHECKS + 1))
  FAILURES=$((FAILURES + 1))
  printf '  FAIL  %s\n' "$1"
  [[ -n "${2:-}" ]] && printf '        got: %s\n' "$2"
}

# Build a hook payload. Done in node so the JSON is always valid — a hand-built payload with an
# unescaped newline is silently rejected by the parser and every assertion then passes for the
# wrong reason.
payload() {
  node -e 'process.stdout.write(JSON.stringify({tool_input:{file_path:process.argv[1],content:process.argv[2]}}))' "$1" "${2-}"
}

run_hook() { # hook-file, file_path, content
  payload "$2" "${3-}" | bash "$HOOKS_DIR/$1" 2>/dev/null
}

# A hook that produces output the harness cannot parse is as absent as one that produces none.
# That is not hypothetical: the Stop hook built its JSON by string concatenation and put a raw
# newline inside a string, so Claude Code discarded 23 reminders between 2026-08-30 and
# 2026-09-03 while the hook exited 0. A non-empty assertion alone would have passed it.
valid_json() {
  node -e 'try{JSON.parse(process.argv[1]);process.exit(0)}catch{process.exit(1)}' "$1" 2>/dev/null
}

expect_signal() { # description, hook, file_path, content
  local out
  out="$(run_hook "$2" "$3" "${4-}")"
  if [[ -z "$out" ]]; then
    fail "$1" '(silence)'
  elif ! valid_json "$out"; then
    fail "$1 — output is not parseable JSON" "$out"
  else
    pass "$1"
  fi
}

expect_silent() { # description, hook, file_path, content
  local out
  out="$(run_hook "$2" "$3" "${4-}")"
  if [[ -z "$out" ]]; then pass "$1"; else fail "$1" "$out"; fi
}

# ---------------------------------------------------------------- the fake project

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cd "$WORK" || exit 1

# CLAUDE_PROJECT_DIR would send the hooks back to the real repository.
unset CLAUDE_PROJECT_DIR

mkdir -p docs/architecture/adr docs/specifications context .claude/rules packages/@cos/probe/src
printf '# decision\n' >docs/architecture/adr/008-shared-db-tenant-id-rls.md
printf '# Security\n' >docs/specifications/05-security-compliance.md
printf 'security compliance\n' >context.md
printf 'security\n' >context/00_master.md
printf 'compliance\n' >.claude/rules/qm-04-security.md
printf '{"tasks":{}}\n' >turbo.json
printf 'lockfileVersion: 9.0\n' >pnpm-lock.yaml
printf '{"name":"probe","scripts":{"build":"tsc"},"jest":{}}\n' >package.json
printf '{"name":"@cos/probe"}\n' >packages/@cos/probe/package.json
printf 'export const x = 1;\n' >packages/@cos/probe/src/index.ts
printf 'module.exports = {};\n' >jest.config.js

# Rule 28 compares mtimes: the lockfile must be older than the package.json it is measured
# against, or the rule has nothing to report.
touch -t 200001010000 pnpm-lock.yaml
touch package.json

# The Stop hook reads `git diff`, so the fixture has to be a real repository rather than a bare
# directory — against a non-repo git fails, the hook sees nothing and stays quiet, and the test
# would pass without exercising anything.
mkdir -p src
printf 'export const probe = 1;\n' >src/probe.ts
git init -q .
git add -A
git -c user.email=hooks@check -c user.name=hook-check commit -qm 'fixture'

echo "Hook enforcement — each gate must fire, stay quiet when it should, and refuse to fail silently"
echo

# ---------------------------------------------------------------- 1. rules fire

echo "Triggering payloads must produce a signal:"
expect_signal "rule-26  undeclared import is refused" \
  rule-26-check-imports.sh "src/probe.ts" "import a from 'not-a-declared-package'"
expect_signal "rule-27  script with no turbo.json task is blocked" \
  rule-27-check-turbo.sh "package.json"
expect_signal "rule-28  package.json newer than the lockfile is blocked" \
  rule-28-check-lockfile.sh "package.json"
expect_signal "rule-29  reference to an ADR that does not exist is refused" \
  rule-29-check-adrs.sh "notes.md" "see $ABSENT_ADR for the rationale"
expect_signal "rule-32  jest key beside a jest.config.js is blocked" \
  rule-32-check-jest-config.sh "package.json"
expect_signal "rule-35  @cos package without tests is blocked" \
  rule-35-check-test-infra.sh "packages/@cos/probe/src/index.ts" "export const x = 1;"
expect_signal "rule-37  spec edit injects the drift grep" \
  rule-37-check-spec-drift.sh "docs/specifications/05-security-compliance.md" "# Security"

echo
echo "Non-triggering payloads must produce silence:"
expect_silent "rule-26  relative import is allowed" \
  rule-26-check-imports.sh "src/probe.ts" "import a from './sibling'"
expect_silent "rule-26  node builtin is allowed" \
  rule-26-check-imports.sh "src/probe.ts" "import fs from 'node:fs'"
expect_silent "rule-29  reference to an ADR that exists is allowed" \
  rule-29-check-adrs.sh "notes.md" "see ADR-008 for the rationale"
expect_silent "rule-35  file outside packages/@cos is ignored" \
  rule-35-check-test-infra.sh "backend/src/index.ts" "export const x = 1;"
expect_silent "rule-37  edit outside docs/specifications is ignored" \
  rule-37-check-spec-drift.sh "README.md" "# Readme"

# ---------------------------------------------------------------- 2. rule 38, both states

echo
echo "rule-38 gates on the approval marker:"
mkdir -p .claude
printf '# plan\n' >.claude/impl-pending.md
rm -f .claude/impl-approved
expect_signal "rule-38  pending plan without approval refuses a .ts write" \
  rule-38-check-approval.sh "src/service.ts" "export const x = 1;"
touch .claude/impl-approved
expect_silent "rule-38  approved plan allows the same write" \
  rule-38-check-approval.sh "src/service.ts" "export const x = 1;"
rm -f .claude/impl-pending.md .claude/impl-approved

# ---------------------------------------------------------------- 2b. the Stop reminder

echo
echo "Stop reminder fires only when source changed, and emits parseable JSON:"

STOP_HOOK="$HOOKS_DIR/rule-36-38-stop-reminder.sh"
if [[ ! -f "$STOP_HOOK" ]]; then
  fail "rule-36-38-stop-reminder.sh exists" '(missing)'
else
  out="$(CLAUDE_PROJECT_DIR="$WORK" bash "$STOP_HOOK" 2>/dev/null)"
  if [[ -z "$out" ]]; then pass "stop     clean tree produces no reminder"; else fail "stop     clean tree produces no reminder" "$out"; fi

  printf 'export const probe2 = 2;\n' >>src/probe.ts
  out="$(CLAUDE_PROJECT_DIR="$WORK" bash "$STOP_HOOK" 2>/dev/null)"
  if [[ -z "$out" ]]; then
    fail "stop     changed .ts produces a reminder" '(silence)'
  elif ! valid_json "$out"; then
    fail "stop     reminder is parseable JSON — this is the 2026-08-30 defect" "$out"
  elif ! node -e 'process.exit(JSON.parse(process.argv[1]).systemMessage ? 0 : 1)' "$out" 2>/dev/null; then
    fail "stop     reminder carries a systemMessage" "$out"
  else
    pass "stop     changed .ts produces a reminder"
    pass "stop     reminder is parseable JSON carrying a systemMessage"
  fi
  git checkout -q -- src/probe.ts
fi

# ---------------------------------------------------------------- 3. the regression itself

echo
echo "With the parser unavailable, every hook must speak up rather than pass silently:"

NODE_BIN="$(command -v node)"
if [[ -z "$NODE_BIN" ]]; then
  fail "node is required to run this check" ''
else
  NODE_DIR="$(dirname "$NODE_BIN")"
  PATH_NO_NODE="$(printf '%s' "$PATH" | tr ':' '\n' | grep -vxF "$NODE_DIR" | paste -sd: -)"

  # Self-check: if node is still reachable the assertions below would pass for the wrong reason.
  if PATH="$PATH_NO_NODE" command -v node >/dev/null 2>&1; then
    fail "could not construct a PATH without node — the parser-failure checks are not valid" ''
  else
    for hook in "$HOOKS_DIR"/rule-*.sh; do
      name="$(basename "$hook")"
      # The Stop reminder is not one of the payload-parsing gates: it reads git, not stdin, and
      # stdout is the hook protocol, so with no node it has no valid payload it could emit. It
      # reports on stderr instead, which the harness captures. Checked separately below.
      [[ "$name" == "rule-36-38-stop-reminder.sh" ]] && continue
      out="$(payload "src/probe.ts" "x" | PATH="$PATH_NO_NODE" bash "$hook" 2>/dev/null)"
      if [[ -n "$out" ]]; then
        pass "$name  reports its parser is unusable"
      else
        fail "$name  passed silently with no parser — this is the 2026-07-24 defect" '(silence)'
      fi
    done

    printf 'export const probe3 = 3;\n' >>src/probe.ts
    err="$(CLAUDE_PROJECT_DIR="$WORK" PATH="$PATH_NO_NODE" bash "$HOOKS_DIR/rule-36-38-stop-reminder.sh" 2>&1 >/dev/null)"
    if [[ -n "$err" ]]; then
      pass "rule-36-38-stop-reminder.sh  reports on stderr that the reminder was not emitted"
    else
      fail "rule-36-38-stop-reminder.sh  said nothing at all with no node" '(silence)'
    fi
    git checkout -q -- src/probe.ts
  fi
fi

# ---------------------------------------------------------------- result

echo
if [[ $FAILURES -eq 0 ]]; then
  echo "==> $CHECKS checks passed — every hook fires, discriminates, and fails loudly"
  exit 0
fi
echo "==> $FAILURES of $CHECKS checks failed"
exit 1
