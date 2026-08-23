"""Unit tests for the 6-step report generation pipeline — Phase 12 Orchestration.

§35.13 ESC-24: reports/pipeline.py sat at 62%. Every uncovered line was a REFUSAL path — non-JSON
output, a failed hallucination guard, low confidence — and those are exactly the paths that must
never silently persist a report. The assertions here are therefore as much about what does NOT get
written to ai.ai_generated_reports as about the happy path.
"""

import json
from dataclasses import dataclass

import pytest

from providers.llm_provider import LLMResponse
from reports import pipeline as pipeline_module
from reports.guard import GuardResult
from reports.pipeline import ReportResult, generate_report


@dataclass
class _FakeProvider:
    content: str
    model_used: str = "gpt-4o-mini"
    total_tokens: int = 120

    def __post_init__(self):
        self.calls: list[tuple] = []

    async def complete(self, messages, model_hint):
        self.calls.append((messages, model_hint))
        return LLMResponse(
            content=self.content,
            model_used=self.model_used,
            prompt_tokens=100,
            completion_tokens=20,
            total_tokens=self.total_tokens,
        )


class _FakePool:
    def __init__(self):
        self.executed: list[tuple] = []

    async def execute(self, query, *args):
        self.executed.append((query, args))


def _valid_output(**overrides) -> dict:
    out = {"summary": "word " * 60, "confidence": 0.9}
    out.update(overrides)
    return out


async def _run(provider, pool, *, report_type="SITE_SUMMARY", monkeypatch=None, guard=None):
    if guard is not None:
        monkeypatch.setattr(pipeline_module._GUARD, "validate", guard)
    return await generate_report(
        report_type=report_type,
        context_data="site context. " * 10,
        template_extra_vars={"report_date": "2026-06-08"},
        provider=provider,
        db_pool=pool,
        tenant_id="11111111-1111-4111-8111-111111111111",
        project_id="22222222-2222-4222-8222-222222222222",
        generated_by="33333333-3333-4333-8333-333333333333",
    )


class TestReportTypeValidation:
    @pytest.mark.asyncio
    async def test_rejects_an_unknown_report_type_before_calling_the_llm(self):
        provider = _FakeProvider(content="{}")
        with pytest.raises(ValueError, match="Unknown report_type"):
            await _run(provider, _FakePool(), report_type="NOT_A_REPORT")
        assert provider.calls == []  # no tokens spent on a bad request

    @pytest.mark.parametrize(
        "report_type",
        ["SITE_SUMMARY", "PROCUREMENT_SUMMARY", "EXECUTIVE_SUMMARY", "DELAY_RISK"],
    )
    @pytest.mark.asyncio
    async def test_accepts_every_mapped_report_type(self, report_type, monkeypatch):
        provider = _FakeProvider(content=json.dumps(_valid_output()))
        monkeypatch.setattr(
            pipeline_module._GUARD, "validate", lambda output, context: GuardResult(passed=True)
        )
        result = await _run(provider, _FakePool(), report_type=report_type)
        assert result.report_type == report_type


