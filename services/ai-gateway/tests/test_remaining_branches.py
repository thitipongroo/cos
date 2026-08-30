"""The last uncovered arms in ai-gateway — §35.13 ESC-24.

Four narrow cases the rest of the suite could not reach, each a real contract:
  * the completions/report SUCCESS paths, which only run once a real provider and DB are wired
    (production ships with StubLLMProvider and no pool, so the refusal arms were all the other
    tests could see);
  * the divergence loop skipping an entity that has no recorded state;
  * the RAG config falling back to defaults when ai/chains/rag.yaml is absent.
"""

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

import main as main_module
from digital_twin import divergence as divergence_module
from main import app
from providers.llm_provider import LLMResponse
from rag import retrieval as retrieval_module
from reports.pipeline import ReportResult
from tests.fake_pool import TenantScopedPoolMixin

client = TestClient(app)


class _WorkingProvider:
    async def complete(self, messages, model_hint):
        return LLMResponse(
            content='{"summary": "ok", "confidence": 0.9}',
            model_used="claude-sonnet-5",
            prompt_tokens=10,
            completion_tokens=5,
            total_tokens=15,
        )


class TestCompletionsSuccess:
    def test_returns_the_completion_once_a_provider_is_configured(self, monkeypatch):
        monkeypatch.setattr(main_module, "_provider", _WorkingProvider())

        resp = client.post(
            "/api/v1/ai/completions",
            json={
                "template_name": "report-daily-summary-v1",
                "variables": {"context": "site context", "project_id": "p1"},
            },
        )

        assert resp.status_code == 200
        body = resp.json()
        assert body["model_used"] == "claude-sonnet-5"
        assert body["total_tokens"] == 15


class TestReportGenerationArms:
    def _post(self):
        # The four report endpoints all funnel through _run_report; site-summary is the entry point.
        return client.post(
            '/api/v1/ai/reports/site-summary',
            json={
                'project_id': '22222222-2222-4222-8222-222222222222',
                'tenant_id': '11111111-1111-4111-8111-111111111111',
                'generated_by': '33333333-3333-4333-8333-333333333333',
                'date_range': 'last 7 days',
            },
        )

    def test_503_when_the_pipeline_hits_an_unconfigured_provider(self, monkeypatch):
        async def _raise(**_kwargs):
            raise NotImplementedError('real LLM provider not configured')

        monkeypatch.setattr(main_module, 'generate_report', _raise)

        resp = self._post()
        assert resp.status_code == 503
        assert 'not configured' in resp.json()['detail']

    def test_404_when_the_prompt_template_is_missing(self, monkeypatch):
        async def _raise(**_kwargs):
            raise FileNotFoundError('template report-daily-summary-v1 not found')

        monkeypatch.setattr(main_module, 'generate_report', _raise)

        resp = self._post()
        assert resp.status_code == 404
        assert 'not found' in resp.json()['detail']

    def test_returns_the_report_on_the_success_path(self, monkeypatch):
        async def _ok(**_kwargs):
            return ReportResult(
                report_id='r-1',
                report_type='SITE_SUMMARY',
                content={'summary': 'on track'},
                confidence=0.91,
                low_confidence=False,
            )

        monkeypatch.setattr(main_module, 'generate_report', _ok)

        resp = self._post()
        assert resp.status_code == 200
        assert resp.json()['report_id'] == 'r-1'

    def test_the_kill_switch_refuses_before_any_generation(self, monkeypatch):
        """QM-15 / ADR-049 — one flag gates all four report endpoints."""
        called = []

        async def _never(**_kwargs):
            called.append(1)
            raise AssertionError('generation must not run when the flag is off')

        async def _disabled(_flag, default=True):
            return False

        monkeypatch.setattr(main_module, 'generate_report', _never)
        monkeypatch.setattr(main_module.flags, 'is_enabled', _disabled)

        resp = self._post()
        assert resp.status_code == 503
        assert 'COS-FLAG-001' in resp.json()['detail']
        assert called == []


class TestDivergenceSkipsEntitiesWithNoState:
    @pytest.mark.asyncio
    async def test_an_entity_with_no_recorded_state_is_skipped_not_counted(self):
        """A twin entity that has never reported must not be scored as a divergence — it is
        unknown, not diverged."""
        entity_id = uuid4()

        # The mixin supplies acquire()/transaction(): divergence reads through
        # db.tenant_scope.tenant_scoped(), so a fake with only fetch/fetchrow is never reached.
        class _Pool(TenantScopedPoolMixin):
            def __init__(self):
                self.fetchrow_calls = 0

            async def fetch(self, _q, *_a):
                return [
                    {
                        "entity_id": entity_id,
                        "entity_type": "EQUIPMENT",
                        "digital_ref": "bim:1",
                        "confidence": 0.5,
                    }
                ]

            async def fetchrow(self, _q, *_a):
                self.fetchrow_calls += 1
                return None  # no twin_states row for this entity

        pool = _Pool()
        report = await divergence_module.generate_divergence_report(
            "22222222-2222-4222-8222-222222222222",
            "11111111-1111-4111-8111-111111111111",
            db_pool=pool,
        )

        assert pool.fetchrow_calls == 1
        assert report.divergences == []
        assert report.risk_level == "LOW"


class TestRagConfigFallback:
    def test_falls_back_to_defaults_when_rag_yaml_is_absent(self, monkeypatch, tmp_path):
        # Point the module at a file whose ancestry contains no ai/chains/rag.yaml.
        isolated = tmp_path / "a" / "b" / "c" / "d" / "retrieval.py"
        isolated.parent.mkdir(parents=True)
        isolated.write_text("")
        monkeypatch.setattr(retrieval_module, "__file__", str(isolated))

        config = retrieval_module.load_rag_config()

        assert config["top_k"] == retrieval_module._DEFAULT_TOP_K
        assert config["max_context_tokens"] == retrieval_module._DEFAULT_MAX_CONTEXT_TOKENS

    def test_reads_the_committed_config_when_present(self):
        config = retrieval_module.load_rag_config()
        assert isinstance(config["top_k"], int)
        assert isinstance(config["max_context_tokens"], int)
