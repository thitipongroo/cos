import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from reports.guard import HallucinationGuard, MIN_WORDS, MAX_WORDS, CONFIDENCE_THRESHOLD


def _make_output(summary: str = None, confidence: float = 0.85,
                 data_points_used: int = 10) -> dict:
    base = {"confidence": confidence, "data_points_used": data_points_used}
    if summary is not None:
        base["summary"] = summary
    return base


def _words(n: int) -> str:
    return ("word " * n).strip()


GOOD_SUMMARY = _words(100)
GOOD_CONTEXT = GOOD_SUMMARY + " extra context"


class TestCheck1Length:
    def test_passes_for_summary_within_range(self):
        guard = HallucinationGuard()
        result = guard.validate(_make_output(summary=_words(100)), GOOD_CONTEXT)
        assert result.passed

    def test_fails_when_summary_too_short(self):
        guard = HallucinationGuard()
        result = guard.validate(_make_output(summary=_words(MIN_WORDS - 1)), GOOD_CONTEXT)
        assert not result.passed
        assert "too short" in result.reason

    def test_fails_when_summary_too_long(self):
        guard = HallucinationGuard()
        result = guard.validate(_make_output(summary=_words(MAX_WORDS + 1)), GOOD_CONTEXT)
        assert not result.passed
        assert "too long" in result.reason

    def test_passes_at_exact_min_boundary(self):
        guard = HallucinationGuard()
        result = guard.validate(_make_output(summary=_words(MIN_WORDS)), GOOD_CONTEXT)
        assert result.passed

    def test_passes_at_exact_max_boundary(self):
        guard = HallucinationGuard()
        result = guard.validate(_make_output(summary=_words(MAX_WORDS)), GOOD_CONTEXT)
        assert result.passed


class TestCheck2SourceAttribution:
    def test_fails_when_confidence_is_zero(self):
        guard = HallucinationGuard()
        result = guard.validate(_make_output(summary=GOOD_SUMMARY, confidence=0.0), GOOD_CONTEXT)
        assert not result.passed
        assert "zero confidence" in result.reason

    def test_passes_when_confidence_above_zero_and_threshold(self):
        guard = HallucinationGuard()
        result = guard.validate(_make_output(summary=GOOD_SUMMARY, confidence=0.9), GOOD_CONTEXT)
        assert result.passed


class TestCheck3ConfidenceScore:
    def test_fails_when_confidence_missing(self):
        guard = HallucinationGuard()
        output = {"summary": GOOD_SUMMARY, "data_points_used": 5}
        result = guard.validate(output, GOOD_CONTEXT)
        assert not result.passed
        assert "missing confidence" in result.reason

    def test_fails_when_confidence_above_1(self):
        guard = HallucinationGuard()
        result = guard.validate(_make_output(summary=GOOD_SUMMARY, confidence=1.1), GOOD_CONTEXT)
        assert not result.passed
        assert "out of range" in result.reason

    def test_fails_when_confidence_below_0(self):
        guard = HallucinationGuard()
        result = guard.validate(_make_output(summary=GOOD_SUMMARY, confidence=-0.1), GOOD_CONTEXT)
        assert not result.passed

    def test_fails_when_confidence_is_not_a_number(self):
        guard = HallucinationGuard()
        output = {"summary": GOOD_SUMMARY, "confidence": "high", "data_points_used": 5}
        result = guard.validate(output, GOOD_CONTEXT)
        assert not result.passed
        assert "must be a number" in result.reason

    def test_passes_at_exactly_1_0(self):
        guard = HallucinationGuard()
        result = guard.validate(_make_output(summary=GOOD_SUMMARY, confidence=1.0), GOOD_CONTEXT)
        assert result.passed


class TestCheck4LowConfidence:
    def test_fails_below_threshold(self):
        guard = HallucinationGuard()
        result = guard.validate(
            _make_output(summary=GOOD_SUMMARY, confidence=CONFIDENCE_THRESHOLD - 0.01),
            GOOD_CONTEXT,
        )
        assert not result.passed
        assert result.reason == "LOW_CONFIDENCE"

    def test_passes_at_exact_threshold(self):
        guard = HallucinationGuard()
        result = guard.validate(
            _make_output(summary=GOOD_SUMMARY, confidence=CONFIDENCE_THRESHOLD),
            GOOD_CONTEXT,
        )
        assert result.passed

    def test_passes_above_threshold(self):
        guard = HallucinationGuard()
        result = guard.validate(
            _make_output(summary=GOOD_SUMMARY, confidence=0.95),
            GOOD_CONTEXT,
        )
        assert result.passed


class TestCheck5Contradiction:
    def test_flags_numbers_not_in_context(self):
        guard = HallucinationGuard()
        summary = _words(60) + " total cost was 999999 baht"
        context = _words(60) + " budget is 50000 baht"
        output = _make_output(summary=summary, confidence=0.85)
        result = guard.validate(output, context)
        assert result.passed
        assert result.hallucination_flagged

    def test_no_flag_when_numbers_present_in_context(self):
        guard = HallucinationGuard()
        summary = _words(60) + " total cost was 50000 baht"
        context = _words(60) + " budget is 50000 baht"
        output = _make_output(summary=summary, confidence=0.85)
        result = guard.validate(output, context)
        assert result.passed
        assert not result.hallucination_flagged

    def test_no_flag_when_summary_has_no_numbers(self):
        guard = HallucinationGuard()
        result = guard.validate(_make_output(summary=GOOD_SUMMARY, confidence=0.85), "no numbers here")
        assert result.passed
        assert not result.hallucination_flagged

    def test_executive_summary_field_accepted(self):
        guard = HallucinationGuard()
        output = {"executive_summary": GOOD_SUMMARY, "confidence": 0.85, "data_points_used": 5}
        result = guard.validate(output, GOOD_CONTEXT)
        assert result.passed
