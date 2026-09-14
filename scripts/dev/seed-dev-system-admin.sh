#!/usr/bin/env bash
# Seed ONE local SYSTEM_ADMIN account so the /admin panel can be signed into and captured.
#
# WHY THIS EXISTS. No seed anywhere created a SYSTEM_ADMIN: seed-realistic.ts and
# provision-keycloak-demo.ts cover eleven of the twelve roles, and the realm JSON defines the role only.
# §6.7 says the role "requires direct platform operator provisioning" — this is that, for a laptop.
#
# WHAT IT CREATES, AND WHY EACH PART (product-owner decision 2026-09-14, §6.7 implementation reading):
#   - a Keycloak user in $KEYCLOAK_REALM with tenant_id / user_id / role attributes, which the cos-web
#     and cos-backend mappers project into the JWT. The web client refuses a token with no tenant_id
#     (apps/web/src/lib/auth/options.ts), so the account carries the operator's HOME tenant;
#   - a platform.users row — platform.audit_logs.actor_id is a foreign key to it, and every SYSTEM_ADMIN
#     tenant action now writes an audit row, so without this row the account could not act at all;
#   - a SYSTEM_ADMIN tenant_memberships row — how findSystemAdmins() finds the §19.8 gate recipients.
#
# LOCAL ONLY. It refuses any Keycloak that is not on localhost / 127.0.0.1, and the password is a fixed
# dev literal for the same reason provision-keycloak-demo.ts gives: a capture script has to know it.
# No MFA: the realm's privileged-role OTP condition is ^(TENANT_ADMIN|FINANCE)$, which this role is
# not in (infrastructure/keycloak/realms/construction-os-realm.json).
#
# Idempotent: re-running updates the account in place.
#
# Requires: docker stack up (keycloak, cos-postgres) and seed-realistic.ts loaded (the EKC tenant).
# Run: bash scripts/dev/seed-dev-system-admin.sh
set -euo pipefail

KC=${KEYCLOAK_URL:-http://localhost:8090}
REALM=${KEYCLOAK_REALM:-construction-os-dev}
ADMIN_USER=${KEYCLOAK_ADMIN_USER:-admin}
ADMIN_PASS=${KEYCLOAK_ADMIN_PASSWORD:-cos_keycloak_admin}
HOME_TENANT_CODE=${COS_DEV_SYSADMIN_TENANT_CODE:-EKC}
EMAIL=${COS_DEV_SYSADMIN_EMAIL:-sysadmin@construction-os.dev}
PASSWORD=${COS_DEV_SYSADMIN_PASSWORD:-SysAdminDev@2026}
USERID=00000000-0000-4000-8000-00000000a0a0
NAME='Platform Operator'

case "$KC" in
  http://localhost:*|http://127.0.0.1:*) ;;
  *) echo "Refusing: $KC is not a local Keycloak. This account is for a laptop, never a deployment." >&2; exit 1 ;;
esac

PSQL=(docker exec -i cos-postgres psql -U cos -d construction_os -v ON_ERROR_STOP=1 -At)

TENANT=$("${PSQL[@]}" -c "SELECT tenant_id FROM platform.tenants WHERE tenant_code = '$HOME_TENANT_CODE' LIMIT 1")
if [ -z "$TENANT" ]; then
  echo "No tenant '$HOME_TENANT_CODE' — run seed-realistic.ts first, or set COS_DEV_SYSADMIN_TENANT_CODE." >&2
  exit 1
fi

TOKEN=$(curl -sf -X POST "$KC/realms/master/protocol/openid-connect/token" \
  -d client_id=admin-cli -d username="$ADMIN_USER" -d password="$ADMIN_PASS" -d grant_type=password \
  | python -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

ATTRS="{\"tenant_id\":[\"$TENANT\"],\"user_id\":[\"$USERID\"],\"role\":[\"SYSTEM_ADMIN\"]}"

curl -s -o /dev/null -w "  KC create %{http_code} (409 = already exists)\n" -X POST "$KC/admin/realms/$REALM/users" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"username\":\"$EMAIL\",\"email\":\"$EMAIL\",\"firstName\":\"Platform\",\"lastName\":\"Operator\",
       \"enabled\":true,\"emailVerified\":true,\"attributes\":$ATTRS}"

KCID=$(curl -sf "$KC/admin/realms/$REALM/users?username=$EMAIL&exact=true" \
  -H "Authorization: Bearer $TOKEN" | python -c "import sys,json;u=json.load(sys.stdin);print(u[0]['id'] if u else '')")
if [ -z "$KCID" ]; then
  echo "Keycloak user $EMAIL was not found after create." >&2
  exit 1
fi

# Attributes, profile and password are set even when the user pre-existed. No required actions: a
# pending one would stop the browser login at an interstitial the capture cannot answer. The PUT carries
# username + email because this Keycloak refuses a representation without them ("User name is missing",
# measured 2026-09-14): an update here is a full representation, not a patch.
curl -sf -o /dev/null -X PUT "$KC/admin/realms/$REALM/users/$KCID" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"username\":\"$EMAIL\",\"email\":\"$EMAIL\",\"firstName\":\"Platform\",\"lastName\":\"Operator\",\"attributes\":$ATTRS,\"emailVerified\":true,\"enabled\":true,\"requiredActions\":[]}"
curl -sf -o /dev/null -X PUT "$KC/admin/realms/$REALM/users/$KCID/reset-password" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"type\":\"password\",\"value\":\"$PASSWORD\",\"temporary\":false}"

"${PSQL[@]}" -q -c "
  INSERT INTO platform.users (user_id, tenant_id, keycloak_user_id, email, display_name, is_active, mfa_enabled)
  VALUES ('$USERID'::uuid, '$TENANT'::uuid, '$KCID', '$EMAIL', '$NAME', true, false)
  ON CONFLICT (user_id) DO UPDATE SET keycloak_user_id = EXCLUDED.keycloak_user_id, is_active = true;
  INSERT INTO platform.tenant_memberships (tenant_id, user_id, role)
  VALUES ('$TENANT'::uuid, '$USERID'::uuid, 'SYSTEM_ADMIN'::platform.\"CosRoleEnum\")
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role;" >/dev/null

echo "Done: $EMAIL (SYSTEM_ADMIN, home tenant $HOME_TENANT_CODE) in realm $REALM."
