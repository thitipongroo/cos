"""Report persistence + token budget (§Phase 12 Generate).

`persistence.py` was at 50% and `token_budget.py` at 64%. The budget matters because §Phase 12 caps
input context at 4000 tokens and output at 1000 — exceeding the model's window is a hard API failure
at request time, and `trim_context` is what prevents it. Its sentence-boundary rule is the part worth
pinning: cutting mid-sentence feeds the model a truncated fact.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tests.fake_pool import TenantScopedPoolMixin  # noqa: E402

import pytest
from reports.persistence import fetch_report_history, persist_report
from reports.token_budget import MAX_INPUT_TOKENS, MAX_OUTPUT_TOKENS, TokenBudget


class _FakePool(TenantScopedPoolMixin):
    def __init__(self, rows=None):
        self.execute_calls: list = []
        self.fetch_calls: list = []
        self._rows = rows if rows is not None else []

    async def _on_execute(self, query, *params):
        self.execute_calls.append((query, params))

    async def fetch(self, query, *params):
        self.fetch_calls.append((query, params))
        return self._rows


class TestPersistReport:
    @pytest.mark.asyncio
    async def test_inserts_and_returns_a_report_id(self):
        pool = _FakePool()

        report_id = await persist_report(
            pool, "t-1", "p-1", "SITE_SUMMARY", {"summary": "ok"}, 0.9, "gpt-4o", 500, "u-1"
        )

        query, params = pool.execute_calls[0]
        assert "INSERT INTO ai.ai_generated_reports" in query
        assert params[0] == report_id

    @pytest.mark.asyncio
    async def test_content_is_serialised_as_json(self):
        # The column is jsonb; handing asyncpg a dict would fail at the driver.
        pool = _FakePool()

        await persist_report(
            pool, "t-1", "p-1", "SITE_SUMMARY", {"summary": "สรุป", "gaps": []}, 0.8, "gpt-4o", 10, "u-1"
        )

        content_param = pool.execute_calls[0][1][4]
        assert json.loads(content_param) == {"summary": "สรุป", "gaps": []}

    @pytest.mark.asyncio
    async def test_every_field_lands_in_its_column(self):
        pool = _FakePool()

        await persist_report(
            pool, "t-1", "p-2", "EXECUTIVE_SUMMARY", {}, 0.75, "gpt-4o-mini", 321, "u-9"
        )

        _, params = pool.execute_calls[0]
        assert params[1:4] == ("t-1", "p-2", "EXECUTIVE_SUMMARY")
        assert params[5:] == (0.75, "gpt-4o-mini", 321, "u-9")

    @pytest.mark.asyncio
    async def test_each_report_gets_a_distinct_id(self):
        pool = _FakePool()

        first = await persist_report(pool, "t", "p", "SITE_SUMMARY", {}, 1.0, "m", 1, "u")
        second = await persist_report(pool, "t", "p", "SITE_SUMMARY", {}, 1.0, "m", 1, "u")

        assert first != second


class TestFetchReportHistory:
    @pytest.mark.asyncio
    async def test_returns_rows_as_plain_dicts(self):
        pool = _FakePool(rows=[{"report_id": "r-1"}, {"report_id": "r-2"}])

        history = await fetch_report_history(pool, "t-1", "p-1")

        assert history == [{"report_id": "r-1"}, {"report_id": "r-2"}]

    @pytest.mark.asyncio
    async def test_query_is_scoped_by_tenant_and_project_newest_first(self):
        pool = _FakePool()

        await fetch_report_history(pool, "t-1", "p-1")

        query, params = pool.fetch_calls[0]
        assert "tenant_id = $1" in query and "project_id = $2" in query
        assert "ORDER BY generated_at DESC" in query
        assert params[:2] == ("t-1", "p-1")

    @pytest.mark.asyncio
    async def test_default_limit_is_twenty(self):
        pool = _FakePool()

        await fetch_report_history(pool, "t-1", "p-1")

        assert pool.fetch_calls[0][1][2] == 20

    @pytest.mark.asyncio
    async def test_limit_is_configurable(self):
        pool = _FakePool()

        await fetch_report_history(pool, "t-1", "p-1", limit=5)

        assert pool.fetch_calls[0][1][2] == 5

    @pytest.mark.asyncio
    async def test_empty_history_is_an_empty_list(self):
        assert await fetch_report_history(_FakePool(rows=[]), "t", "p") == []


class TestTokenBudgetCounting:
    def test_defaults_match_the_phase_12_caps(self):
        budget = TokenBudget()

        assert (budget.max_input_tokens, budget.max_output_tokens) == (4000, 1000)
        assert (MAX_INPUT_TOKENS, MAX_OUTPUT_TOKENS) == (4000, 1000)

    def test_counts_four_characters_per_token(self):
        assert TokenBudget().count_tokens("a" * 400) == 100

    def test_within_input_budget_at_the_boundary(self):
        budget = TokenBudget(max_input_tokens=10)

        assert budget.within_input_budget("a" * 40) is True  # exactly 10 tokens
        assert budget.within_input_budget("a" * 44) is False  # 11 tokens

    def test_within_output_budget_at_the_boundary(self):
        budget = TokenBudget(max_output_tokens=10)

        assert budget.within_output_budget("a" * 40) is True
        assert budget.within_output_budget("a" * 44) is False


class TestTrimContext:
    def test_context_within_budget_is_returned_untouched(self):
        budget = TokenBudget(max_input_tokens=100)
        context = "short context."

        assert budget.trim_context(context) is context

    def test_cuts_at_the_last_sentence_boundary_within_budget(self):
        # Mid-sentence truncation hands the model half a fact — worse than dropping the sentence.
        # The boundary must sit past 80% of the budget (index 32 of 40) for the cut to be taken.
        budget = TokenBudget(max_input_tokens=10)  # 40 chars
        context = "A" * 33 + ". Tail that overflows the budget."

        trimmed = budget.trim_context(context)

        assert trimmed.endswith(".")
        assert len(trimmed) <= 40
        assert trimmed == "A" * 33 + "."

    def test_an_early_sentence_boundary_is_rejected_in_favour_of_a_hard_cut(self):
        # Complement to the case above: a period at 80% or less would discard most of the budgeted
        # context, so the hard cut keeps more usable text even though it lands mid-sentence.
        budget = TokenBudget(max_input_tokens=10)  # 40 chars
        context = "First sentence. Second one here. And a third that overflows the budget."

        trimmed = budget.trim_context(context)

        assert len(trimmed) == 40
        assert not trimmed.endswith(".")

    def test_falls_back_to_a_hard_cut_when_no_late_sentence_boundary_exists(self):
        # The 80% rule: a period near the very start would throw away most of the context, so a hard
        # cut at the budget is preferred.
        budget = TokenBudget(max_input_tokens=10)  # 40 chars
        context = "Hi. " + "x" * 100

        trimmed = budget.trim_context(context)

        assert len(trimmed) == 40
        assert trimmed.startswith("Hi. ")

    def test_hard_cut_when_there_is_no_period_at_all(self):
        budget = TokenBudget(max_input_tokens=10)
        context = "x" * 100

        assert budget.trim_context(context) == "x" * 40

    def test_trimmed_context_always_fits_the_budget(self):
        budget = TokenBudget(max_input_tokens=10)

        for context in ("a. " * 50, "no periods here " * 20, "Ends with period. " * 10):
            assert budget.within_input_budget(budget.trim_context(context))
