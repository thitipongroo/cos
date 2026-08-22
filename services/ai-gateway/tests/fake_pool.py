"""Test double for an asyncpg pool that ALSO stands in for the connection.

Production code no longer queries the pool directly. Every statement now runs
through `db.tenant_scope.tenant_scoped()`:

    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(SET_TENANT_GUC, tenant_id)
            ...the real statement...

because `app_user` has no RLS bypass and the policy reads `app.current_tenant_id`
off the transaction (migration 20260623000002).

The fakes in this suite predate that shape. This mixin lets each keep its own
recording behaviour while satisfying the new call sequence:

* `acquire()` / `transaction()` are async context managers; `acquire()` yields the
  fake itself, so the fake's existing `fetch` / `fetchrow` / `fetchval` are what the
  code under test calls.
* the `set_config` statement is captured into `.tenant_guc` rather than appended to
  the fake's call list, so assertions written against the real queries keep their
  indices. Tests can then assert the tenant scope directly:
      assert pool.tenant_guc == "tenant-1"

A fake that wants to record `execute` calls overrides `_on_execute`, not `execute`.
"""

from db import SET_TENANT_GUC

_GUC_MARKER = "set_config('app.current_tenant_id'"


def is_tenant_guc(query: str) -> bool:
    """True when `query` is the RLS scope-setting statement, not a real statement."""
    return _GUC_MARKER in query


class _AsyncCtx:
    def __init__(self, value):
        self._value = value

    async def __aenter__(self):
        return self._value

    async def __aexit__(self, *_exc):
        return False


class TenantScopedPoolMixin:
    """Makes a fake pool usable as both the pool and the connection it hands out."""

    tenant_guc: str | None = None
    guc_calls: int = 0

    def acquire(self):
        return _AsyncCtx(self)

    def transaction(self):
        return _AsyncCtx(None)

    async def execute(self, query, *params):
        if is_tenant_guc(query):
            self.tenant_guc = params[0] if params else None
            self.guc_calls += 1
            return None
        return await self._on_execute(query, *params)

    async def _on_execute(self, query, *params):
        """Override to record real (non-GUC) execute calls."""
        return None


def asyncmock_pool(conn):
    """Wire an AsyncMock connection behind acquire()/transaction() like the real pool."""
    from unittest.mock import MagicMock

    real_execute = conn.execute

    async def _execute(query, *params):
        if is_tenant_guc(query):
            pool.tenant_guc = params[0] if params else None
            return None
        return await real_execute(query, *params)

    conn.execute = _execute
    conn.transaction = MagicMock(return_value=_AsyncCtx(None))
    pool = MagicMock()
    pool.tenant_guc = None
    pool.acquire = MagicMock(return_value=_AsyncCtx(conn))
    return pool


__all__ = ["SET_TENANT_GUC", "TenantScopedPoolMixin", "asyncmock_pool", "is_tenant_guc"]
