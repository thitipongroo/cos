"""Deterministic context assembly for SITE / PROCUREMENT / EXECUTIVE (master:3984, 3989, 3994).

Until 2026-08-29 these three reports reached the LLM with an EMPTY context string, so none of the
inputs master specifies for them was ever in front of the model. The pure `build_*` renderers carry
the unit gate here, exactly as risk/context.py's `build_context` does; the fetchers run against a
fake connection so the SQL shape — tenant predicate, window, join, status sets — is asserted without
a database.
"""

import sys
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest

from reports.context import executive as ex
from reports.context import procurement as proc
from reports.context import site


class _FakeConn:
    """Records every statement and answers from a queue of rows."""

    def __init__(self, rows):
        self.rows = list(rows)
        self.sql = []

    async def fetchrow(self, query, *args):
        self.sql.append((query, args))
        return self.rows.pop(0)

    async def execute(self, *_a, **_k):
        return None


class _FakeScope:
    def __init__(self, conn):
        self.conn = conn

    async def __aenter__(self):
        return self.conn

    async def __aexit__(self, *_):
        return False


def _patch_scope(monkeypatch, module, conn):
    monkeypatch.setattr(module, "tenant_scoped", lambda pool, tenant_id: _FakeScope(conn))


SITE_SIGNALS = {
    "reports_submitted": 5,
    "reports_draft": 1,
    "open_issues": 3,
    "high_issues": 2,
    "worker_days": 48,
    "hours": Decimal("384.00"),
    "trades": 4,
}

PROC_SIGNALS = {
    "open_rfqs": 2,
    "closing_soon": 1,
    "pending_delivery": 7,
    "late_pos": 3,
    "disputed_pos": 0,
    "overdue_invoices": 4,
    "overdue_amount": Decimal("125000.00"),
    "currency": "THB",
}


class TestSiteContext:
    def test_renders_every_input_master_names(self):
        text = site.build_site_context(SITE_SIGNALS)
        assert "5 submitted in the last 7 days" in text
        assert "1 still in draft" in text
        assert "3 open, of which 2 are high or critical" in text
        assert "48 worker-days across 4 trades" in text

    def test_says_outright_when_no_reports_were_filed(self):
        # The case that matters most and the easiest to omit: an empty window and a quiet site look
        # identical to the model. Without this line a summary reads "no issues reported" as calm.
        text = site.build_site_context({**SITE_SIGNALS, "reports_submitted": 0})
        assert "absence of reports is NOT evidence" in text

    def test_no_such_line_when_reports_exist(self):
        assert "absence of reports" not in site.build_site_context(SITE_SIGNALS)

    def test_the_window_is_the_seven_days_master_fixes(self):
        # master:3984. A caller's free-text `date_range` must not be able to widen the query.
        assert site.REPORT_WINDOW_DAYS == 7

    @pytest.mark.asyncio
    async def test_fetch_scopes_by_tenant_window_and_project(self, monkeypatch):
        conn = _FakeConn(
            [
                {"submitted": 5, "draft": 1},
                {"open_count": 3, "high_count": 2},
                {"worker_days": 48, "hours": Decimal("384.00"), "trades": 4},
            ]
        )
        _patch_scope(monkeypatch, site, conn)
        signals = await site.fetch_site_signals(object(), "t-1", "p-1")
        assert signals == SITE_SIGNALS

        reports_sql, manpower_sql = conn.sql[0][0], conn.sql[2][0]
        assert "tenant_id = $1" in reports_sql
        assert "INTERVAL '7 days'" in reports_sql
        # manpower_logs has no project_id — the scope has to come from the join, and a missing join
        # would silently count every project's workers.
        assert "JOIN site_ops.site_reports" in manpower_sql
        assert "r.project_id = $2" in manpower_sql
        assert all(args == ("t-1", "p-1") for _, args in conn.sql)

    @pytest.mark.asyncio
    async def test_assemble_renders_what_it_fetched(self, monkeypatch):
        conn = _FakeConn(
            [
                {"submitted": 0, "draft": 0},
                {"open_count": 0, "high_count": 0},
                {"worker_days": 0, "hours": 0, "trades": 0},
            ]
        )
        _patch_scope(monkeypatch, site, conn)
        assert "absence of reports" in await site.assemble_site_context(object(), "t", "p")


