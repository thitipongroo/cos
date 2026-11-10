#!/usr/bin/env bash
# Runs pnpm audit and fails on any high or critical advisory. Nothing is suppressed.
#
# The audit runs in an isolated copy, so no pnpm configuration reaches it and it cannot write into the repo: a
# temporary directory holding package.json, pnpm-lock.yaml and only the `packages:` list of pnpm-workspace.yaml, run
# under `env -i` with nothing but PATH and a temporary HOME. That shuts out pnpm_config_* variables, every .npmrc
# (project and user) and every pnpm-workspace.yaml setting (lockfileDir, registry, auditConfig / audit.ignore,
# ignoreUnfixable, fix, only, optional, auditLevel, …), each of which was measured to blind or rewrite the audit
# otherwise. pnpm 12 added more places a setting can come from — `include` in pnpm-workspace.yaml, an updateConfig
# hook in .pnpmfile.cjs, config dependencies, the global config.yaml — and the copy carries none of them. Measured on
# pnpm 12.18.0: an ignore list in the workspace file, an `include`d file, a hook or the global config hides every high
# when the flags below run alone, so on pnpm 12 the isolation and the metadata check are the two lines that stop one.
# A network that needs a proxy or extra CA certificates is not supported by this isolation.
#
# Second line, inside the copy, on pnpm VERIFIED_PNPM only (package.json's packageManager must name it; pnpm itself
# switches to whatever packageManager names, so `pnpm --version` alone cannot pin it):
#   --audit-level info; production / dev off with only=all and optional=true (only=all is not a documented value; pnpm
#   falls through to "all"); --registry pinned (pnpm builds its metadata from the same response, so a mirror without
#   audit data would agree with itself); --config.audit-config= (dropped an ignore list on pnpm 11; on pnpm 12 no
#   flag does, measured, so only the isolation and the metadata check below stop one); --config.fix=false. The
#   advisories are compared with pnpm's metadata.vulnerabilities, severity by severity, and an empty dependency count
#   fails. Never run `pnpm audit --ignore` in the repo: it writes auditConfig.ignoreGhsas into pnpm-workspace.yaml.
#
# Accepting an advisory instead of fixing it needs a product-owner decision for that package and its own design;
# there is deliberately no mechanism for it here (docs/registers/dependency-advisories-2026-11.md).
set -uo pipefail

# The pnpm version every flag and measurement below was verified against. pnpm hands off to whatever package.json's
# packageManager names, so a bump there would silently change who interprets the flags; the gate fails until this
# line is updated, after the flags are re-verified on the new version.
VERIFIED_PNPM=12.18.0

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if ! WORK=$(mktemp -d) || [[ -z "$WORK" || ! -d "$WORK" || "$WORK" == / ]]; then
  echo "ERROR: could not create a temporary directory"
  exit 1
fi
TMPFILE="$WORK/audit.json"
ERRFILE="$WORK/audit.err"
trap 'rm -rf "$WORK"' EXIT

mkdir -p "$WORK/copy" "$WORK/home"
cp "$ROOT/package.json" "$ROOT/pnpm-lock.yaml" "$WORK/copy/" || exit 1
# Only the importer layout: from `packages:` to the next top-level key.
awk '/^packages:/{f=1} f&&/^[^[:space:]#-]/&&!/^packages:/{exit} f' "$ROOT/pnpm-workspace.yaml" \
  > "$WORK/copy/pnpm-workspace.yaml"
if ! grep -q '^packages:' "$WORK/copy/pnpm-workspace.yaml"; then
  echo "ERROR: no packages: list in pnpm-workspace.yaml"
  exit 1
fi
isolated() { (cd "$WORK/copy" && env -i PATH="$PATH" HOME="$WORK/home" "$@"); }

# packageManager is "pnpm@<version>", possibly with a "+sha…" integrity suffix.
read_pm='import json,sys
pm = json.load(open(sys.argv[1])).get("packageManager")
if not isinstance(pm, str): sys.exit("package.json has no packageManager")
name, _, version = pm.split("+")[0].partition("@")
sys.exit(f"packageManager names {name!r}, not pnpm") if name != "pnpm" or not version else print(version)'
if ! want=$(python3 -I -c "$read_pm" "$ROOT/package.json" 2>&1); then
  echo "ERROR: could not read packageManager from package.json:"
  echo "$want"
  exit 1
fi
if [[ "$want" != "$VERIFIED_PNPM" ]]; then
  echo "ERROR: package.json's packageManager is pnpm $want, but this gate was verified against pnpm $VERIFIED_PNPM."
  echo "Re-verify its flags on pnpm $want (docs/registers/dependency-advisories-2026-11.md), then update VERIFIED_PNPM."
  exit 1
fi
if ! have=$(isolated pnpm --version 2>"$ERRFILE"); then
  echo "ERROR: could not run \`pnpm --version\`:"
  cat "$ERRFILE"
  exit 1
fi
if [[ "$have" != "$want" ]]; then
  echo "ERROR: pnpm $have is running; this gate is written for package.json's packageManager pnpm $want."
  cat "$ERRFILE"
  exit 1
fi

