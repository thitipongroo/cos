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
#   2840dd7's edit was `"packageManager": "pnpm@11.18.0"` -> `"11.20.0"` and nothing else. On pnpm 11
#   the lockfile recorded `lockfileVersion` and dependency resolutions, not the pnpm binary version,
#   so `pnpm install` produced NO diff — there was nothing to commit. Blocking that commit would have
#   demanded a file the tool could not generate. So only the fields that change the lockfile are
#   gated; edits to scripts, description or engines pass untouched.
#
#   `packageManager` joined the gated fields on 2026-11-11. pnpm 12 writes the pinned version into
#   the lockfile's first YAML document (`packageManagerDependencies`: `pnpm` and `@pnpm/exe`), so a
#   pin bump DOES change the lockfile now. A bump committed without it does not fail CI — measured
#   with `pnpm install --frozen-lockfile --lockfile-only`, which exits 0 and quietly rewrites that
#   document — it leaves the diff in the working tree of whoever installs next. Only the name@version
#   part is compared, and only in a package.json that has its own lockfile (see the loop below).
#
# Escape hatch: SKIP_LOCKFILE_CHECK=1 git commit ... (say why in the commit message).
#
# Exit: 0 = fine, 1 = a dependency-affecting change is staged without pnpm-lock.yaml

set -uo pipefail

[[ "${SKIP_LOCKFILE_CHECK:-0}" == "1" ]] && exit 0

DEP_FIELDS='dependencies devDependencies peerDependencies optionalDependencies resolutions pnpm'

STAGED="$(git diff --cached --name-only --diff-filter=ACM)"

OFFENDERS=()

# The lockfile that governs a package.json is the nearest one ABOVE it, not always the root one.
#
# `apps/mobile` is its own pnpm workspace — pnpm-workspace.yaml excludes it (`!apps/mobile`) because
# Metro needs a hoisted node_modules — so its dependencies resolve into `apps/mobile/pnpm-lock.yaml`
# and root `pnpm install` produces no diff for them. This hook originally accepted only a staged
# `pnpm-lock.yaml` at the repo root (`grep -qx`), which made a mobile dependency change IMPOSSIBLE to
# commit: the correct lockfile was staged and still rejected, and the only way through was the
# SKIP escape hatch, which would have been a lie — the change does produce a lockfile diff, just not
# in the root file. Walking up from each package.json fixes both workspaces with one rule.
lockfile_for() {
  local dir; dir="$(dirname "$1")"
  while :; do
    # `dirname` yields "." at the repo root, and git's own paths carry no "./" prefix — so the root
    # candidate must be spelled "pnpm-lock.yaml", never "./pnpm-lock.yaml", or `is_staged` compares a
    # path git never prints and every root-level dependency change fails the hook.
    local candidate
    if [[ "$dir" == "." ]]; then candidate='pnpm-lock.yaml'; else candidate="$dir/pnpm-lock.yaml"; fi

    if [[ -f "$candidate" ]] || git cat-file -e "HEAD:$candidate" 2>/dev/null; then
      echo "$candidate"
      return
    fi
    [[ "$dir" == "." || "$dir" == "/" ]] && break
    dir="$(dirname "$dir")"
  done
  echo 'pnpm-lock.yaml' # nothing found — hold it to the root lockfile
}

# A here-string, NOT `echo "$STAGED" | grep -q`.
#
# `grep -q` exits the moment it matches, which closes the pipe under an `echo` that has not
# finished writing — echo dies of SIGPIPE (141), and `set -o pipefail` above makes that the
# pipeline's status. The function then reports "not staged" for a file that IS staged.
#
# It only shows up on a big commit: the staged list has to exceed the 64 KB pipe buffer for
# echo to still be writing when grep leaves. A 2,220-file merge hit it and every single
# package.json was reported as missing its lockfile, with both lockfiles correctly staged.
# A here-string is a file, not a pipeline, so there is nothing to signal.
is_staged() { grep -qxF "$1" <<<"$STAGED"; }