class TestProcurementContext:
    def test_renders_every_input_master_names(self):
        text = proc.build_procurement_context(PROC_SIGNALS)
        assert "2 open, of which 1 close within 7 days" in text
        assert "7 awaiting delivery, 3 of them past their delivery date" in text
        assert "4 overdue (total 125000.00 THB)" in text

    def test_names_the_missing_currency_rather_than_printing_none(self):
        # Mixed currencies leave `currency` NULL. "total 125000.00 None" would read as a figure.
        text = proc.build_procurement_context({**PROC_SIGNALS, "currency": None})
        assert "unspecified currency" in text and "None" not in text

    def test_disputes_are_reported_separately_when_present(self):
        text = proc.build_procurement_context({**PROC_SIGNALS, "disputed_pos": 2})
        assert "2 purchase orders are in DISPUTED state" in text

    def test_no_dispute_line_when_there_are_none(self):
        assert "DISPUTED" not in proc.build_procurement_context(PROC_SIGNALS)

    def test_status_sets_exclude_terminal_states(self):
        # The definitions are the whole content of "open" / "pending" / "overdue". A terminal status
        # leaking into one of these counts finished work as outstanding.
        assert "AWARDED" not in proc.OPEN_RFQ_STATUSES
        assert "CANCELLED" not in proc.OPEN_RFQ_STATUSES
        assert "DRAFT" not in proc.OPEN_RFQ_STATUSES
        assert "FULLY_DELIVERED" not in proc.PENDING_DELIVERY_STATUSES
        assert "PAID" not in proc.PENDING_DELIVERY_STATUSES
        # DISPUTED is counted on its own line, never as "pending" or "overdue".
        assert "DISPUTED" not in proc.PENDING_DELIVERY_STATUSES
        assert "DISPUTED" not in proc.UNSETTLED_INVOICE_STATUSES
        assert "PAID" not in proc.UNSETTLED_INVOICE_STATUSES

    @pytest.mark.asyncio
    async def test_fetch_joins_invoices_through_their_po(self, monkeypatch):
        conn = _FakeConn(
            [
                {"open_count": 2, "closing_soon": 1},
                {"pending": 7, "late": 3, "disputed": 0},
                {"overdue_count": 4, "overdue_amount": Decimal("125000.00"), "currency": "THB"},
            ]
        )
        _patch_scope(monkeypatch, proc, conn)
        assert await proc.fetch_procurement_signals(object(), "t-1", "p-1") == PROC_SIGNALS

        invoice_sql = conn.sql[2][0]
        # invoices has no project_id column; without the join this counts the whole tenant.
        assert "JOIN procurement.purchase_orders" in invoice_sql
        assert "po.project_id = $2" in invoice_sql
        assert "i.due_date < CURRENT_DATE" in invoice_sql

    @pytest.mark.asyncio
    async def test_assemble_renders_what_it_fetched(self, monkeypatch):
        conn = _FakeConn(
            [
                {"open_count": 0, "closing_soon": 0},
                {"pending": 0, "late": 0, "disputed": 1},
                {"overdue_count": 0, "overdue_amount": 0, "currency": None},
            ]
        )
        _patch_scope(monkeypatch, proc, conn)
        assert "DISPUTED" in await proc.assemble_procurement_context(object(), "t", "p")


BUDGET = {
    "total": Decimal("1000000"),
    "currency": "THB",
    "allocated": Decimal("900000"),
    "committed": Decimal("400000"),
    "actual": Decimal("1100000"),
    "threshold": Decimal("10.00"),
}


