"""intent.parse — the pure JSON→IntentResult mapping, standalone (no LLM/metering/template)."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from intent.parse import parse_intent_json


def test_valid_intent_passes_through():
    out = parse_intent_json(
        '{"intent": "DAILY_REPORT", "text": "poured zone A", "confidence": 0.9}', "raw"
    )
    assert out.intent == "DAILY_REPORT"
    assert out.text == "poured zone A"
    assert out.confidence == 0.9


def test_navigate_keeps_target():
    out = parse_intent_json('{"intent": "NAVIGATE", "target": "inspections"}', "raw")
    assert out.intent == "NAVIGATE"
    assert out.target == "inspections"


def test_unrecognised_intent_becomes_unknown():
    assert parse_intent_json('{"intent": "PAYROLL"}', "raw").intent == "UNKNOWN"


def test_non_json_becomes_unknown_with_transcript():
    out = parse_intent_json("not json {", "the transcript")
    assert out.intent == "UNKNOWN"
    assert out.text == "the transcript"


def test_non_object_json_becomes_unknown():
    out = parse_intent_json("[1, 2, 3]", "the transcript")
    assert out.intent == "UNKNOWN"
    assert out.text == "the transcript"


def test_missing_text_falls_back_to_transcript():
    out = parse_intent_json('{"intent": "SEARCH"}', "find steel delivery")
    assert out.intent == "SEARCH"
    assert out.text == "find steel delivery"
