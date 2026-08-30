"""Unit tests for ai-gateway tracing helpers — Phase 15 observability.

§35.13 ESC-24: otel.py sat at 70%; the uncovered lines were get_tracer and the two id accessors.
Those ids end up in every structured log line, so the contract that matters is the fallback: with
no active span they must return the all-zero W3C id rather than raise or return None, which would
break log correlation exactly when something is already going wrong.
"""

import pytest
from opentelemetry import trace as otel_trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

import otel as otel_module


@pytest.fixture
def recording_provider():
    """Installs a real SDK provider that records spans in memory."""
    exporter = InMemorySpanExporter()
    provider = TracerProvider()
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    previous = otel_trace.get_tracer_provider()
    otel_trace._TRACER_PROVIDER = provider  # type: ignore[attr-defined]
    yield provider, exporter
    otel_trace._TRACER_PROVIDER = previous  # type: ignore[attr-defined]


class TestGetTracer:
    def test_returns_a_usable_tracer(self, recording_provider):
        tracer = otel_module.get_tracer()
        with tracer.start_as_current_span("unit") as span:
            assert span is not None

    def test_names_default_to_the_service(self, recording_provider):
        assert otel_module.get_tracer() is not None

    def test_accepts_an_explicit_name(self, recording_provider):
        assert otel_module.get_tracer("report-pipeline") is not None


class TestTraceAndSpanIds:
    def test_return_the_active_span_ids_inside_a_span(self, recording_provider):
        tracer = otel_module.get_tracer("test")
        with tracer.start_as_current_span("work") as span:
            ctx = span.get_span_context()
            assert otel_module.get_trace_id() == format(ctx.trace_id, "032x")
            assert otel_module.get_span_id() == format(ctx.span_id, "016x")

    def test_trace_id_is_32_hex_characters(self, recording_provider):
        with otel_module.get_tracer("test").start_as_current_span("work"):
            trace_id = otel_module.get_trace_id()
        assert len(trace_id) == 32
        int(trace_id, 16)

    def test_span_id_is_16_hex_characters(self, recording_provider):
        with otel_module.get_tracer("test").start_as_current_span("work"):
            span_id = otel_module.get_span_id()
        assert len(span_id) == 16
        int(span_id, 16)

    def test_trace_id_falls_back_to_all_zeroes_outside_a_span(self):
        """Log correlation must degrade to the W3C null id, never to an exception."""
        assert otel_module.get_trace_id() == "0" * 32

    def test_span_id_falls_back_to_all_zeroes_outside_a_span(self):
        assert otel_module.get_span_id() == "0" * 16
