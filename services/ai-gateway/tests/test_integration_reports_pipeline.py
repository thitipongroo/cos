"""Integration test: the FULL report generation pipeline over HTTP (master:4036).

WHY THIS FILE EXISTS ALONGSIDE test_integration_reports.py. That file checks the endpoint contract,
but nearly every assertion in it reads `status_code in (200, 503)` — which is true whether the
pipeline ran or refused — and with no provider wired the answer is always 503, so the six steps after
"call the LLM" have never been exercised through an endpoint.

Here the provider is a fake that returns real structured output, so the whole path runs: request →
prompt render → LLM → hallucination guard → persist → response. Only the two edges are replaced, the
LLM and the database, and the StubLLMProvider case is asserted separately so "no real API call"
means something testable rather than a comment.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from fastapi.testclient import TestClient

from providers.llm_provider import LLMProvider, LLMResponse, Message, StubLLMProvider
from tests.fake_pool import TenantScopedPoolMixin

# conftest overrides get_verified_tenant for the suite.
VERIFIED_TENANT = "tenant-abc"
PROJECT_ID = "22222222-2222-4000-8000-000000000002"

# Inside the guard's 50-500 word band (master:3945) and carrying NO figures at all. That matters:
# the site-summary endpoint sends an empty context today, so every number in a summary is by
# definition absent from the context and check 5 would flag it as a POTENTIAL_HALLUCINATION. Keeping
# the fixture number-free isolates the checks under test from that one.
_SUMMARY = " ".join(
    [
        "Progress on the upper floors continued steadily with the full crew present on site."
    ]
    * 3
    + [
        "Output is expected to hold through the week with no further disruption reported."
    ]
    * 4
)


def _output(**overrides) -> dict:
    body = {
        "summary": _SUMMARY,
        "key_issues": ["scaffolding delay"],
        "manpower_trend": "stable",
        "confidence": 0.91,
        "data_points_used": 12,
        "data_gaps": [],
    }
    body.update(overrides)
    return body


class _FakeProvider(LLMProvider):
    def __init__(self, payload: str, *, model: str = "gpt-4o") -> None:
        self._payload = payload
        self._model = model
        self.calls: list[tuple[list[Message], str]] = []

    async def complete(self, messages: list[Message], model_hint: str) -> LLMResponse:
        self.calls.append((messages, model_hint))
        return LLMResponse(
            content=self._payload,
            model_used=self._model,
            prompt_tokens=100,
            completion_tokens=50,
            total_tokens=150,
        )


class _FakePool(TenantScopedPoolMixin):
    """Records the persisted report instead of writing one."""

    def __init__(self) -> None:
        self.persisted: list[tuple] = []

    async def _on_execute(self, query, *args):
        # TenantScopedPoolMixin.execute swallows the set_config statement and forwards everything
        # else here, so this sees the real INSERT and not the tenant scoping.
        if "INSERT INTO ai.ai_generated_reports" in query:
            self.persisted.append(args)
        return None

    async def fetchval(self, query, *args):
        return None

    async def fetch(self, query, *args):
        return []

    async def fetchrow(self, query, *args):
        return None


@pytest.fixture()
def client():
    from main import app

    return TestClient(app)


@pytest.fixture()
def wired(monkeypatch):
    import main

    provider = _FakeProvider(json.dumps(_output()))
    pool = _FakePool()
    monkeypatch.setattr(main, "_provider", provider, raising=False)
    monkeypatch.setattr(main, "_db_pool", pool, raising=False)
    return {"provider": provider, "pool": pool}


def _post(client: TestClient, route: str = "site-summary", **body):
    # The request model REQUIRES tenant_id even though the endpoint ignores it in favour of the
    # verified dependency — which is exactly why the "body cannot choose another tenant" test below
    # matters: the field is there, and a handler reading it would compile and pass every other test.
    payload = {
        "project_id": PROJECT_ID,
        "tenant_id": VERIFIED_TENANT,
        "generated_by": "44444444-4444-4000-8000-000000000004",
    }
    payload.update(body)
    return client.post(f"/api/v1/ai/reports/{route}", json=payload)


class TestFullGenerationPipeline:
    def test_returns_the_generated_report(self, client, wired):
        resp = _post(client)
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["report_type"] == "SITE_SUMMARY"
        assert body["content"]["manpower_trend"] == "stable"
        assert body["low_confidence"] is False

    def test_the_prompt_is_rendered_from_the_template_not_built_in_code(
        self, client, wired
    ):
        """master:3865 — prompts live in ai/prompts/. The rendered text should carry template
        content, which is how we know the file was actually used."""
        _post(client)
        messages, _hint = wired["provider"].calls[0]
        assert len(messages) == 1
        assert PROJECT_ID in messages[0].content

    def test_report_generation_runs_on_the_powerful_tier(self, client, wired):
        """master:3796 puts report-generation in tier POWERFUL."""
        _post(client)
        _messages, hint = wired["provider"].calls[0]
        assert hint == "report-generation"

    def test_the_report_is_persisted_with_its_confidence(self, client, wired):
        """Step 5 of the six (master:4009). /reports/history has nothing to show otherwise."""
        body = _post(client).json()
        assert len(wired["pool"].persisted) == 1
        assert body["confidence"] == pytest.approx(0.91)
        assert body["report_id"] is not None

    def test_persistence_is_tenant_scoped(self, client, wired):
        """The gateway connects as app_user; the insert needs the GUC or RLS rejects it WITH CHECK."""
        _post(client)
        assert wired["pool"].tenant_guc == VERIFIED_TENANT

    def test_the_body_cannot_choose_another_tenant(self, client, wired):
        """tenant_id comes from the verified dependency — a body value must not steer persistence."""
        _post(client, tenant_id="99999999-9999-4000-8000-000000000999")
        assert wired["pool"].tenant_guc == VERIFIED_TENANT

    def test_only_one_llm_call_is_made(self, client, wired):
        """master:3964 — confidence comes from the same structured output, not a second call."""
        _post(client)
        assert len(wired["provider"].calls) == 1


class TestGuardOnTheEndpointPath:
    def test_a_short_summary_becomes_the_fallback(self, client, monkeypatch):
        """The guard is on the endpoint path, not only on the pipeline function (master:4042)."""
        import main

        monkeypatch.setattr(
            main,
            "_provider",
            _FakeProvider(json.dumps(_output(summary="too short"))),
            raising=False,
        )
        monkeypatch.setattr(main, "_db_pool", _FakePool(), raising=False)

        body = _post(client).json()
        assert body["low_confidence"] is True
        assert body["content"]["status"] == "LOW_CONFIDENCE"
        assert body["content"]["summary"] is None

    def test_low_confidence_returns_the_spec_fallback_verbatim(
        self, client, monkeypatch
    ):
        import main

        monkeypatch.setattr(
            main,
            "_provider",
            _FakeProvider(json.dumps(_output(confidence=0.4))),
            raising=False,
        )
        monkeypatch.setattr(main, "_db_pool", _FakePool(), raising=False)

        content = _post(client).json()["content"]
        assert content == {
            "status": "LOW_CONFIDENCE",
            "summary": None,
            "message": "Insufficient data for reliable summary",
            "raw_data_available": True,
        }

    def test_confidence_exactly_at_the_threshold_is_accepted(self, client, monkeypatch):
        """master:3949 says "< 0.7" — 0.7 itself must pass, all the way through the endpoint."""
        import main

        monkeypatch.setattr(
            main,
            "_provider",
            _FakeProvider(json.dumps(_output(confidence=0.7))),
            raising=False,
        )
        monkeypatch.setattr(main, "_db_pool", _FakePool(), raising=False)

        body = _post(client).json()
        assert body["low_confidence"] is False
        assert body["content"]["summary"] == _SUMMARY

    def test_malformed_llm_output_never_reaches_the_caller(self, client, monkeypatch):
        """master:4044 — "never surface raw LLM errors to user"."""
        import main

        monkeypatch.setattr(
            main, "_provider", _FakeProvider("not json at all"), raising=False
        )
        monkeypatch.setattr(main, "_db_pool", _FakePool(), raising=False)

        resp = _post(client)
        assert resp.status_code == 200
        assert resp.json()["content"]["status"] == "LOW_CONFIDENCE"
        assert "not json at all" not in resp.text
        assert "JSONDecodeError" not in resp.text

    def test_a_report_that_fails_the_guard_is_not_persisted(self, client, monkeypatch):
        """A rejected report must leave no history row — /reports/history is what a PM reads back."""
        import main

        pool = _FakePool()
        monkeypatch.setattr(
            main,
            "_provider",
            _FakeProvider(json.dumps(_output(confidence=0.4))),
            raising=False,
        )
        monkeypatch.setattr(main, "_db_pool", pool, raising=False)

        _post(client)
        assert pool.persisted == []


class TestStubProviderMakesNoRealCall:
    def test_stub_provider_yields_503(self, client, monkeypatch):
        """StubLLMProvider raises NotImplementedError, which the endpoint turns into 503.

        This is what "no real API call" means in practice: with nothing configured the service
        refuses rather than reaching for a network it has no key for.
        """
        import main

        monkeypatch.setattr(main, "_provider", StubLLMProvider(), raising=False)
        monkeypatch.setattr(main, "_db_pool", _FakePool(), raising=False)

        resp = _post(client)
        assert resp.status_code == 503

    def test_nothing_is_persisted_when_the_provider_is_a_stub(
        self, client, monkeypatch
    ):
        import main

        pool = _FakePool()
        monkeypatch.setattr(main, "_provider", StubLLMProvider(), raising=False)
        monkeypatch.setattr(main, "_db_pool", pool, raising=False)

        _post(client)
        assert pool.persisted == []


class TestEveryCapabilityRunsTheSamePipeline:
    @pytest.mark.parametrize(
        "route,expected_type",
        [
            ("site-summary", "SITE_SUMMARY"),
            ("procurement-summary", "PROCUREMENT_SUMMARY"),
            ("executive-summary", "EXECUTIVE_SUMMARY"),
        ],
    )
    def test_route_maps_to_its_report_type(
        self, client, monkeypatch, route, expected_type
    ):
        """Four endpoints, one guarded path (master:4042). A route wired to the wrong type would
        persist a report nobody can find and render the wrong template."""
        import main

        payload = (
            _output()
            if route != "executive-summary"
            else {
                "executive_summary": _SUMMARY,
                "risk_flags": ["budget"],
                "recommendations": ["review scope"],
                "confidence": 0.9,
                "data_points_used": 8,
            }
        )
        monkeypatch.setattr(
            main, "_provider", _FakeProvider(json.dumps(payload)), raising=False
        )
        monkeypatch.setattr(main, "_db_pool", _FakePool(), raising=False)

        assert _post(client, route=route).json()["report_type"] == expected_type
