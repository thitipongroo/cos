#!/usr/bin/env bash
# ADR-106 readiness: does every platform account's keycloak_user_id exist as a user id in its tenant's realm?
#
# WHY. Since ADR-106, KeycloakJwtStrategy refuses a token whose `sub` is not the keycloak_user_id of the account
# its claims name. An account whose stored id is wrong — a placeholder, a stale id from a recreated Keycloak
# user — can no longer sign in. This is the measurement to run against an environment BEFORE relying on the
# `s1.identity.subject-binding` switch there. On the local stack on 2026-09-14 it found 14 of 14.
#
# WHAT IT COMPARES — the property the strategy enforces, in both directions (Rule 41 review, 2026-09-14):
#   1. every Keycloak user carrying a `user_id` attribute: the platform.users row that attribute names must
#      carry THAT Keycloak user's id as keycloak_user_id (a re-created user with copied attributes fails here);
#   2. every platform.users row of an active tenant, active or not (with the ADR-077 switch OFF an inactive
#      account still authenticates): its keycloak_user_id must be a user in its tenant's realm.
# It reads; it changes nothing. The admin password is sent on stdin, never as a process argument.
#
# Usage:
#   PSQL_URL=postgresql://... KEYCLOAK_URL=http://localhost:8090 #   KEYCLOAK_ADMIN_USER=admin KEYCLOAK_ADMIN_PASSWORD=... #   bash scripts/readiness/check-keycloak-subject-binding.sh
# Exit 0 when every account matches; 1 when any does not (each listed); 2 when it could not measure —
# including a realm it could not read.
set -euo pipefail

: "${PSQL_URL:?PSQL_URL is required (a connection string that can read platform.users and platform.tenants)}"
KC=${KEYCLOAK_URL:-http://localhost:8090}
ADMIN_USER=${KEYCLOAK_ADMIN_USER:-admin}
: "${KEYCLOAK_ADMIN_PASSWORD:?KEYCLOAK_ADMIN_PASSWORD is required}"

command -v psql >/dev/null || { echo "psql not found" >&2; exit 2; }

TOKEN=$(printf '%s' "$KEYCLOAK_ADMIN_PASSWORD" \
  | curl -sf -X POST "$KC/realms/master/protocol/openid-connect/token" -d client_id=admin-cli \
      --data-urlencode "username=$ADMIN_USER" --data-urlencode "password@-" -d grant_type=password \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])") || { echo "Keycloak admin login failed" >&2; exit 2; }

ACCOUNTS=$(mktemp)
trap 'rm -f "$ACCOUNTS"' EXIT
psql "$PSQL_URL" -At -F '|' -c "
  SELECT t.keycloak_realm, u.user_id, u.keycloak_user_id
    FROM platform.users u JOIN platform.tenants t USING (tenant_id)
   WHERE t.is_active
   ORDER BY 1" > "$ACCOUNTS" || { echo "database read failed" >&2; exit 2; }

PYTHONIOENCODING=utf-8 KC="$KC" TOKEN="$TOKEN" python3 - "$ACCOUNTS" <<'PY'
import json, os, sys, urllib.parse, urllib.request
kc, token = os.environ['KC'], os.environ['TOKEN']
rows = [l.rstrip('\n').split('|') for l in open(sys.argv[1], encoding='utf-8') if l.strip()]
by_user_id = {r[1]: r for r in rows}
kc_users, unreadable = {}, []
for realm in sorted({r[0] for r in rows}):
    users, first = [], 0
    try:
        while True:
            req = urllib.request.Request(
                f'{kc}/admin/realms/{urllib.parse.quote(realm, safe="")}/users?first={first}&max=500&briefRepresentation=false',
                headers={'Authorization': f'Bearer {token}'})
            page = json.load(urllib.request.urlopen(req))
            users += page
            if len(page) < 500:
                break
            first += 500
        kc_users[realm] = users
    except Exception as err:
        unreadable.append(f'{realm} ({err})')

findings = []
for realm, users in kc_users.items():
    ids = {u['id'] for u in users}
    for u in users:
        for claimed in (u.get('attributes') or {}).get('user_id', []):
            row = by_user_id.get(claimed)
            if row is not None and row[2] != u['id']:
                findings.append(f'{realm}: Keycloak user {u["id"]} names platform user {claimed}, whose keycloak_user_id is {row[2]}')
    for r_realm, user_id, kc_id in rows:
        if r_realm == realm and kc_id not in ids:
            findings.append(f'{realm}: platform user {user_id} has keycloak_user_id {kc_id}, which is not a user in that realm')

checked = sum(1 for r in rows if r[0] in kc_users)
print(f'  accounts checked: {checked} of {len(rows)} · realms: {len(kc_users)} read, {len(unreadable)} unreadable')
for f in findings:
    print(f'  ✗ {f}')
for u in unreadable:
    print(f'  ? realm not readable: {u}')
if unreadable:
    sys.exit(2)
if findings:
    sys.exit(1)
print('  ✓ every account would pass ADR-106 subject binding')
PY
