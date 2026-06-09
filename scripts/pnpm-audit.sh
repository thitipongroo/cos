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
    # ── @nestjs/platform-fastify@10 locks fastify@4 and @fastify/middie@8 ──
    # Fix: upgrade NestJS 10 → 11 (deferred — Phase 31)
    "GHSA-72c6-fx6q-fr5w",  # CVE-2026-6270  @fastify/middie auth bypass (CRITICAL)
    "GHSA-cxrg-g7r8-w69p",  # CVE-2026-22031 @fastify/middie path bypass
    "GHSA-8p85-9qpw-fwgw",  # CVE-2026-2880  @fastify/middie improper path normalization
    "GHSA-v9ww-2j6r-98q6",  # CVE-2026-33804 @fastify/middie deprecated-flag bypass
    "GHSA-jx2c-rxcm-jvmq",  # CVE-2026-25223 fastify Content-Type tab bypass
    "GHSA-r4wm-x892-vjmx",  # CVE-2026-2293  @nestjs/platform-fastify URL encoding bypass
    "GHSA-wf42-42fg-fg84",  # CVE-2026-33011 @nestjs/platform-fastify HEAD bypass
    "GHSA-q3j6-qgpj-74h6",  # CVE-2026-6321  fast-uri path traversal
    "GHSA-v39h-62p7-jpjc",  # CVE-2026-6322  fast-uri host confusion
    # ── next@14 ──
    # Fix: upgrade Next.js 14 → 15 (deferred — Phase 31)
    "GHSA-h25m-26qc-wcjf",  # no CVE        DoS via HTTP request deserialization
    "GHSA-q4gf-8mx6-v5v3",  # no CVE        DoS with Server Components
    "GHSA-8h8q-6873-q5fj",  # no CVE        DoS with Server Components (variant)
    "GHSA-c4j6-fc7j-m34r",  # CVE-2026-44578 SSRF in app router
    "GHSA-36qx-fr4f-26g5",  # CVE-2026-44573 middleware/proxy bypass in Pages Router
    # ── @opentelemetry/sdk-node@0.51 ──
    # Fix: upgrade full OTel stack to 0.217+ (deferred — Phase 31)
    "GHSA-q7rr-3cgh-j5r3",  # CVE-2026-44902 Prometheus exporter crash via malformed HTTP
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