class TestExecutiveContext:
    def test_reports_health_plus_both_operational_summaries(self):
        text = ex.build_executive_context(BUDGET, SITE_SIGNALS, PROC_SIGNALS)
        assert "variance +10.0%" in text
        assert "Site reports:" in text and "RFQs:" in text

    def test_underspend_shows_a_negative_variance(self):
        text = ex.build_executive_context({**BUDGET, "actual": Decimal("800000")}, SITE_SIGNALS, PROC_SIGNALS)
        assert "variance -20.0%" in text

    def test_says_unknown_rather_than_zero_when_no_budget_exists(self):
        # A project with no budget row is not a project on budget.
        text = ex.build_executive_context(None, SITE_SIGNALS, PROC_SIGNALS)
        assert "no budget record exists" in text
        assert "variance" not in text

    def test_a_zero_total_budget_makes_variance_undefined_not_zero(self):
        # Dividing by zero is the obvious bug; reporting 0% is the dangerous one, because it reads
        # as "on budget" for a project whose budget was never set.
        text = ex.build_executive_context({**BUDGET, "total": Decimal("0")}, SITE_SIGNALS, PROC_SIGNALS)
        assert "undefined (total budget is zero)" in text

    def test_variance_helper_returns_none_for_absent_total(self):
        assert ex._variance_pct({"total": None, "actual": Decimal("1")}) is None

    def test_reuses_the_other_reports_renderers_rather_than_restating_them(self):
        # Two definitions of "overdue invoice" that drift apart put two numbers in front of two
        # people on the same day. The executive line must be the SAME string the PM sees.
        exec_text = ex.build_executive_context(BUDGET, SITE_SIGNALS, PROC_SIGNALS)
        assert proc.build_procurement_context(PROC_SIGNALS) in exec_text
        assert site.build_site_context(SITE_SIGNALS) in exec_text

    @pytest.mark.asyncio
    async def test_fetch_budget_returns_none_when_the_project_has_no_budget(self, monkeypatch):
        conn = _FakeConn([None])
        _patch_scope(monkeypatch, ex, conn)
        assert await ex.fetch_budget(object(), "t", "p") is None

    @pytest.mark.asyncio
    async def test_fetch_budget_maps_every_column(self, monkeypatch):
        conn = _FakeConn(
            [
                {
                    "total_budget_amount": Decimal("1000000"),
                    "total_budget_currency": "THB",
                    "allocated_amount": Decimal("900000"),
                    "committed_amount": Decimal("400000"),
                    "actual_amount": Decimal("1100000"),
                    "variance_alert_threshold": Decimal("10.00"),
                }
            ]
        )
        _patch_scope(monkeypatch, ex, conn)
        assert await ex.fetch_budget(object(), "t", "p") == BUDGET
        assert "tenant_id = $1" in conn.sql[0][0]

    @pytest.mark.asyncio
    async def test_assemble_combines_all_three_sources(self, monkeypatch):
        budget_conn = _FakeConn([None])
        site_conn = _FakeConn(
            [
                {"submitted": 1, "draft": 0},
                {"open_count": 0, "high_count": 0},
                {"worker_days": 0, "hours": 0, "trades": 0},
            ]
        )
        proc_conn = _FakeConn(
            [
                {"open_count": 0, "closing_soon": 0},
                {"pending": 0, "late": 0, "disputed": 0},
                {"overdue_count": 0, "overdue_amount": 0, "currency": None},
            ]
        )
        _patch_scope(monkeypatch, ex, budget_conn)
        _patch_scope(monkeypatch, site, site_conn)
        _patch_scope(monkeypatch, proc, proc_conn)
        text = await ex.assemble_executive_context(object(), "t", "p")
        assert "no budget record exists" in text
        assert "Site reports:" in text
        assert "RFQs:" in text
