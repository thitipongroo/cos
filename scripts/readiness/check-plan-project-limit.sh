#!/usr/bin/env bash
# ADR-109 readiness: which tenants already run more active projects than their plan allows?
#
# WHY. With `s1.project.plan-project-limit` on, POST /projects refuses with COS-PLAN-001 once a tenant has as many
# DRAFT / ACTIVE / ON_HOLD projects as its plan allows (§26.1). A tenant that is ALREADY over the limit keeps every
# project — nothing is closed — but cannot create another until it is under. Run this against an environment BEFORE
# turning the flag on there, and settle each listed tenant with its customer first (product owner, 2026-11-01).
#
# The limits below must match PLAN_PROJECT_LIMIT in backend/src/modules/tenant/public/plan-limits.ts; the unit
# test beside that file (plan-limits.spec.ts) reads this script and fails when they drift. ENTERPRISE has no limit and is never listed.
#
# It reads; it changes nothing. It prints tenant codes and counts only — no names, no personal data.
#
# Usage:
#   PSQL_URL=postgresql://... bash scripts/readiness/check-plan-project-limit.sh
# Exit 0 when no active tenant is at or over its limit; 1 when any is (each listed — AT the limit means the
# next create is refused); 2 when it could not measure.
set -euo pipefail

: "${PSQL_URL:?PSQL_URL is required (a privileged connection that can read platform.tenants and projects.projects)}"
command -v psql >/dev/null || { echo "psql not found" >&2; exit 2; }

ROWS=$(psql "$PSQL_URL" -v ON_ERROR_STOP=1 -At -F '|' -c "
  WITH limits(plan_type, project_limit) AS (
    VALUES ('LITE', 1), ('STARTER', 3), ('PROFESSIONAL', 10)
  )
  SELECT t.tenant_code, t.plan_type::text, l.project_limit,
         count(p.project_id)::int AS active_projects
    FROM platform.tenants t
    JOIN limits l ON l.plan_type = t.plan_type::text
    LEFT JOIN projects.projects p
      ON p.tenant_id = t.tenant_id
     AND p.status::text IN ('DRAFT', 'ACTIVE', 'ON_HOLD')
   WHERE t.is_active
   GROUP BY t.tenant_code, t.plan_type, l.project_limit
  HAVING count(p.project_id) >= l.project_limit
   ORDER BY count(p.project_id) - l.project_limit DESC, t.tenant_code") || {
  echo "database read failed" >&2
  exit 2
}

if [[ -z "$ROWS" ]]; then
  echo "OK — no active tenant is at or over its plan's active-project limit."
  exit 0
fi

printf '%-30s %-14s %5s %7s  %s\n' TENANT_CODE PLAN LIMIT ACTIVE STATE
while IFS='|' read -r code plan limit active; do
  if (( active > limit )); then state="OVER by $((active - limit)) — cannot create until under"; else state="AT limit — next create refused"; fi
  printf '%-30s %-14s %5s %7s  %s\n' "$code" "$plan" "$limit" "$active" "$state"
done <<< "$ROWS"
exit 1
