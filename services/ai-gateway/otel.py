"""OpenTelemetry setup for ai-gateway (FastAPI).

Call configure_telemetry() once at application startup before the FastAPI app
processes any requests. Uses OTLP/HTTP exporter → OTel Collector.

Sampling (spec §31.5):
  - 1% baseline in production (OTEL_SAMPLING_RATIO env, default 0.01)
  - 100% for errors — configured via tail-based sampling on the OTel Collector
  - 100% for LLM calls — all spans inherit trace from the parent request
"""

import os
from opentelemetry import trace
from opentelemetry.sdk.resources import SERVICE_NAME, SERVICE_VERSION, Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.sdk.trace.sampling import ParentBased, TraceIdRatioBased
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor


def configure_telemetry(app=None) -> None:
    """Configure OTel SDK: OTLP trace exporter + FastAPI/HTTPX auto-instrumentation."""
    service_name = os.environ.get("OTEL_SERVICE_NAME", "ai-gateway")
    service_version = os.environ.get("SERVICE_VERSION", "0.0.0")
    otlp_endpoint = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4318")
    sampling_ratio = float(os.environ.get("OTEL_SAMPLING_RATIO", "0.01"))

    resource = Resource.create({
        SERVICE_NAME: service_name,
        SERVICE_VERSION: service_version,
    })

    sampler = ParentBased(root=TraceIdRatioBased(sampling_ratio))

    exporter = OTLPSpanExporter(endpoint=f"{otlp_endpoint}/v1/traces")

    provider = TracerProvider(resource=resource, sampler=sampler)
    provider.add_span_processor(BatchSpanProcessor(exporter))
    trace.set_tracer_provider(provider)

    if app is not None:
        FastAPIInstrumentor.instrument_app(app)

    HTTPXClientInstrumentor().instrument()


def get_tracer(name: str = "ai-gateway"):
    return trace.get_tracer(name)


def get_trace_id() -> str:
    span = trace.get_current_span()
    ctx = span.get_span_context()
    if ctx is None or not ctx.is_valid:
        return "0" * 32
    return format(ctx.trace_id, "032x")


def get_span_id() -> str:
    span = trace.get_current_span()
    ctx = span.get_span_context()
    if ctx is None or not ctx.is_valid:
        return "0" * 16
    return format(ctx.span_id, "016x")
