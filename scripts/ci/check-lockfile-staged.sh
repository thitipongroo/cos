#!/usr/bin/env bash
# Rule 28 pre-commit guard: a staged change that can move dependency resolution must carry
# pnpm-lock.yaml in the SAME commit.
#
# WHY A GIT HOOK AND NOT THE EXISTING ONE
#   .claude/hooks/rule-28-check-lockfile.sh already implements Rule 28, but it is a PostToolUse hook:
#   it fires only when the agent writes a package.json. Commit 2840dd7 changed package.json without
#   the lockfile and nothing objected, because that edit did not come through the agent. A git
#   pre-commit hook covers every author and every tool.
#
# WHY IT CHECKS FIELDS AND NOT "package.json CHANGED"
#   2840dd7's edit was `"packageManager": "pnpm@11.18.0"` -> `"11.20.0"` and nothing else. The
#   lockfile records `lockfileVersion` and dependency resolutions, not the pnpm binary version, so
#   `pnpm install` produced NO diff — there was nothing to commit. Blocking that commit would have
#   demanded a file the tool cannot generate. Only these fields can move resolution, so only these
#   are gated; edits to scripts, description, engines or packageManager pass untouched.
#
# Escape hatch: SKIP_LOCKFILE_CHECK=1 git commit ... (say why in the commit message).
#
# Exit: 0 = fine, 1 = a dependency-affecting change is staged without pnpm-lock.yaml

set -uo pipefail

[[ "${SKIP_LOCKFILE_CHECK:-0}" == "1" ]] && exit 0

DEP_FIELDS='dependencies devDependencies peerDependencies optionalDependencies resolutions pnpm'

STAGED="$(git diff --cached --name-only --diff-filter=ACM)"
echo "$STAGED" | grep -qx 'pnpm-lock.yaml' && LOCK_STAGED=1 || LOCK_STAGED=0

OFFENDERS=()

# ── package.json: compare the dependency-bearing fields, not the whole file ──────────────────────
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  [[ "$f" == *node_modules/* ]] && continue
  [[ "$(basename "$f")" == "package.json" ]] || continue

  # HEAD version may not exist (new package) — treat as empty object.
  BEFORE="$(git show "HEAD:$f" 2>/dev/null || echo '{}')"
  AFTER="$(git show ":$f" 2>/dev/null || echo '{}')"

  CHANGED="$(BEFORE="$BEFORE" AFTER="$AFTER" FIELDS="$DEP_FIELDS" node -e '
    const pick = (src) => {
      let o; try { o = JSON.parse(src); } catch { return null; }
      const out = {};
      for (const k of process.env.FIELDS.split(" ")) if (k in o) out[k] = o[k];
      return JSON.stringify(out);
    };
    const a = pick(process.env.BEFORE), b = pick(process.env.AFTER);
    // Unparseable JSON is not this hook s problem — lint will catch it. Say "unchanged".
    process.stdout.write(a === null || b === null ? "" : (a === b ? "" : "yes"));
  ' 2>/dev/null)"

  [[ -n "$CHANGED" ]] && OFFENDERS+=("$f (dependency fields)")
done <<<"$STAGED"

# ── pnpm-workspace.yaml: only the overrides block moves resolution ───────────────────────────────
# Line-based extraction, no YAML parser: take from `overrides:` to the next top-level key. Enough to
# tell an overrides edit from a comment or an auditConfig edit, which is all this needs to decide.
if echo "$STAGED" | grep -qx 'pnpm-workspace.yaml'; then
  extract_overrides() { awk '/^overrides:/{f=1;next} f&&/^[^[:space:]#]/{exit} f' ; }
  B="$(git show HEAD:pnpm-workspace.yaml 2>/dev/null | extract_overrides)"
  A="$(git show :pnpm-workspace.yaml 2>/dev/null | extract_overrides)"
  [[ "$B" != "$A" ]] && OFFENDERS+=("pnpm-workspace.yaml (overrides)")
fi

if [[ ${#OFFENDERS[@]} -eq 0 || $LOCK_STAGED -eq 1 ]]; then
  exit 0
fi

echo ""
echo "Rule 28: dependency resolution changed but pnpm-lock.yaml is not staged."
for o in "${OFFENDERS[@]}"; do echo "    $o"; done
echo ""
echo "  CI installs with --frozen-lockfile and will fail on a lockfile that does not match."
echo "  Fix:  pnpm install && git add pnpm-lock.yaml"
echo ""
echo "  If the change genuinely produces no lockfile diff:"
echo "        SKIP_LOCKFILE_CHECK=1 git commit ...   (and say why in the message)"
echo ""
exit 1
