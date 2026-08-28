"""safety_violation_event — the Phase 23 safety.violation.detected.v1 producer (no broker).

WHY THIS FILE EXISTS. Same story as test_delay_event: the module shipped on 2026-08-25 with no test,
and its 29 statements were the other half of the 99% coverage gate's shortfall.

Nothing calls emit_safety_violation yet and nothing should — master:5477 states the producer "emits
only once SafetyVisionModel returns an analysis, and that model is still a stub until it has 10,000+
labeled photos". §19.6 makes this one of exactly two events a user CANNOT switch off, so its
behaviour under bad input is not a detail: whatever it emits reaches a Safety Officer who has no way
to mute it.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest

from reports import safety_violation_event as sve


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


ANALYSIS = {"violations": ["no_helmet", "no_harness"], "confidence": 0.9123, "severity": "HIGH"}


class TestPayload:
    def test_maps_a_safety_analysis_result_onto_the_avsc_fields(self):
        payload = sve.build_violation_payload("proj-1", "file-7", ANALYSIS)
        assert payload["project_id"] == "proj-1"
        assert payload["file_id"] == "file-7"
        assert payload["violations"] == ["no_helmet", "no_harness"]
        assert payload["severity"] == "HIGH"
        assert isinstance(payload["violation_id"], str) and payload["violation_id"]

    def test_confidence_crosses_the_boundary_as_a_4dp_decimal_string(self):
        # master:990 — a number crossing a service boundary as a float is a number nobody can reason
        # about. Matches ai.risk_prediction.generated.v1.
        assert sve.build_violation_payload("p", "f", ANALYSIS)["confidence"] == "0.9123"
        assert isinstance(sve.build_violation_payload("p", "f", ANALYSIS)["confidence"], str)

    @pytest.mark.parametrize("bad", [None, 0, 0.0])
    def test_absent_or_zero_confidence_becomes_0_0000(self, bad):
        payload = sve.build_violation_payload("p", "f", {"violations": ["x"], "confidence": bad})
        assert payload["confidence"] == "0.0000"

    @pytest.mark.parametrize("severity", ["LOW", "MEDIUM", "HIGH", "CRITICAL"])
    def test_every_enum_severity_passes_through_unchanged(self, severity):
        analysis = {"violations": ["x"], "confidence": 0.5, "severity": severity}
        assert sve.build_violation_payload("p", "f", analysis)["severity"] == severity

    def test_severity_is_uppercased_before_the_enum_check(self):
        analysis = {"violations": ["x"], "confidence": 0.5, "severity": "high"}
        assert sve.build_violation_payload("p", "f", analysis)["severity"] == "HIGH"

    @pytest.mark.parametrize("severity", ["", "SEVERE", "unknown", None, 7])
    def test_an_unrecognised_severity_escalates_to_critical_not_low(self, severity):
        # The documented direction, and the one that matters: this event cannot be switched off, so
        # if the model ever answers outside the enum the safe failure is the one that reaches a
        # human. Defaulting to LOW would bury a real violation in a feed nobody reads first.
        analysis = {"violations": ["x"], "confidence": 0.5, "severity": severity}
        assert sve.build_violation_payload("p", "f", analysis)["severity"] == "CRITICAL"

    def test_violations_are_coerced_to_strings(self):
        analysis = {"violations": [1, "no_helmet"], "confidence": 0.5, "severity": "LOW"}
        assert sve.build_violation_payload("p", "f", analysis)["violations"] == ["1", "no_helmet"]

    def test_each_violation_gets_its_own_id(self):
        a = sve.build_violation_payload("p", "f", ANALYSIS)["violation_id"]
        b = sve.build_violation_payload("p", "f", ANALYSIS)["violation_id"]
        assert a != b


class TestEnvelope:
    def test_wraps_the_payload_with_the_event_type_and_tenant(self):
        env = sve.build_envelope("tenant-9", {"x": 1})
        assert env["event_type"] == "safety.violation.detected.v1"
        assert env["event_version"] == "1.0"
        assert env["tenant_id"] == "tenant-9"
        assert env["actor_id"] == "ai-gateway"
        assert env["payload"] == {"x": 1}
        assert env["trace_id"] is None and env["span_id"] is None

    def test_every_envelope_gets_its_own_event_id(self):
        a = sve.build_envelope("t", {})
        b = sve.build_envelope("t", {})
        assert a["event_id"] != b["event_id"]
        assert a["correlation_id"] != b["correlation_id"]


class TestEmit:
    @pytest.mark.asyncio
    async def test_sends_to_the_tenant_topic_and_returns_the_violation_id(self):
        producer = _FakeProducer()
        violation_id = await sve.emit_safety_violation(
            "proj-1", "tenant-9", "file-7", ANALYSIS, producer=producer
        )
        assert isinstance(violation_id, str) and violation_id
        assert len(producer.sent) == 1
        topic, value, headers = producer.sent[0]
        assert topic == "tenant-9.safety.violation.detected.v1"
        assert headers == [("tenant_id", b"tenant-9")]
        envelope = json.loads(value.decode("utf-8"))
        assert envelope["payload"]["violation_id"] == violation_id
        assert envelope["payload"]["file_id"] == "file-7"
        assert producer.started is False and producer.stopped is False

    @pytest.mark.asyncio
    @pytest.mark.parametrize("analysis", [{"violations": []}, {}, {"violations": None}])
    async def test_an_analysis_that_found_nothing_is_not_emitted(self, analysis):
        # A clean photo must not page the Safety Officer — and this is an alert they cannot mute.
        producer = _FakeProducer()
        assert await sve.emit_safety_violation("p", "t", "f", analysis, producer=producer) is None
        assert producer.sent == []

    @pytest.mark.asyncio
    async def test_is_a_noop_when_no_producer_is_configured(self):
        assert await sve.emit_safety_violation("p", "t", "f", ANALYSIS) is None
