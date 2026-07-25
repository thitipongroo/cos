"""risk_event — the F4b delay-risk → risk-prediction emit, standalone (no broker, injected producer)."""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest

from reports import risk_event


class _FakeProducer:
    def __init__(self):
        self.started = self.stopped = False
        self.sent = []

    async def start(self):
        self.started = True

    async def send_and_wait(self, topic, value, headers):
        self.sent.append((topic, value, headers))

    async def stop(self):
        self.stopped = True


CONTENT = {"delay_risk_level": "HIGH", "risk_factors": ["procurement slip", "rain"]}


def test_payload_maps_delay_forecast_and_formats_confidence():
    payload = risk_event.build_prediction_payload("proj-1", CONTENT, 0.8712)
    assert payload["model_type"] == "DELAY_FORECAST"
    assert payload["project_id"] == "proj-1"
    assert payload["confidence"] == "0.8712"
    assert json.loads(payload["prediction"]) == {
        "delay_risk_level": "HIGH",
        "risk_factors": ["procurement slip", "rain"],
    }
    assert payload["model_version"] == "report-delay-risk-v1"


def test_payload_defaults_none_confidence_and_missing_factors():
    payload = risk_event.build_prediction_payload("proj-1", {"delay_risk_level": "LOW"}, None)
    assert payload["confidence"] == "0.0000"
    assert json.loads(payload["prediction"])["risk_factors"] == []


def test_envelope_wraps_payload_with_event_type_and_tenant():
    env = risk_event.build_envelope("tenant-9", {"x": 1})
    assert env["event_type"] == "ai.risk_prediction.generated.v1"
    assert env["tenant_id"] == "tenant-9"
    assert env["actor_id"] == "ai-gateway"
    assert env["payload"] == {"x": 1}


@pytest.mark.asyncio
async def test_emit_with_injected_producer_sends_to_tenant_topic():
    producer = _FakeProducer()
    pid = await risk_event.emit_risk_prediction("proj-1", "tenant-9", CONTENT, 0.9, producer=producer)
    assert isinstance(pid, str) and pid
    assert len(producer.sent) == 1
    topic, value, headers = producer.sent[0]
    assert topic == "tenant-9.ai.risk_prediction.generated.v1"
    assert headers == [("tenant_id", b"tenant-9")]
    envelope = json.loads(value.decode("utf-8"))
    assert envelope["payload"]["project_id"] == "proj-1"
    # The producer is injected/owned by the caller (started at app startup) — emit never manages it.
    assert producer.started is False and producer.stopped is False


@pytest.mark.asyncio
async def test_emit_is_a_noop_when_no_producer_configured():
    # Producer not wired (the current runtime posture, like the db_pool) → skip, do not connect.
    assert await risk_event.emit_risk_prediction("proj-1", "tenant-9", CONTENT, 0.9) is None
