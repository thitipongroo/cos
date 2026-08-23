"""Unit tests for AI report persistence — Phase 12 ai.ai_generated_reports.

§35.13 ESC-24: reports/persistence.py sat at 50%. Both functions are pure SQL wiring, and both
carry details that only a test pins down: the INSERT must be schema-qualified with the enum and
jsonb casts intact (QM-4), and the history query must stay tenant- AND project-scoped — a dropped
predicate here leaks one tenant's generated reports to another.
"""

import json
import uuid

import pytest

from reports.persistence import fetch_report_history, persist_report


class _FakePool:
    def __init__(self, rows=None):
        self.executed: list[tuple] = []
        self.fetched: list[tuple] = []
        self._rows = rows or []

    async def execute(self, query, *args):
        self.executed.append((query, args))

    async def fetch(self, query, *args):
        self.fetched.append((query, args))
        return self._rows


class TestPersistReport:
    @pytest.mark.asyncio
    async def test_returns_a_fresh_report_id_and_binds_it(self):
        pool = _FakePool()

        report_id = await persist_report(
            pool,
            tenant_id="t1",
            project_id="p1",
            report_type="WEEKLY_SUMMARY",
            content={"headline": "on track"},
            confidence=0.88,
            model_used="gpt-4o-mini",
            tokens_used=1234,
            generated_by="u1",
        )

        uuid.UUID(report_id)  # must be a real uuid, not an arbitrary string
        assert pool.executed[0][1][0] == report_id

    @pytest.mark.asyncio
    async def test_insert_is_schema_qualified_and_keeps_its_casts(self):
        pool = _FakePool()

        await persist_report(
            pool, "t1", "p1", "WEEKLY_SUMMARY", {"a": 1}, 0.5, "m", 10, "u1"
        )

        query, _args = pool.executed[0]
        assert "ai.ai_generated_reports" in query  # QM-4
        assert "::ai.report_type_enum" in query
        assert "::jsonb" in query

    @pytest.mark.asyncio
    async def test_content_is_serialised_as_json(self):
        pool = _FakePool()
        content = {"headline": "งานล่าช้า", "risks": ["weather"]}

        await persist_report(pool, "t1", "p1", "WEEKLY_SUMMARY", content, 0.5, "m", 10, "u1")

        bound = pool.executed[0][1][4]
        assert isinstance(bound, str)
        assert json.loads(bound) == content

    @pytest.mark.asyncio
    async def test_binds_every_column_in_order(self):
        pool = _FakePool()

        await persist_report(
            pool, "t9", "p9", "RISK_BRIEF", {"k": "v"}, 0.42, "claude-sonnet-5", 999, "u9"
        )

        args = pool.executed[0][1]
        assert len(args) == 9
        assert args[1:4] == ("t9", "p9", "RISK_BRIEF")
        assert args[5:] == (0.42, "claude-sonnet-5", 999, "u9")

    @pytest.mark.asyncio
    async def test_each_call_gets_a_distinct_report_id(self):
        pool = _FakePool()
        first = await persist_report(pool, "t", "p", "R", {}, 0.1, "m", 1, "u")
        second = await persist_report(pool, "t", "p", "R", {}, 0.1, "m", 1, "u")
        assert first != second


class TestFetchReportHistory:
    @pytest.mark.asyncio
    async def test_scopes_by_tenant_and_project_and_orders_newest_first(self):
        pool = _FakePool(rows=[])

        await fetch_report_history(pool, "t1", "p1")

        query, args = pool.fetched[0]
        assert "ai.ai_generated_reports" in query  # QM-4
        assert "tenant_id = $1" in query
        assert "project_id = $2" in query
        assert "ORDER BY generated_at DESC" in query
        assert args == ("t1", "p1", 20)

    @pytest.mark.asyncio
    async def test_default_limit_is_20(self):
        pool = _FakePool(rows=[])
        await fetch_report_history(pool, "t1", "p1")
        assert pool.fetched[0][1][2] == 20

    @pytest.mark.asyncio
    async def test_an_explicit_limit_is_forwarded(self):
        pool = _FakePool(rows=[])
        await fetch_report_history(pool, "t1", "p1", limit=5)
        assert pool.fetched[0][1][2] == 5

    @pytest.mark.asyncio
    async def test_rows_are_returned_as_plain_dicts(self):
        rows = [
            {"report_id": "r1", "report_type": "WEEKLY_SUMMARY", "confidence": 0.9},
            {"report_id": "r2", "report_type": "RISK_BRIEF", "confidence": 0.7},
        ]
        pool = _FakePool(rows=rows)

        got = await fetch_report_history(pool, "t1", "p1")

        assert got == rows
        assert all(isinstance(r, dict) for r in got)

    @pytest.mark.asyncio
    async def test_no_history_yields_an_empty_list(self):
        assert await fetch_report_history(_FakePool(rows=[]), "t1", "p1") == []
