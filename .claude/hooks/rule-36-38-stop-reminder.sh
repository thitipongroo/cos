#!/usr/bin/env bash
# Rules 36 and 38: when the turn ends with source changes in the tree, ask whether the two gates
# were actually run. Fires on Stop.
#
# Why this is a script and not an inline printf in settings.json: the inline version built its
# JSON by string concatenation and put a raw newline inside a JSON string, which is invalid.
# Claude Code accepted it up to 2.1.241 and rejects it from at least 2.1.251, recording
# hook_non_blocking_error with "Emit the payload with a JSON encoder ... rather than string
# concatenation". Measured over 24 session transcripts: 533 reminders delivered between
# 2026-07-24 and 2026-08-24, then 23 dropped between 2026-08-30 and 2026-09-03 — while the hook
# went on exiting 0. Same shape as the jq defect it was found next to: nothing looked wrong.
#
# So the payload is built by JSON.stringify. A newline, a quote or a backslash in the text below
# can no longer produce something the harness will discard.

set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}" 2>/dev/null || exit 0

# Nothing to remind about unless source files actually changed.
git diff --name-only HEAD 2>/dev/null | grep -qE '\.(ts|tsx|sql)$' || exit 0

read -r -d '' MESSAGE <<'EOF'
RULE 36: Did you verify completion per spec? Read spec line by line → ls/grep/cat each item → show output.
RULE 38: Did PO approve the todo list before you started? If not: stop, present list, wait for approval.
EOF

if ! command -v node >/dev/null 2>&1; then
  # stderr is captured by the harness and shown in the transcript, so this is visible rather than
  # silent. stdout is the hook protocol and must stay empty when no valid payload can be produced.
  echo "rule-36-38-stop-reminder: node is not on PATH — the Rule 36/38 reminder was not emitted" >&2
  exit 0
fi

node -e 'process.stdout.write(JSON.stringify({ systemMessage: process.argv[1] }))' "$MESSAGE"
exit 0
