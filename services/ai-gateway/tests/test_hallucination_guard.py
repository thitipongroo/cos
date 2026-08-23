import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from reports.guard import HallucinationGuard, MIN_WORDS, MAX_WORDS, CONFIDENCE_THRESHOLD


def _make_output(summary: str = None, confidence: float = 0.85,
                 data_points_used: int = 10) -> dict:
    base = {
        "confidence": confidence,
        "data_points_used": data_points_used,
        # Check 2 is real source attribution since OQ-41, so every output that is meant to PASS has
        # to cite something the context actually contains. `_words(5)` is a prefix of GOOD_CONTEXT.
        "sources": [_words(5)],
    }
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
    """Check 2 became a real attribution check on 2026-08-23 (TDD OQ-41).

    It used to be `confidence == 0.0 -> fail`, which check 4 (`< 0.7 -> fail`) already subsumed:
    a model returning 0.9 for a wholly fabricated narrative passed both, and no output model had a
    field to cite anything in. The old test asserting "zero confidence" in the reason is below,
    inverted — that path is now reached by check 4 and reported as LOW_CONFIDENCE, which is the
    honest label for it.
    """

    def test_passes_when_the_report_cites_the_context(self):
        guard = HallucinationGuard()
        result = guard.validate(_make_output(summary=GOOD_SUMMARY, confidence=0.9), GOOD_CONTEXT)
        assert result.passed

    def test_fails_when_nothing_is_cited(self):
        guard = HallucinationGuard()
        output = _make_output(summary=GOOD_SUMMARY, confidence=0.9)
        output["sources"] = []
        result = guard.validate(output, GOOD_CONTEXT)
        assert not result.passed
        assert "no sources cited" in result.reason

    def test_fails_when_the_sources_key_is_absent_entirely(self):
        guard = HallucinationGuard()
        output = {"summary": GOOD_SUMMARY, "confidence": 0.9, "data_points_used": 5}
        result = guard.validate(output, GOOD_CONTEXT)
        assert not result.passed
        assert "no sources cited" in result.reason

    def test_fails_an_INVENTED_citation(self):
        # The point of the whole check. A model that fabricates a narrative will fabricate a
        # plausible-looking citation to go with it; this is what a confidence score could never
        # catch, because a confident fabrication reports high confidence.
        guard = HallucinationGuard()
        output = _make_output(summary=GOOD_SUMMARY, confidence=0.95)
        output["sources"] = ["Concrete pour completed on level 4 at 14:20"]
        result = guard.validate(output, GOOD_CONTEXT)
        assert not result.passed
        assert "not found in the retrieval context" in result.reason

    def test_fails_when_the_context_is_empty(self):
        # SITE_SUMMARY, PROCUREMENT_SUMMARY and EXECUTIVE_SUMMARY are called with context_data=""
        # today, so this is the live path for three of the four report endpoints: a narrative written
        # from no project data is fabrication by construction, and the caller returns the
        # LowConfidenceResponse fallback instead.
        guard = HallucinationGuard()
        result = guard.validate(_make_output(summary=GOOD_SUMMARY, confidence=0.9), "")
        assert not result.passed
        assert "context was empty" in result.reason

    def test_tolerates_rewrapped_whitespace_in_a_citation(self):
        # A model that re-wraps a quoted line has still cited it. Failing that would push callers to
        # quote single words to be safe, which passes the check while meaning nothing.
        guard = HallucinationGuard()
        output = _make_output(summary=GOOD_SUMMARY, confidence=0.9)
        output["sources"] = ["word\n  word   word"]
        result = guard.validate(output, GOOD_CONTEXT)
        assert result.passed

    def test_fails_an_empty_string_citation(self):
        guard = HallucinationGuard()
        output = _make_output(summary=GOOD_SUMMARY, confidence=0.9)
        output["sources"] = ["   "]
        result = guard.validate(output, GOOD_CONTEXT)
        assert not result.passed
        assert "empty" in result.reason

    def test_zero_confidence_now_fails_as_low_confidence(self):
        # Same outcome as before, reported for the reason that is actually true of it.
        guard = HallucinationGuard()
        result = guard.validate(_make_output(summary=GOOD_SUMMARY, confidence=0.0), GOOD_CONTEXT)
        assert not result.passed
        assert result.reason == "LOW_CONFIDENCE"


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
        output = _make_output(summary=GOOD_SUMMARY, confidence=0.85)
        output["sources"] = ["no numbers here"]  # check 2 needs a citation the context contains
        result = guard.validate(output, "no numbers here")
        assert result.passed
        assert not result.hallucination_flagged

    def test_executive_summary_field_accepted(self):
        guard = HallucinationGuard()
        output = {
            "executive_summary": GOOD_SUMMARY,
            "confidence": 0.85,
            "data_points_used": 5,
            "sources": [_words(5)],
        }
        result = guard.validate(output, GOOD_CONTEXT)
        assert result.passed
