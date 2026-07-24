// APP_DATABASE_URL — the non-superuser (`app_user`) PostgreSQL connection.
//
// Tenant-scoped queries MUST connect as this app role so PostgreSQL Row Level Security is actually
// enforced. The bootstrap DATABASE_URL role (`cos`) is a superuser and BYPASSES RLS even under
// FORCE ROW LEVEL SECURITY (spec §7.7, QM-18, ADR-008). A missing APP_DATABASE_URL must therefore
// fail loudly — never silently fall back to the RLS-bypassing superuser role, which would turn the
// entire platform's tenant isolation into app-layer `WHERE tenant_id` filters with no DB backstop.

export function appDatabaseUrl(): string {
  const url = process.env['APP_DATABASE_URL'];
  if (!url) {
    throw new Error(
      'APP_DATABASE_URL is not set. Tenant-scoped queries must connect as the non-superuser app ' +
        'role so PostgreSQL RLS is enforced (spec §7.7, QM-18). Refusing to fall back to the ' +
        'RLS-bypassing DATABASE_URL superuser role.',
    );
  }
  return url;
}