# ── package.json: compare the dependency-bearing fields, not the whole file ──────────────────────
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  [[ "$f" == *node_modules/* ]] && continue
  [[ "$(basename "$f")" == "package.json" ]] || continue

  # HEAD version may not exist (new package) — treat as empty object.
  BEFORE="$(git show "HEAD:$f" 2>/dev/null || echo '{}')"
  AFTER="$(git show ":$f" 2>/dev/null || echo '{}')"

  LOCK="$(lockfile_for "$f")"

  # `packageManager` counts only where this package.json is the root of its own workspace (its
  # lockfile sits beside it): pnpm records the pin in that lockfile, and a nested package's pin
  # moves nothing. And only its name@version: pnpm writes `specifier: 12.18.0` with no hash, so
  # adding, dropping or changing the `+sha512.…` part alone leaves the lockfile byte-identical —
  # gating it would demand a file pnpm cannot produce (the 2840dd7 problem again).
  FIELDS="$DEP_FIELDS"
  [[ "$(dirname "$LOCK")" == "$(dirname "$f")" ]] && FIELDS="$FIELDS packageManager"

  CHANGED="$(BEFORE="$BEFORE" AFTER="$AFTER" FIELDS="$FIELDS" node -e '
    const pick = (src) => {
      let o; try { o = JSON.parse(src); } catch { return null; }
      const out = {};
      for (const k of process.env.FIELDS.split(" ")) {
        if (!(k in o)) continue;
        out[k] = k === "packageManager" ? String(o[k]).split("+")[0] : o[k];
      }
      return JSON.stringify(out);
    };
    const a = pick(process.env.BEFORE), b = pick(process.env.AFTER);
    // Unparseable JSON is not this hook s problem — lint will catch it. Say "unchanged".
    process.stdout.write(a === null || b === null ? "" : (a === b ? "" : "yes"));
  ' 2>/dev/null)"

  if [[ -n "$CHANGED" ]]; then
    is_staged "$LOCK" || OFFENDERS+=("$f (dependency fields or packageManager) → stage $LOCK")
  fi
done <<<"$STAGED"

# ── pnpm-workspace.yaml: the overrides block ─────────────────────────────────────────────────────
# Line-based extraction, no YAML parser: take from `overrides:` to the next top-level key. Comment
# lines up to that next key, top-level ones included, are read as part of the block. It is not the
# only key that can move resolution — `packages:` (importers) and `minimumReleaseAgeExclude`, for
# example, also can — and those are not checked here.
if is_staged 'pnpm-workspace.yaml'; then
  extract_overrides() { awk '/^overrides:/{f=1;next} f&&/^[^[:space:]#]/{exit} f' ; }
  B="$(git show HEAD:pnpm-workspace.yaml 2>/dev/null | extract_overrides)"
  A="$(git show :pnpm-workspace.yaml 2>/dev/null | extract_overrides)"
  # `overrides:` is a ROOT-workspace concept, so this one is always held to the root lockfile.
  if [[ "$B" != "$A" ]] && ! is_staged 'pnpm-lock.yaml'; then
    OFFENDERS+=("pnpm-workspace.yaml (overrides) → stage pnpm-lock.yaml")
  fi
fi

if [[ ${#OFFENDERS[@]} -eq 0 ]]; then
  exit 0
fi

echo ""
echo "Rule 28: a change that moves pnpm-lock.yaml is staged without it."
for o in "${OFFENDERS[@]}"; do echo "    $o"; done
echo ""
echo "  CI installs with --frozen-lockfile: a dependency change fails it; a packageManager bump passes"
echo "  but leaves the lockfile diff to whoever installs next."
echo "  Fix:  run pnpm install in the package's own workspace, then stage the lockfile named above."
echo "        (apps/mobile is its OWN workspace — cd apps/mobile && pnpm install)"
echo ""
echo "  If the change genuinely produces no lockfile diff:"
echo "        SKIP_LOCKFILE_CHECK=1 git commit ...   (and say why in the message)"
echo ""
exit 1
