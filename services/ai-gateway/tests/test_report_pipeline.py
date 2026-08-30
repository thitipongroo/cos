"""The 6-step report generation pipeline (§Phase 12 Orchestration).

Every branch tested here is a way the pipeline can hand a user a bad report without erroring:

  - unknown report_type → must raise, not silently pick a template
  - LLM returns non-JSON → must degrade to LOW_CONFIDENCE, not surface a parse error
  - guard fails on low confidence → the fallback shape from §Phase 12, and NOTHING persisted
  - guard fails for any other reason → same fallback, still nothing persisted
  - POTENTIAL_HALLUCINATION → logged AND persisted/returned, but marked low_confidence=true so the UI
    never presents it as trustworthy (previously returned as low_confidence=false with a false log)

The "nothing persisted" assertions are the important half: a report that failed the guard must not
end up in ai_generated_reports, where the history endpoint would later serve it as a real report.
The LLM provider, DB pool, and prompt renderer are all fakes — no model, no database.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tests.fake_pool import TenantScopedPoolMixin  # noqa: E402

import pytest
from reports import pipeline as pipeline_module
from reports.guard import GuardResult
from reports.pipeline import ReportResult, generate_report


class _FakeLLMResponse:
    def __init__(self, content: str, model_used="gpt-4o", total_tokens=140):
        self.content = content
        self.model_used = model_used
        self.total_tokens = total_tokens
        # Metering (TokenLoggerMiddleware) reads prompt/completion tokens too.
        self.prompt_tokens = total_tokens // 2
        self.completion_tokens = total_tokens - total_tokens // 2


class _FakeProvider:
    def __init__(self, response):
        self.response = response
        self.calls: list = []

    async def complete(self, messages, model_hint):
        self.calls.append((messages, model_hint))
        return self.response


class _FakePool(TenantScopedPoolMixin):
    def __init__(self):
        self.execute_calls: list = []

    async def _on_execute(self, query, *params):
        self.execute_calls.append((query, params))


# The pool now receives two kinds of write: the usage-log insert (metering, before the guard) and the
# report persist (only when the guard passes). Split them so assertions stay precise.
def _persist_calls(pool):
    return [c for c in pool.execute_calls if "ai_generated_reports" in c[0]]


def _usage_calls(pool):
    return [c for c in pool.execute_calls if "ai_usage_logs" in c[0]]


def _valid_output(**overrides) -> dict:
    payload = {
        "summary": " ".join(["word"] * 80),  # inside the guard's 50–500 word window
        "confidence": 0.9,
        "data_points_used": 12,
        "data_gaps": [],
        # OQ-41: the guard now requires the report to quote the context it drew on, and checks the
        # quote is IN it. `_run`'s default context is "context text.".
        "sources": ["context text."],
    }
    payload.update(overrides)
    return payload


@pytest.fixture
def rendered(monkeypatch):
    """Replaces the Jinja renderer so no prompt file is needed, and records the variables."""
    calls: list = []

    def fake_render(template_name, vars_model):
        calls.append((template_name, vars_model))
        return "RENDERED PROMPT"

    monkeypatch.setattr(pipeline_module, "render_template", fake_render)
    return calls


async def _run(provider, pool, report_type="SITE_SUMMARY", context="context text.", extra=None):
    return await generate_report(
        report_type,
        context,
        extra or {},
        provider,
        pool,
        tenant_id="t-1",
        project_id="p-1",
        generated_by="u-1",
    )


class TestReportTypeValidation:
    @pytest.mark.asyncio
    async def test_unknown_report_type_raises(self, rendered):
        # Falling through with an unknown type would render whatever template happened to be first.
        with pytest.raises(ValueError, match="Unknown report_type"):
            await _run(_FakeProvider(_FakeLLMResponse("{}")), _FakePool(), report_type="NOPE")

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        ("report_type", "template"),
        [
            ("SITE_SUMMARY", "report-daily-summary-v1"),
            ("PROCUREMENT_SUMMARY", "report-procurement-status-v1"),
            ("EXECUTIVE_SUMMARY", "report-executive-v1"),
            ("DELAY_RISK", "report-delay-risk-v1"),
        ],
    )
    async def test_each_report_type_renders_its_own_template(self, rendered, report_type, template):
        provider = _FakeProvider(_FakeLLMResponse(json.dumps(_valid_output())))

        await _run(provider, _FakePool(), report_type=report_type)

        assert rendered[0][0] == template


class TestPromptAssembly:
    @pytest.mark.asyncio
    async def test_context_is_trimmed_to_the_token_budget(self, rendered):
        # A context above the 4000-token cap must be trimmed before it reaches the model, or the
        # request fails at the API with a context-length error.
        provider = _FakeProvider(_FakeLLMResponse(json.dumps(_valid_output())))
        oversized = "x" * (4000 * 4 + 500)

        await _run(provider, _FakePool(), context=oversized)

        _, vars_model = rendered[0]
        assert len(vars_model.context) <= 4000 * 4

    @pytest.mark.asyncio
    async def test_template_extra_vars_reach_the_prompt(self, rendered):
        provider = _FakeProvider(_FakeLLMResponse(json.dumps(_valid_output())))

        await _run(provider, _FakePool(), extra={"date_range": "2026-07-01..07-21"})

        _, vars_model = rendered[0]
        assert vars_model.date_range == "2026-07-01..07-21"
        assert vars_model.project_id == "p-1"

    @pytest.mark.asyncio
    async def test_llm_is_called_with_the_report_generation_hint(self, rendered):
        # model_hint routes to the POWERFUL tier (gpt-4o); summarisation would pick the cheap model.
        provider = _FakeProvider(_FakeLLMResponse(json.dumps(_valid_output())))

        await _run(provider, _FakePool())

        messages, hint = provider.calls[0]
        assert hint == "report-generation"
        assert messages[0].content == "RENDERED PROMPT"


class TestHappyPath:
    @pytest.mark.asyncio
    async def test_persists_and_returns_the_report(self, rendered):
        provider = _FakeProvider(_FakeLLMResponse(json.dumps(_valid_output()), total_tokens=321))
        pool = _FakePool()

        result = await _run(provider, pool)

        assert isinstance(result, ReportResult)
        assert result.low_confidence is False
        assert result.report_id is not None
        assert result.confidence == 0.9
        assert len(_persist_calls(pool)) == 1
        assert len(_usage_calls(pool)) == 1  # metering fired (QM-7/QM-8)

    @pytest.mark.asyncio
    async def test_persisted_row_carries_the_model_and_token_count(self, rendered):
        provider = _FakeProvider(
            _FakeLLMResponse(json.dumps(_valid_output()), model_used="gpt-4o-mini", total_tokens=77)
        )
        pool = _FakePool()

        await _run(provider, pool)

        _, params = _persist_calls(pool)[0]
        assert params[6] == "gpt-4o-mini"
        assert params[7] == 77

    @pytest.mark.asyncio
    async def test_output_without_confidence_never_reaches_persistence(self, rendered):
        # The guard rejects a missing confidence field before the pipeline's
        # `output_data.get("confidence", 0.0)` default can apply, so that default is defensive only.
        # Asserted here so the guard-ordering is not quietly changed to let unscored reports through.
        output = _valid_output()
        del output["confidence"]
        pool = _FakePool()

        result = await _run(_FakeProvider(_FakeLLMResponse(json.dumps(output))), pool)

        assert result.low_confidence is True
        assert result.report_id is None
        assert _persist_calls(pool) == []  # no report persisted (usage was still metered)


class TestNonJsonOutput:
    @pytest.mark.asyncio
    async def test_degrades_to_low_confidence_instead_of_raising(self, rendered):
        provider = _FakeProvider(_FakeLLMResponse("I am not JSON."))

        result = await _run(provider, _FakePool())

        assert result.low_confidence is True
        assert result.report_id is None
        assert result.confidence is None

    @pytest.mark.asyncio
    async def test_nothing_is_persisted_for_unparseable_output(self, rendered):
        pool = _FakePool()

        await _run(_FakeProvider(_FakeLLMResponse("not json")), pool)

        assert _persist_calls(pool) == []

    @pytest.mark.asyncio
    async def test_a_response_without_content_is_handled(self, rendered):
        # AttributeError branch: a provider returning an object with no `.content`.
        class _NoContent:
            model_used = "gpt-4o"
            total_tokens = 0
            prompt_tokens = 0
            completion_tokens = 0

        result = await _run(_FakeProvider(_NoContent()), _FakePool())

        assert result.low_confidence is True


class TestGuardRejection:
    @pytest.mark.asyncio
    async def test_low_confidence_keeps_the_models_confidence_value(self, rendered, monkeypatch):
        # §Phase 12 fallback: status LOW_CONFIDENCE, summary null — but the score is still reported.
        monkeypatch.setattr(
            pipeline_module._GUARD,
            "validate",
            lambda output, context: GuardResult(passed=False, reason="LOW_CONFIDENCE"),
        )
        provider = _FakeProvider(_FakeLLMResponse(json.dumps(_valid_output(confidence=0.42))))
        pool = _FakePool()

        result = await _run(provider, pool)

        assert result.low_confidence is True
        assert result.confidence == 0.42
        assert result.report_id is None
        assert _persist_calls(pool) == []

    @pytest.mark.asyncio
    async def test_other_guard_failures_drop_the_confidence(self, rendered, monkeypatch):
        # A contradiction/length failure is not a "the model was unsure" case, so no score is
        # attributed to it.
        monkeypatch.setattr(
            pipeline_module._GUARD,
            "validate",
            lambda output, context: GuardResult(passed=False, reason="LENGTH_OUT_OF_RANGE"),
        )
        pool = _FakePool()

        result = await _run(_FakeProvider(_FakeLLMResponse(json.dumps(_valid_output()))), pool)

        assert result.low_confidence is True
        assert result.confidence is None
        assert _persist_calls(pool) == []

    @pytest.mark.asyncio
    async def test_flagged_hallucination_returns_the_report_marked_low_confidence(
        self, rendered, monkeypatch, caplog
    ):
        # A flagged report is persisted + returned (for audit/UI), but marked low_confidence so it is
        # never presented as trustworthy — the old behaviour returned it as low_confidence=False.
        import logging

        monkeypatch.setattr(
            pipeline_module._GUARD,
            "validate",
            lambda output, context: GuardResult(passed=True, hallucination_flagged=True),
        )
        pool = _FakePool()

        with caplog.at_level(logging.WARNING, logger=pipeline_module.__name__):
            result = await _run(_FakeProvider(_FakeLLMResponse(json.dumps(_valid_output()))), pool)

        assert result.low_confidence is True
        assert result.report_id is not None
        assert "POTENTIAL_HALLUCINATION" in caplog.text
        assert len(_persist_calls(pool)) == 1

    @pytest.mark.asyncio
    async def test_the_flag_itself_never_reaches_the_caller(self, rendered, monkeypatch):
        """master:3954 — POTENTIAL_HALLUCINATION is "logged, not returned to user".

        Product-owner reading, settled 2026-08-23: the parenthetical governs the FLAG, not the
        summary. The report is still returned, carrying `low_confidence: true` — which both clients
        already render as a warning (apps/web reports/page.tsx, apps/mobile reports.tsx) — while the
        label itself stays in the log. This asserts the half that was untested: the string must not
        appear anywhere in what the caller receives, in the content or the field names.
        """
        monkeypatch.setattr(
            pipeline_module._GUARD,
            "validate",
            lambda output, context: GuardResult(passed=True, hallucination_flagged=True),
        )

        result = await _run(_FakeProvider(_FakeLLMResponse(json.dumps(_valid_output()))), _FakePool())

        assert "POTENTIAL_HALLUCINATION" not in json.dumps(result.model_dump(), default=str)
        # And the caller is still told something is wrong — otherwise "not returned" would be
        # satisfied by saying nothing at all.
        assert result.low_confidence is True
