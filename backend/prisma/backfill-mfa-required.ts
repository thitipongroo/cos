// One-off backfill for ADR-110 round 5: give every account whose EFFECTIVE roles include TENANT_ADMIN or FINANCE the
// Keycloak user attribute `mfa_required=true`, so the realm asks it for OTP even when the privileged role is an
// ADDITIONAL one (which the `role` attribute does not carry). UserService keeps the attribute current from now on;
// this catches the accounts that existed before.
//
// D18 (round 6): a phone-only account (no email) whose privileged role is an ADDITIONAL one is skipped — the attribute
// would get it refused on Direct Grant, its only way in (`mfaRequiredFor`). The run prints how many it skipped.
//
// DRY RUN BY DEFAULT — it lists what it would change. `--apply` writes. Idempotent: setting the attribute on an account
// that already has it changes nothing. It never removes the attribute (removal happens through UserService when a
// role is taken away). It prints user ids and realms only — no names, emails or phones.
//
// Order in an environment (docs/runbooks/mfa-enforcement.md, Step 4): deploy the backend, run this with --apply
// FIRST, then import the realm change that reads `mfa_required`, then verify, and only then consider
// `s1.identity.additional-role-mfa`. The other way round, a primary TENANT_ADMIN / FINANCE without the attribute is
// not asked for OTP between the realm import and the backfill (measured locally: Direct Grant 200).
// Exit 0 = done, 1 = some accounts failed (listed; re-run), 2 = the run crashed.
//
// Run: DATABASE_URL=<pg url> KEYCLOAK_URL=<keycloak url> KEYCLOAK_ADMIN_CLIENT_SECRET=<secret> \
//      pnpm exec ts-node prisma/backfill-mfa-required.ts [--apply]
import './load-root-env';
import { createPrismaClient } from '../src/shared/prisma/create-prisma-client';
import { KeycloakAdminService } from '../src/modules/identity/keycloak-admin.service';
import { mfaRequiredFor } from '../src/shared/guards/mfa-enforcement';

const apply = process.argv.includes('--apply');
const prisma = createPrismaClient();

interface Holder {
  user_id: string;
  keycloak_user_id: string;
  keycloak_realm: string;
  role: string;
  email: string;
  additional: string[];
}

async function main(): Promise<void> {
  const holders = await prisma.$queryRaw<Holder[]>`
    SELECT u.user_id::text AS user_id, u.keycloak_user_id, t.keycloak_realm, m.role::text AS role, u.email,
           COALESCE(array_agg(r.role::text) FILTER (WHERE r.role IS NOT NULL), '{}') AS additional
      FROM platform.users u
      JOIN platform.tenants t ON t.tenant_id = u.tenant_id AND t.is_active
      JOIN platform.tenant_memberships m ON m.tenant_id = u.tenant_id AND m.user_id = u.user_id
      LEFT JOIN platform.user_additional_roles r ON r.tenant_id = u.tenant_id AND r.user_id = u.user_id
     WHERE u.is_active
     GROUP BY u.user_id, u.keycloak_user_id, t.keycloak_realm, m.role, u.email
    HAVING m.role::text IN ('TENANT_ADMIN', 'FINANCE')
        OR coalesce(bool_or(r.role::text IN ('TENANT_ADMIN', 'FINANCE')), false)
     ORDER BY t.keycloak_realm, user_id
  `;
  const targets = holders.filter((h) => mfaRequiredFor(h.role, h.additional, h.email));
  console.log(`${holders.length} account(s) hold TENANT_ADMIN or FINANCE (primary or additional)`);
  console.log(
    `${holders.length - targets.length} skipped: no email and the privileged role is an additional one (D18)`,
  );

  const keycloak = new KeycloakAdminService();
  let done = 0;
  let failed = 0;
  for (const t of targets) {
    if (!apply) {
      console.log(`  would set mfa_required  ${t.keycloak_realm}  ${t.user_id}`);
      continue;
    }
    try {
      await keycloak.syncMfaRequired(t.keycloak_user_id, t.keycloak_realm, true);
      done += 1;
      console.log(`  set mfa_required        ${t.keycloak_realm}  ${t.user_id}`);
    } catch (err) {
      failed += 1;
      console.error(
        `  FAILED                  ${t.keycloak_realm}  ${t.user_id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  if (!apply) console.log('dry run — nothing written; re-run with --apply');
  else console.log(`${done} set, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 2;
  })
  .finally(() => prisma.$disconnect());