echo "Running pnpm audit (pnpm $have, isolated copy)..."
isolated pnpm audit --json --audit-level info --config.production=false --config.dev=false --config.only=all \
  --config.optional=true --registry=https://registry.npmjs.org/ --config.audit-config= --config.fix=false \
  --lockfile-dir=. 2>"$ERRFILE" > "$TMPFILE" || true

python3 -I - "$TMPFILE" "$ERRFILE" << 'PYEOF'
import json
import sys

# One stream, line by line, so a CI log reads in the order things happened.
sys.stdout.reconfigure(line_buffering=True)

# ── Suppressions removed ──
# fastify@4 / @fastify/middie@8 / @nestjs/platform-fastify@10 advisories: resolved by the NestJS 11 + Fastify 5
#   upgrade (ADR-042). next@14 advisories: resolved by the Next 16 + React 19 upgrade (ADR-043).
#   @opentelemetry/sdk-node advisory: resolved by the sdk-node 0.219 upgrade (ADR-044).
# Then ten more, none reported by `pnpm audit --json` when they were removed:
#   tar@6 ×6 (via the expo@51 CLI): no longer in the audited tree since apps/mobile left this workspace
#     (3179aef0, 2026-06-26); apps/mobile has its own lockfile, which is not audited.
#   undici@5 ×3 (via testcontainers@10.28): resolved by the 'undici@<6.29.1' override; undici 6.29.1 only.
#   serialize-javascript@4 (via next-pwa@5 / workbox@6): resolved by replacing next-pwa with Serwist (ADR-047).
# pnpm-workspace.yaml's auditConfig.ignoreCves block went with them (pnpm never read it). It held 8 CVE ids: the 6
# for tar and 2 of the undici ones; the third undici advisory, GHSA-vxpw-j846-p89q, has CVE-2026-12151, which the
# block never listed.

SEVERITIES = ("info", "low", "moderate", "high", "critical")

tmpfile, errfile = sys.argv[1], sys.argv[2]
with open(errfile, encoding="utf-8", errors="replace") as f:
    pnpm_stderr = f.read().strip()
said = f"\npnpm said:\n{pnpm_stderr}" if pnpm_stderr else ""


def fail(message):
    print(f"ERROR: {message}{said}")
    sys.exit(1)


try:
    with open(tmpfile, encoding="utf-8") as f:
        data = json.load(f)
except UnicodeDecodeError as e:
    fail(f"pnpm audit output is not UTF-8: {e}")
except json.JSONDecodeError as e:
    fail(f"could not parse pnpm audit JSON: {e}")

# Fail closed: an error object, or any shape without an advisories map and its counts, is not a clean audit.
if not isinstance(data, dict) or not isinstance(data.get("advisories"), dict):
    detail = data.get("error") if isinstance(data, dict) else None
    fail(f"pnpm audit returned no advisories map ({detail or 'unexpected output'})")
meta = data.get("metadata", {}).get("vulnerabilities") if isinstance(data.get("metadata"), dict) else None
if not isinstance(meta, dict) or not all(type(meta.get(s)) is int for s in SEVERITIES):
    fail(f"pnpm audit returned no usable metadata.vulnerabilities to check its advisories against: {meta!r}")
deps = data["metadata"].get("totalDependencies")
if type(deps) is not int or deps <= 0:
    fail(f"pnpm audit saw no dependencies (metadata.totalDependencies = {deps!r}): it did not audit this lockfile")

counts = dict.fromkeys(SEVERITIES, 0)
unresolved = []
for aid, adv in data["advisories"].items():
    if not isinstance(adv, dict):
        fail(f"advisory {aid!r} is not an object")
    severity = adv.get("severity")
    if not isinstance(severity, str) or severity.lower() not in SEVERITIES:
        fail(f"advisory {aid!r} has no known severity: {severity!r}")
    severity = severity.lower()
    counts[severity] += 1
    if severity in ("high", "critical"):
        unresolved.append(f"  [UNRESOLVED/{severity.upper()}] {adv.get('module_name', 'unknown')}: "
                          f"{adv.get('title', '')}\n    {adv.get('url', '')}")

# A second line behind the isolation: an ignore list hides advisories but leaves them in the metadata (pnpm 11.22.0
# and 12.18.0 alike, measured).
differ = [f"{s}: metadata {meta[s]}, listed {counts[s]}" for s in SEVERITIES if meta[s] != counts[s]]

if pnpm_stderr:
    print(f"pnpm said:\n{pnpm_stderr}")
if differ:
    hidden = any(meta[s] > counts[s] for s in SEVERITIES)
    why = ("An ignore list (audit.ignore / auditConfig.ignoreGhsas) the flags did not clear would do this; so "
           "would two advisories sharing an id." if hidden else "pnpm's output is inconsistent.")
    print("\npnpm's metadata and its advisories disagree (" + "; ".join(differ) + "). " + why)
if unresolved:
    noun = "vulnerability" if len(unresolved) == 1 else "vulnerabilities"
    print(f"\n{len(unresolved)} UNRESOLVED high/critical {noun}:")
    for u in unresolved:
        print(u)

if unresolved or differ:
    print("\nAudit FAILED.")
    sys.exit(1)
print("\nAudit PASSED: 0 high/critical vulnerabilities.")
PYEOF
