"""Tenant-scoped database access for ai-gateway (ADR-031; master:1843-1857).

ai-gateway connects as `app_user`, a NON-superuser with no RLS bypass. Every
tenant-scoped table carries exactly one policy:

    CREATE POLICY rls_tenant_isolation ON <schema>.<table>
      AS PERMISSIVE FOR ALL TO app_user
      USING      (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid)
      WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid)

(migration 20260623000002_consolidate_rls_single_permissive)

With the GUC unset, `NULLIF(...)` is NULL, so the predicate is NULL rather than
true: a SELECT returns zero rows and an INSERT is refused by WITH CHECK. The GUC
must therefore be set on the SAME connection, inside the SAME transaction, as the
statement it protects — which is what this helper guarantees.

`is_local=true` scopes the setting to the transaction, so it reverts on COMMIT or
ROLLBACK. That is what makes PgBouncer transaction pooling safe (QM-18): the next
statement to reuse the server connection cannot inherit this tenant's value.

master §Never — the application-layer `WHERE tenant_id = $1` filter that these
callers also carry is SECONDARY defence-in-depth, never a replacement for RLS.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import asyncpg

SET_TENANT_GUC = "SELECT set_config('app.current_tenant_id', $1, true)"


@asynccontextmanager
async def tenant_scoped(pool: asyncpg.Pool, tenant_id: str) -> AsyncIterator[asyncpg.Connection]:
    """Yield a connection inside a transaction with `app.current_tenant_id` set.

    Usage:
        async with tenant_scoped(pool, tenant_id) as conn:
            await conn.execute(...)
    """
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(SET_TENANT_GUC, tenant_id)
            yield conn