class TestHappyPath:
    @pytest.mark.asyncio
    async def test_persists_and_returns_the_generated_report(self, monkeypatch):
        output = _valid_output(confidence=0.87)
        provider = _FakeProvider(content=json.dumps(output), model_used="claude-sonnet-5")
        pool = _FakePool()
        monkeypatch.setattr(
            pipeline_module._GUARD, "validate", lambda o, c: GuardResult(passed=True)
        )

        result = await _run(provider, pool)

        assert isinstance(result, ReportResult)
        assert result.low_confidence is False
        assert result.confidence == pytest.approx(0.87)
        assert result.content == output
        assert result.report_id is not None
        # step 5 actually wrote a row, with the model and token count from the LLM response
        args = pool.executed[0][1]
        assert args[6] == "claude-sonnet-5"
        assert args[7] == 120

    @pytest.mark.asyncio
    async def test_confidence_defaults_to_zero_when_absent_from_a_passing_output(
        self, monkeypatch
    ):
        provider = _FakeProvider(content=json.dumps({"summary": "s"}))
        monkeypatch.setattr(
            pipeline_module._GUARD, "validate", lambda o, c: GuardResult(passed=True)
        )
        result = await _run(provider, _FakePool())
        assert result.confidence == 0.0

    @pytest.mark.asyncio
    async def test_the_context_is_trimmed_before_it_reaches_the_prompt(self, monkeypatch):
        """Step 2 must run — an untrimmed context blows the 4000-token input budget."""
        seen: list[str] = []
        monkeypatch.setattr(
            pipeline_module._BUDGET,
            "trim_context",
            lambda ctx: (seen.append(ctx) or "TRIMMED"),
        )
        monkeypatch.setattr(
            pipeline_module._GUARD, "validate", lambda o, c: GuardResult(passed=True)
        )
        provider = _FakeProvider(content=json.dumps(_valid_output()))

        await _run(provider, _FakePool())

        assert seen  # trim_context was consulted
        prompt = provider.calls[0][0][0].content
        assert "TRIMMED" in prompt

    @pytest.mark.asyncio
    async def test_a_flagged_but_passing_report_is_still_persisted(self, monkeypatch, caplog):
        """hallucination_flagged is a warning for operators, not a refusal to the user."""
        provider = _FakeProvider(content=json.dumps(_valid_output()))
        pool = _FakePool()
        monkeypatch.setattr(
            pipeline_module._GUARD,
            "validate",
            lambda o, c: GuardResult(passed=True, hallucination_flagged=True),
        )

        with caplog.at_level("WARNING"):
            result = await _run(provider, pool)

        assert result.low_confidence is False
        assert len(pool.executed) == 1
        assert any("POTENTIAL_HALLUCINATION" in r.message for r in caplog.records)


class TestRefusalPaths:
    @pytest.mark.asyncio
    async def test_non_json_llm_output_returns_low_confidence_and_persists_nothing(
        self, caplog
    ):
        provider = _FakeProvider(content="I'm afraid I can't do that.")
        pool = _FakePool()

        with caplog.at_level("WARNING"):
            result = await _run(provider, pool)

        assert result.low_confidence is True
        assert result.report_id is None
        assert result.confidence is None
        assert result.content["status"] == "LOW_CONFIDENCE"
        assert pool.executed == []  # nothing written
        assert any("non-JSON output" in r.message for r in caplog.records)

    @pytest.mark.asyncio
    async def test_a_response_without_content_is_treated_as_non_json(self):
        """The AttributeError arm of the except clause: a provider whose response has no .content.

        Note the limit this pins down — the handler catches JSONDecodeError and AttributeError only,
        so a response whose .content is None raises TypeError and is NOT caught. That is why this
        test drives the attribute-missing case rather than a None value.
        """

        class _NoContentResponse:
            model_used = "gpt-4o-mini"
            total_tokens = 10

        class _NoContentProvider:
            calls: list = []

            async def complete(self, messages, model_hint):
                return _NoContentResponse()

        pool = _FakePool()

        result = await _run(_NoContentProvider(), pool)

        assert result.low_confidence is True
        assert result.report_id is None
        assert pool.executed == []

    @pytest.mark.asyncio
    async def test_guard_low_confidence_keeps_the_models_confidence_value(self, monkeypatch):
        provider = _FakeProvider(content=json.dumps(_valid_output(confidence=0.31)))
        pool = _FakePool()
        monkeypatch.setattr(
            pipeline_module._GUARD,
            "validate",
            lambda o, c: GuardResult(passed=False, reason="LOW_CONFIDENCE"),
        )

        result = await _run(provider, pool)

        assert result.low_confidence is True
        assert result.report_id is None
        # the caller can see HOW confident the model was, even though the report is withheld
        assert result.confidence == pytest.approx(0.31)
        assert pool.executed == []

    @pytest.mark.asyncio
    async def test_any_other_guard_failure_withholds_the_report_entirely(
        self, monkeypatch, caplog
    ):
        provider = _FakeProvider(content=json.dumps(_valid_output()))
        pool = _FakePool()
        monkeypatch.setattr(
            pipeline_module._GUARD,
            "validate",
            lambda o, c: GuardResult(passed=False, reason="summary too short: 3 words (min 50)"),
        )

        with caplog.at_level("WARNING"):
            result = await _run(provider, pool)

        assert result.low_confidence is True
        assert result.report_id is None
        assert result.confidence is None  # not surfaced for a structural failure
        assert pool.executed == []
        assert any("HallucinationGuard failed" in r.message for r in caplog.records)
