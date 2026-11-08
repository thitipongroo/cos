#!/usr/bin/env bash
# ADR-110 round 3 readiness: which accounts ALREADY hold TENANT_ADMIN or FINANCE without an email?
#
# WHY. TENANT_ADMIN and FINANCE sign in by Path B only — email + password + MFA (§5.4.4). An account with no email (a
# phone-only Path A account) holding either role can use neither path. changeRole has refused that promotion since
# TDD OQ-11; setUserRoles (primary or additional role) and createUser (a phone number with either role) did not
# until 2026-11-03. This lists the accounts already in that state, in ACTIVE tenants, for the product owner to
# settle with each tenant (give the person a Path B account, or take the role away). Such an account does not count as
# the tenant's administrator (ADR-110). "No email" is `btrim(email) = ''`, the same test tenant-admins.ts uses.
#
# It reads; it changes nothing. It prints tenant codes, user ids and role names only — no names, phones or emails.
#
# Usage:
#   PSQL_URL=postgresql://... bash scripts/readiness/check-path-b-roles.sh
# Exit 0 when no active account is affected; 1 when any is (each listed); 2 when it could not measure.
set -euo pipefail

: "${PSQL_URL:?PSQL_URL is required (a privileged connection that can read platform.*)}"
command -v psql >/dev/null || { echo "psql not found" >&2; exit 2; }

# The query between the markers is also run by backend/test/provisioning/04-tenant-admin-bootstrap.integration.spec.ts
# against a real database — keep the markers.
QUERY=$(cat <<'SQL'
-- BEGIN QUERY
SELECT t.tenant_code, u.user_id::text, r.role
  FROM platform.users u
  JOIN platform.tenants t ON t.tenant_id = u.tenant_id AND t.is_active
  JOIN (
        SELECT tenant_id, user_id, role::text AS role FROM platform.tenant_memberships
         UNION
        SELECT tenant_id, user_id, role::text AS role FROM platform.user_additional_roles
       ) r ON r.tenant_id = u.tenant_id AND r.user_id = u.user_id
 WHERE u.is_active
   AND btrim(u.email) = ''
   AND r.role IN ('TENANT_ADMIN', 'FINANCE')
 ORDER BY t.tenant_code, u.user_id, r.role
-- END QUERY
SQL
)

# -X: ignore the operator's ~/.psqlrc (\timing and the like would add lines to ROWS). Fields are separated by the
# ASCII unit separator, which no tenant code, uuid or role name contains.
SEP=$'\x1f'
ROWS=$(psql "$PSQL_URL" -X -q -v ON_ERROR_STOP=1 -At -F "$SEP" -c "$QUERY") || {
  echo "database read failed" >&2
  exit 2
}

if [[ -z "$ROWS" ]]; then
  echo "OK — no active account holds TENANT_ADMIN or FINANCE without an email."
  exit 0
fi

printf '%-30s %-38s %s\n' TENANT_CODE USER_ID ROLE
while IFS="$SEP" read -r code user role; do
  printf '%-30s %-38s %s\n' "$code" "$user" "$role"
done <<< "$ROWS"
exit 1
