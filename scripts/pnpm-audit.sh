#!/usr/bin/env bash
# Runs pnpm audit and filters out advisories that are blocked by major dependency upgrades.
# CVE-based advisories are also listed in pnpm-workspace.yaml auditConfig.ignoreCves for
# forward compatibility when pnpm is upgraded to a version that reads that field.
#
# To add a new suppression:
#   1. Add the GHSA to SUPPRESSED_GHSA below
#   2. Document the blocking dependency and required upgrade
#   3. If a CVE ID exists, also add it to pnpm-workspace.yaml auditConfig.ignoreCves
set -uo pipefail

TMPFILE=$(mktemp)
trap "rm -f '$TMPFILE'" EXIT

echo "Running pnpm audit..."
pnpm audit --json 2>/dev/null > "$TMPFILE" || true

python3 - "$TMPFILE" << 'PYEOF'
import json
import sys

# Advisory IDs suppressed because they are blocked by a scheduled major-version upgrade.
# Each entry documents the blocking package and the required upgrade path.
SUPPRESSED_GHSA = {
    # ── fastify@4 / @fastify/middie@8 / @nestjs/platform-fastify@10 advisories removed:
    #    resolved by the NestJS 11 + Fastify 5 upgrade (ADR-042). ──
    # ── next@14 advisories removed: resolved by the Next 16 + React 19 upgrade (ADR-043). ──
    # ── @opentelemetry/sdk-node advisory removed: resolved by the sdk-node 0.219 upgrade (ADR-044). ──
    # ── expo@51 CLI → tar@6 (dev-only build tool) ──
    # Fix: upgrade expo 51 → 52 (deferred — Phase 31)
    "GHSA-34x7-hfp2-rc4v",  # CVE-2026-24842 tar arbitrary file create/overwrite
    "GHSA-8qq5-rm4j-mr97",  # CVE-2026-23745 tar arbitrary file overwrite via symlink
    "GHSA-83g3-92jg-28cx",  # CVE-2026-26960 tar arbitrary file read/write via hardlink
    "GHSA-qffp-2rhf-9h96",  # CVE-2026-29786 tar hardlink path traversal
    "GHSA-9ppj-qmqm-q256",  # CVE-2026-31802 tar symlink path traversal
    "GHSA-r6q2-hw4h-h46w",  # CVE-2026-23950 tar race condition via unicode ligatures
    # ── testcontainers@10.28 → undici@5 (test-only) ──
    # Fix: upgrade testcontainers to a release that ships undici@6+ (deferred — Phase 31)
    "GHSA-vrm6-8vpv-qv8q",  # CVE-2026-1526  undici unbounded WebSocket memory
    "GHSA-v9p9-hfj2-hcw8",  # CVE-2026-2229  undici unhandled WebSocket exception
    "GHSA-vxpw-j846-p89q",  # no CVE        undici WebSocket DoS via fragment count bypass (<6.27.0)
    # ── next-pwa@5 → workbox@6 → serialize-javascript@4 (build-only) ──
    # Fix: upgrade next-pwa to a release with workbox@7+ (deferred — Phase 31)
    "GHSA-5c6j-r48x-rmvq",  # no CVE        serialize-javascript RCE via RegExp.flags
}

tmpfile = sys.argv[1]
with open(tmpfile) as f:
    try:
        data = json.load(f)
    except json.JSONDecodeError as e:
        print(f"ERROR: could not parse pnpm audit JSON: {e}", file=sys.stderr)
        sys.exit(1)

advisories = data.get("advisories", {})
unresolved = []
suppressed = []

for aid, adv in advisories.items():
    severity = adv.get("severity", "")
    if severity not in ("high", "critical"):
        continue
    url = adv.get("url", "")
    ghsa = url.rstrip("/").split("/")[-1]
    module = adv.get("module_name", "unknown")
    title = adv.get("title", "")
    if ghsa in SUPPRESSED_GHSA:
        suppressed.append(f"  [SUPPRESSED/{severity.upper()}] {module}: {ghsa}")
    else:
        unresolved.append(f"  [UNRESOLVED/{severity.upper()}] {module}: {title}\n    {url}")

if suppressed:
    print(f"Suppressed {len(suppressed)} high/critical advisories (blocked by major dep upgrades):")
    for s in suppressed:
        print(s)

if unresolved:
    print(f"\n{len(unresolved)} UNRESOLVED high/critical vulnerabilities — audit FAILED:", file=sys.stderr)
    for u in unresolved:
        print(u, file=sys.stderr)
    sys.exit(1)

print(f"\nAudit PASSED: 0 unresolved high/critical vulnerabilities.")
PYEOF
