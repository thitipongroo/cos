"""OTel SDK setup — sampling posture (ADR-075, spec §31.5).

The contract these tests lock in: the ai-gateway SDK performs NO head-based sampling. Every span is
exported and the OTel Collector's tail_sampling processor makes the keep/drop decision, which is the
only way "100% of error traces" (QM-8) can hold.

Regression guard: a previous version applied ParentBased(TraceIdRatioBased(0.01)) here, which dropped
~99% of spans inside this process — before the Collector could ever see them.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.sampling import (
    ALWAYS_ON,
    ParentBased,
    TraceIdRatioBased,
)

import otel as otel_module


def _provider_from_configure(monkeypatch) -> TracerProvider:
    """Run configure_telemetry() with the exporter/instrumentors stubbed, return the provider."""
    captured: dict = {}

    class _FakeExporter:
        def __init__(self, endpoint: str):
            captured["endpoint"] = endpoint

    class _FakeSpanProcessor:
        """Implements the SpanProcessor surface the SDK calls, including the atexit shutdown."""

        def __init__(self, exporter):
            self.exporter = exporter

        def on_start(self, span, parent_context=None):  # pragma: no cover - not exercised
            pass

        def on_end(self, span):  # pragma: no cover - not exercised
            pass

        def shutdown(self):
            pass

        def force_flush(self, timeout_millis: int = 30000) -> bool:  # pragma: no cover
            return True

    monkeypatch.setattr(otel_module, "OTLPSpanExporter", _FakeExporter)
    monkeypatch.setattr(otel_module, "BatchSpanProcessor", _FakeSpanProcessor)
    monkeypatch.setattr(
        otel_module.FastAPIInstrumentor, "instrument_app", staticmethod(lambda app: None)
    )
    monkeypatch.setattr(
        otel_module.HTTPXClientInstrumentor, "instrument", lambda self, *a, **k: None
    )

    holder: dict = {}
    monkeypatch.setattr(trace, "set_tracer_provider", lambda p: holder.setdefault("p", p))

    otel_module.configure_telemetry()
    captured["provider"] = holder["p"]
    return captured


def test_no_head_sampling_configured(monkeypatch):
    """The provider must NOT carry a ratio-based sampler — sampling belongs to the Collector."""
    captured = _provider_from_configure(monkeypatch)
    sampler = captured["provider"].sampler

    assert not isinstance(sampler, TraceIdRatioBased), (
        "ai-gateway must not head-sample: it discards spans before the Collector's "
        "tail_sampling can apply the errors/ai-llm/financial policies (ADR-075)."
    )
    # ParentBased wrapping a ratio root is the exact shape that was removed.
    if isinstance(sampler, ParentBased):
        root = getattr(sampler, "_root", None)
        assert not isinstance(root, TraceIdRatioBased), "ParentBased(TraceIdRatioBased) reintroduced"


def test_sampler_is_the_always_on_default(monkeypatch):
    """With no sampler argument the SDK default applies, so every span is exported."""
    captured = _provider_from_configure(monkeypatch)
    sampler = captured["provider"].sampler

    # SDK default is ParentBased(root=ALWAYS_ON); assert the effective root samples everything.
    root = getattr(sampler, "_root", sampler)
    assert root is ALWAYS_ON or root.__class__ is ALWAYS_ON.__class__, (
        f"expected an always-on root sampler, got {root!r}"
    )


def test_sampling_env_var_is_not_read(monkeypatch):
    """OTEL_SAMPLING_RATIO was retired; setting it must have no effect on the SDK (ADR-075)."""
    monkeypatch.setenv("OTEL_SAMPLING_RATIO", "0.5")
    monkeypatch.setenv("OTEL_SAMPLING_PERCENTAGE", "50")

    captured = _provider_from_configure(monkeypatch)
    root = getattr(captured["provider"].sampler, "_root", captured["provider"].sampler)

    assert not isinstance(root, TraceIdRatioBased), (
        "sampling env vars must not influence the SDK — they configure the Collector only"
    )


def test_otlp_endpoint_defaults_and_override(monkeypatch):
    """Endpoint still derives from OTEL_EXPORTER_OTLP_ENDPOINT with the documented default."""
    monkeypatch.delenv("OTEL_EXPORTER_OTLP_ENDPOINT", raising=False)
    assert _provider_from_configure(monkeypatch)["endpoint"] == "http://localhost:4318/v1/traces"

    monkeypatch.setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://collector:4318")
    assert _provider_from_configure(monkeypatch)["endpoint"] == "http://collector:4318/v1/traces"
