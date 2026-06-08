"""
Unit tests: divergence calculation and state merge logic — Phase 24
"""

import pytest
from uuid import uuid4
from datetime import datetime, timezone

from digital_twin.divergence import (
    compute_divergence,
    _severity_from_gap,
    _risk_level_from_divergences,
    DEFAULT_THRESHOLDS,
)
from digital_twin.models import Divergence, SeverityLevel
from digital_twin.sync_service import compute_confidence
from digital_twin.models import StateSource


# ─── compute_divergence ───────────────────────────────────────────────────────

class TestComputeDivergence:
    def test_no_gap_when_states_match(self):
        planned = {"fuel_level": 0.8, "status": "ACTIVE"}
        actual = {"fuel_level": 0.8, "status": "ACTIVE"}
        gap, severity = compute_divergence(planned, actual, "EQUIPMENT")
        assert gap == 0.0
        assert severity == SeverityLevel.LOW

    def test_numeric_gap_calculated_correctly(self):
        planned = {"fuel_level": 1.0}
        actual = {"fuel_level": 0.5}
        gap, _ = compute_divergence(planned, actual, "EQUIPMENT")
        assert abs(gap - 0.5) < 1e-9

    def test_non_numeric_gap_is_1_when_unequal(self):
        planned = {"status": "ACTIVE"}
        actual = {"status": "STOPPED"}
        gap, _ = compute_divergence(planned, actual, "STRUCTURE")
        assert gap == 1.0

    def test_non_numeric_gap_is_0_when_equal(self):
        planned = {"status": "ACTIVE"}
        actual = {"status": "ACTIVE"}
        gap, _ = compute_divergence(planned, actual, "STRUCTURE")
        assert gap == 0.0

    def test_missing_key_in_actual_treated_as_gap(self):
        planned = {"fuel_level": 1.0, "speed": 10.0}
        actual = {"fuel_level": 0.8}
        gap, _ = compute_divergence(planned, actual, "EQUIPMENT")
        # fuel gap = 0.2; speed gap = 1.0 (planned 10, actual None=non-numeric)
        assert gap > 0

    def test_severity_low_for_small_gap(self):
        gap = 0.02  # below threshold 0.05 for EQUIPMENT
        severity = _severity_from_gap(gap, DEFAULT_THRESHOLDS["EQUIPMENT"])
        assert severity == SeverityLevel.LOW

    def test_severity_medium_for_moderate_gap(self):
        # threshold 0.05; ratio 1.5 → MEDIUM
        gap = DEFAULT_THRESHOLDS["EQUIPMENT"] * 1.5
        severity = _severity_from_gap(gap, DEFAULT_THRESHOLDS["EQUIPMENT"])
        assert severity == SeverityLevel.MEDIUM

    def test_severity_high_for_large_gap(self):
        # threshold 0.05; ratio 3.0 → HIGH
        gap = DEFAULT_THRESHOLDS["EQUIPMENT"] * 3.0
        severity = _severity_from_gap(gap, DEFAULT_THRESHOLDS["EQUIPMENT"])
        assert severity == SeverityLevel.HIGH


# ─── _risk_level_from_divergences ─────────────────────────────────────────────

class TestRiskLevel:
    def test_no_divergences_is_low(self):
        assert _risk_level_from_divergences([]) == "LOW"

    def test_single_high_divergence_is_high(self):
        d = Divergence(
            entity_id=uuid4(),
            planned_state={},
            actual_state={},
            gap=1.0,
            severity=SeverityLevel.HIGH,
        )
        assert _risk_level_from_divergences([d]) == "HIGH"

    def test_three_high_divergences_is_critical(self):
        divergences = [
            Divergence(entity_id=uuid4(), planned_state={}, actual_state={}, gap=1.0, severity=SeverityLevel.HIGH)
            for _ in range(3)
        ]
        assert _risk_level_from_divergences(divergences) == "CRITICAL"

    def test_three_medium_divergences_is_medium(self):
        divergences = [
            Divergence(entity_id=uuid4(), planned_state={}, actual_state={}, gap=0.08, severity=SeverityLevel.MEDIUM)
            for _ in range(3)
        ]
        assert _risk_level_from_divergences(divergences) == "MEDIUM"


# ─── compute_confidence ───────────────────────────────────────────────────────

class TestComputeConfidence:
    def test_iot_live_event_has_full_confidence(self):
        now = datetime.now(timezone.utc)
        conf = compute_confidence(StateSource.IOT, now)
        assert conf == 1.0

    def test_iot_stale_event_has_reduced_confidence(self):
        from datetime import timedelta
        old = datetime.now(timezone.utc) - timedelta(seconds=120)
        conf = compute_confidence(StateSource.IOT, old)
        assert conf == 0.8

    def test_ai_inferred_has_low_confidence(self):
        now = datetime.now(timezone.utc)
        conf = compute_confidence(StateSource.AI_INFERRED, now)
        assert conf < 0.7
