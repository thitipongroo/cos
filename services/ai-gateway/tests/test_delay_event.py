"""delay_event — the Phase 23 construction.delay.detected.v1 producer (no broker, injected producer).

WHY THIS FILE EXISTS. The module shipped on 2026-08-25 with no test of any kind, which is how a
service whose pytest.ini demands 99% line coverage came to sit at 95.19%: 34 statements here and 29
in safety_violation_event were the whole shortfall.

Its mirror, risk_event, has had tests since it was written; this is the same shape of suite against
the same seam. Nothing calls emit_delay_detected yet and nothing should — master:5436 states the
producer "emits only once DelayForecastModel returns a prediction, and that model is still a stub".
A producer with no caller is exactly the thing that has to be tested directly, because no other test
in the estate will ever exercise it by accident.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest

from reports import delay_event


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


class TestSeverityBands:
    """spec `32 §Event payloads` row 8 — LOW=1-2, MEDIUM=3-6, HIGH=7-13, CRITICAL=14+."""

    @pytest.mark.parametrize(
        "days,expected",
        [
            # Every BOUNDARY, both sides. A band tested at its middle only (say 5 → MEDIUM) is
            # satisfied by thresholds that are off by one in either direction, and an off-by-one here
            # sends the wrong severity to a register a PM acts on.
            (1, "LOW"),
            (2, "LOW"),
            (3, "MEDIUM"),
            (6, "MEDIUM"),
            (7, "HIGH"),
            (13, "HIGH"),
            (14, "CRITICAL"),
            (15, "CRITICAL"),
            (365, "CRITICAL"),
        ],
    )
    def test_bands_match_the_spec_at_every_edge(self, days, expected):
        assert delay_event.severity_for(days) == expected

    def test_zero_and_negative_answer_low_rather_than_raising(self):
        # Documented deliberately: "a producer is the wrong place to discover a modelling bug".
        # emit_delay_detected is what refuses these; severity_for stays total.
        assert delay_event.severity_for(0) == "LOW"
        assert delay_event.severity_for(-3) == "LOW"


class TestPayload:
    def test_maps_a_prediction_onto_the_avsc_fields(self):
        payload = delay_event.build_delay_payload("proj-1", 9, task_id="task-7")
        assert payload == {
            "project_id": "proj-1",
            "task_id": "task-7",
            "delay_days": 9,
            "cause": "OTHER",
            "detected_by": "AI_FORECAST",
            "severity": "HIGH",
        }

    def test_task_id_is_null_when_absent_not_the_string_none(self):
        # `str(task_id) if task_id else None` — a bare str() would put "None" in the payload and the
        # Knowledge Graph would create a (:Task {id: "None"}) node.
        assert delay_event.build_delay_payload("proj-1", 5)["task_id"] is None

    def test_cause_defaults_to_other_and_is_overridable(self):
        # OTHER is the schema's symbol for "the model asserted no attribution". A caller that does
        # know the cause passes it.
        assert delay_event.build_delay_payload("p", 5)["cause"] == "OTHER"
        assert delay_event.build_delay_payload("p", 5, cause="PROCUREMENT")["cause"] == "PROCUREMENT"

    def test_detected_by_is_always_ai_forecast(self):
        # The payload's `detected_by` is what makes DelayForecastModel the named source; a human
        # report goes through a different path entirely.
        assert delay_event.build_delay_payload("p", 1)["detected_by"] == "AI_FORECAST"

    def test_ids_and_days_are_coerced_from_whatever_the_model_returns(self):
        payload = delay_event.build_delay_payload(7, 4.0, task_id=99)
        assert payload["project_id"] == "7"
        assert payload["task_id"] == "99"
        assert payload["delay_days"] == 4
        assert isinstance(payload["delay_days"], int)


class TestEnvelope:
    def test_wraps_the_payload_with_the_event_type_and_tenant(self):
        env = delay_event.build_envelope("tenant-9", {"x": 1})
        assert env["event_type"] == "construction.delay.detected.v1"
        assert env["event_version"] == "1.0"
        assert env["tenant_id"] == "tenant-9"
        assert env["actor_id"] == "ai-gateway"
        assert env["payload"] == {"x": 1}
        assert env["trace_id"] is None and env["span_id"] is None

    def test_every_envelope_gets_its_own_event_id(self):
        # A shared id would be deduplicated by the consumer's idempotency key and the second delay
        # would vanish without an error.
        a = delay_event.build_envelope("t", {})
        b = delay_event.build_envelope("t", {})
        assert a["event_id"] != b["event_id"]
        assert a["correlation_id"] != b["correlation_id"]


class TestEmit:
    @pytest.mark.asyncio
    async def test_sends_to_the_tenant_topic_with_the_isolation_header(self):
        producer = _FakeProducer()
        sent = await delay_event.emit_delay_detected(
            "proj-1", "tenant-9", 8, task_id="task-2", producer=producer
        )
        assert sent is True
        assert len(producer.sent) == 1
        topic, value, headers = producer.sent[0]
        # §7.3 topic naming — the tenant prefix is what keeps one tenant's delays out of another's.
        assert topic == "tenant-9.construction.delay.detected.v1"
        assert headers == [("tenant_id", b"tenant-9")]
        envelope = json.loads(value.decode("utf-8"))
        assert envelope["payload"]["project_id"] == "proj-1"
        assert envelope["payload"]["severity"] == "HIGH"
        # The producer is owned by the caller (started at app startup) — emit never manages it.
        assert producer.started is False and producer.stopped is False

    @pytest.mark.asyncio
    @pytest.mark.parametrize("days", [0, -1])
    async def test_refuses_a_non_positive_delay(self, days):
        # "No delay" is not an event. A zero-day row reaches the Knowledge Graph as a (:Delay) node
        # and the TasksDelayConsumer sets task.status = BLOCKED on a task that is running fine.
        producer = _FakeProducer()
        assert await delay_event.emit_delay_detected("p", "t", days, producer=producer) is False
        assert producer.sent == []

    @pytest.mark.asyncio
    async def test_is_a_noop_when_no_producer_is_configured(self):
        # The current runtime posture, like _db_pool: absent producer → skip, never open a broker
        # connection per request.
        assert await delay_event.emit_delay_detected("p", "t", 5) is False
