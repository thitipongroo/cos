#!/usr/bin/env bash
# Seed the 8 role-specific Keycloak users that the web E2E specs (tests/e2e/specs/*.ts) log in as.
# Without these, loginViaKeycloak() cannot authenticate the role and the spec skips.
#
# Creates each user in the `construction-os` realm (idempotent) with password E2eTestPass123!,
# the tenant_id / user_id / role attributes the JWT mappers project into the token, and the
# matching platform.users + platform.tenant_memberships rows so the backend resolves the account.
#
# Requires: full docker stack up (keycloak :8090, postgres). Run: bash scripts/dev/seed-e2e-users.sh
set -euo pipefail

KC=http://localhost:8090
REALM=construction-os
ADMIN_USER=${KEYCLOAK_ADMIN_USER:-admin}
ADMIN_PASS=${KEYCLOAK_ADMIN_PASSWORD:-cos_keycloak_admin}
TENANT=00000000-0000-4000-8000-000000000001
PASSWORD=E2eTestPass123!

TOKEN=$(curl -s -X POST "$KC/realms/master/protocol/openid-connect/token" \
  -d client_id=admin-cli -d username="$ADMIN_USER" -d password="$ADMIN_PASS" -d grant_type=password \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

# email | role | user_id (deterministic) | display name
USERS=(
  "e2e-admin@construction-os.io|TENANT_ADMIN|00000000-0000-4000-8000-0000000000a1|E2E Admin"
  "e2e-exec@construction-os.io|EXECUTIVE|00000000-0000-4000-8000-0000000000a2|E2E Executive"
  "e2e-pm@construction-os.io|PROJECT_MANAGER|00000000-0000-4000-8000-0000000000a3|E2E Project Manager"
  "e2e-finance@construction-os.io|FINANCE|00000000-0000-4000-8000-0000000000a4|E2E Finance"
  "e2e-procurement@construction-os.io|PROCUREMENT_OFFICER|00000000-0000-4000-8000-0000000000a5|E2E Procurement"
  "e2e-safety@construction-os.io|SAFETY_OFFICER|00000000-0000-4000-8000-0000000000a6|E2E Safety"
  "e2e-inspector@construction-os.io|SITE_ENGINEER|00000000-0000-4000-8000-0000000000a7|E2E Inspector"
  "e2e-engineer@construction-os.io|SITE_ENGINEER|00000000-0000-4000-8000-0000000000a8|E2E Engineer"
)

for row in "${USERS[@]}"; do
  IFS='|' read -r EMAIL ROLE USERID NAME <<< "$row"

  # Create the Keycloak user (ignore 409 if it already exists), then fetch its id.
  curl -s -o /dev/null -w "  KC create %{http_code} $EMAIL\n" -X POST "$KC/admin/realms/$REALM/users" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -d "{\"username\":\"$EMAIL\",\"email\":\"$EMAIL\",\"firstName\":\"$NAME\",\"enabled\":true,\"emailVerified\":true,
         \"attributes\":{\"tenant_id\":[\"$TENANT\"],\"user_id\":[\"$USERID\"],\"role\":[\"$ROLE\"]},
         \"credentials\":[{\"type\":\"password\",\"value\":\"$PASSWORD\",\"temporary\":false}]}" || true

  KCID=$(curl -s "$KC/admin/realms/$REALM/users?username=$EMAIL&exact=true" \
    -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json;u=json.load(sys.stdin);print(u[0]['id'] if u else '')")

  # Ensure attributes + password are set even if the user pre-existed without them.
  curl -s -o /dev/null -X PUT "$KC/admin/realms/$REALM/users/$KCID" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -d "{\"attributes\":{\"tenant_id\":[\"$TENANT\"],\"user_id\":[\"$USERID\"],\"role\":[\"$ROLE\"]},\"emailVerified\":true,\"enabled\":true}"
  curl -s -o /dev/null -X PUT "$KC/admin/realms/$REALM/users/$KCID/reset-password" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -d "{\"type\":\"password\",\"value\":\"$PASSWORD\",\"temporary\":false}"

  # Matching platform rows (superuser insert; RLS-exempt).
  docker exec -i cos-postgres psql -U cos -d construction_os -q -c "
    INSERT INTO platform.users (user_id, tenant_id, keycloak_user_id, email, display_name, is_active, mfa_enabled)
    VALUES ('$USERID'::uuid, '$TENANT'::uuid, '$KCID'::uuid, '$EMAIL', '$NAME', true, false)
    ON CONFLICT (user_id) DO UPDATE SET keycloak_user_id = EXCLUDED.keycloak_user_id;
    INSERT INTO platform.tenant_memberships (tenant_id, user_id, role)
    VALUES ('$TENANT'::uuid, '$USERID'::uuid, '$ROLE'::platform.\"CosRoleEnum\")
    ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role;" >/dev/null
  echo "  platform rows OK: $EMAIL ($ROLE)"
done
echo "Done: 8 e2e role users seeded."

# ── SITE_ENGINEER phone/OTP user for the offline-inspection Detox spec ────────
# The inspections tab is SITE_ENGINEER-only, but the seeded phone users are SITE_WORKER/PM, so the
# spec logs in as this dedicated SITE_ENGINEER (OTP path). Created via the Admin API (phone username).
SE_PHONE='+66800000004'; SE_USERID='00000000-0000-4000-8000-000000000014'
SE_KCID=$(curl -s "$KC/admin/realms/$REALM/users?username=%2B66800000004&exact=true" -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json;u=json.load(sys.stdin);print(u[0]['id'] if u else '')")
if [ -z "$SE_KCID" ]; then
  curl -s -o /dev/null -X POST "$KC/admin/realms/$REALM/users" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -d "{\"username\":\"$SE_PHONE\",\"firstName\":\"E2E Inspector\",\"enabled\":true,\"emailVerified\":true,\"attributes\":{\"tenant_id\":[\"$TENANT\"],\"user_id\":[\"$SE_USERID\"],\"role\":[\"SITE_ENGINEER\"],\"phone_number\":[\"$SE_PHONE\"]}}"
  SE_KCID=$(curl -s "$KC/admin/realms/$REALM/users?username=%2B66800000004&exact=true" -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json;u=json.load(sys.stdin);print(u[0]['id'] if u else '')")
fi
docker exec -i cos-postgres psql -U cos -d construction_os -q -c "
  INSERT INTO platform.users (user_id, tenant_id, keycloak_user_id, email, display_name, phone_number, is_active, mfa_enabled)
  VALUES ('$SE_USERID'::uuid,'$TENANT'::uuid,'$SE_KCID'::uuid,'e2e-inspector-phone@devtenant.co.th','E2E Inspector','$SE_PHONE',true,false)
  ON CONFLICT (user_id) DO UPDATE SET keycloak_user_id=EXCLUDED.keycloak_user_id;
  INSERT INTO platform.tenant_memberships (tenant_id,user_id,role) VALUES ('$TENANT'::uuid,'$SE_USERID'::uuid,'SITE_ENGINEER'::platform.\"CosRoleEnum\")
  ON CONFLICT (tenant_id,user_id) DO UPDATE SET role=EXCLUDED.role;" >/dev/null
echo "  SITE_ENGINEER phone user OK: $SE_PHONE"
