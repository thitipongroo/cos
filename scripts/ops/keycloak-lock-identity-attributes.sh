#!/usr/bin/env bash
# Make identity attributes admin-only in every realm a tenant uses (ADR-107): the unmanaged `tenant_id`,
# `user_id`, `role` (unmanagedAttributePolicy ADMIN_EDIT) and the managed `username` and `email` (edit: admin).
#
# WHY. `tenant_id`, `user_id` and `role` are Keycloak USER ATTRIBUTES that the realm maps into every token.
# They are unmanaged attributes (not declared in the user profile), and with `unmanagedAttributePolicy:
# ENABLED` a signed-in user can rewrite their own through the Account API. Measured 2026-09-14 on Keycloak
# 26.6.4: `POST /realms/<realm>/account` with a changed `tenant_id` answered 204 and the value was stored; in
# a throwaway realm a SITE_WORKER set its own `role` to SYSTEM_ADMIN. Under `ADMIN_EDIT` the same request
# leaves the attributes unchanged, users can no longer see them, the admin API still sets them, and tokens
# still carry them.
#
# `username` and `email` are identity too: a user renamed both through the Account API (measured on a throwaway
# realm, 2026-09-14), which on the shared realm lets them squat another tenant's future user and breaks their own
# Path A login (username = phone). With `edit: ["admin"]` the same request is 400 error-user-attribute-read-only,
# the user can still edit firstName, and the admin API — PDPA erasure — can still overwrite both.
#
# A realm import applies only when the realm does not exist yet, so changing
# infrastructure/keycloak/realms/construction-os-realm.json does not reach a running Keycloak. This does.
#
# Usage:
#   PSQL_URL=postgresql://... KEYCLOAK_URL=http://localhost:8090 \
#   KEYCLOAK_ADMIN_USER=admin KEYCLOAK_ADMIN_PASSWORD=... \
#   bash scripts/ops/keycloak-lock-identity-attributes.sh [--check]
#
# Realms: every distinct platform.tenants.keycloak_realm. Without --check each realm not yet locked is locked
# (idempotent). With --check nothing is changed.
# Exit 0 when every realm is locked at the end; 1 (--check only) when one is not; 2 when it could not
# measure or act — including a realm named by a tenant that does not exist in Keycloak.
set -euo pipefail

MODE=apply
[ "${1:-}" = "--check" ] && MODE=check

: "${PSQL_URL:?PSQL_URL is required (a connection string that can read platform.tenants)}"
KC=${KEYCLOAK_URL:-http://localhost:8090}
ADMIN_USER=${KEYCLOAK_ADMIN_USER:-admin}
: "${KEYCLOAK_ADMIN_PASSWORD:?KEYCLOAK_ADMIN_PASSWORD is required}"

command -v psql >/dev/null || { echo "psql not found" >&2; exit 2; }

TOKEN=$(printf '%s' "$KEYCLOAK_ADMIN_PASSWORD" \
  | curl -sf -X POST "$KC/realms/master/protocol/openid-connect/token" -d client_id=admin-cli \
      --data-urlencode "username=$ADMIN_USER" --data-urlencode "password@-" -d grant_type=password \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])") || { echo "Keycloak admin login failed" >&2; exit 2; }

REALMS=$(mktemp)
trap 'rm -f "$REALMS"' EXIT
psql "$PSQL_URL" -At -c "SELECT DISTINCT keycloak_realm FROM platform.tenants ORDER BY 1" > "$REALMS" \
  || { echo "database read failed" >&2; exit 2; }

PYTHONIOENCODING=utf-8 KC="$KC" TOKEN="$TOKEN" MODE="$MODE" python3 - "$REALMS" <<'PY'
import json, os, sys, urllib.error, urllib.parse, urllib.request

kc, token, mode = os.environ['KC'], os.environ['TOKEN'], os.environ['MODE']
realms = [l.strip() for l in open(sys.argv[1], encoding='utf-8') if l.strip()]
headers = {'Authorization': f'Bearer {token}'}
wrong, unreachable = [], []

LOCKED_ATTRS = ('username', 'email')


def problems(profile):
    """What in this profile still lets a user change their own identity — empty when locked."""
    found = []
    if profile.get('unmanagedAttributePolicy') != 'ADMIN_EDIT':
        found.append(f"unmanagedAttributePolicy={profile.get('unmanagedAttributePolicy')}")
    for attr in profile.get('attributes') or []:
        if attr.get('name') in LOCKED_ATTRS and 'user' in ((attr.get('permissions') or {}).get('edit') or []):
            found.append(f"{attr['name']} editable by user")
    return found


def lock(profile):
    profile['unmanagedAttributePolicy'] = 'ADMIN_EDIT'
    for attr in profile.get('attributes') or []:
        if attr.get('name') in LOCKED_ATTRS:
            perms = attr.setdefault('permissions', {})
            perms['edit'] = [r for r in (perms.get('edit') or []) if r != 'user'] or ['admin']


for realm in realms:
    url = f'{kc}/admin/realms/{urllib.parse.quote(realm, safe="")}/users/profile'
    try:
        profile = json.load(urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=10))
    except urllib.error.HTTPError as err:
        unreachable.append(f'{realm} (HTTP {err.code})')
        continue
    except Exception as err:
        unreachable.append(f'{realm} ({err})')
        continue
    before = problems(profile)
    if not before:
        print(f'  ✓ {realm}: locked')
        continue
    if mode == 'check':
        print(f'  ✗ {realm}: {"; ".join(before)}')
        wrong.append(realm)
        continue
    lock(profile)
    req = urllib.request.Request(url, method='PUT', data=json.dumps(profile).encode(),
                                 headers={**headers, 'Content-Type': 'application/json'})
    try:
        urllib.request.urlopen(req, timeout=10)
        after = json.load(urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=10))
    except Exception as err:
        unreachable.append(f'{realm} (update failed: {err})')
        continue
    left = problems(after)
    if left:
        unreachable.append(f'{realm} (still {"; ".join(left)} after update)')
        continue
    print(f'  ✓ {realm}: locked ({"; ".join(before)} → fixed)')

for u in unreachable:
    print(f'  ? {u}')
if unreachable:
    sys.exit(2)
if wrong:
    sys.exit(1)
print(f'  every realm ({len(realms)}) is locked')
PY
