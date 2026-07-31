"""intent.classify — the async orchestration around parse_intent_json.

The branchy JSON mapping is unit-gated in test_intent_parse.py; here we only exercise the wiring
(render_template → metering.complete_and_meter → parse_intent_json) with every backend faked, so
no template file, LLM, DB or metering row is touched.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import intent.classify as classify_module
from intent.classify import classify_intent


async def test_classifies_via_the_metered_llm_path(monkeypatch):
    captured = {}

    def fake_render(name, vars_):
        captured["template"] = name
        captured["transcript"] = vars_.transcript
        return "RENDERED PROMPT"

    class _Resp:
        content = '{"intent": "DAILY_REPORT", "text": "poured zone A", "confidence": 0.9}'

    async def fake_complete_and_meter(provider, messages, purpose, tenant_id, meter_key, db_pool, template):
        captured["meter_args"] = (purpose, tenant_id, meter_key, template)
        captured["provider"] = provider
        captured["db_pool"] = db_pool
        captured["messages"] = messages
        return _Resp()

    monkeypatch.setattr(classify_module, "render_template", fake_render)
    monkeypatch.setattr(classify_module.metering, "complete_and_meter", fake_complete_and_meter)

    provider = object()
    db_pool = object()
    result = await classify_intent("poured zone A", provider, db_pool, "tenant-abc")

    # Returns the same IntentResult parse_intent_json produces from the LLM content.
    assert result.intent == "DAILY_REPORT"
    assert result.text == "poured zone A"
    assert result.confidence == 0.9

    # Wiring: template rendered with the transcript, metered call passed the right identifiers.
    assert captured["template"] == "voice-intent-v1"
    assert captured["transcript"] == "poured zone A"
    assert captured["provider"] is provider
    assert captured["db_pool"] is db_pool
    assert captured["meter_args"] == (
        "intent-classification",
        "tenant-abc",
        "ai.intent",
        "voice-intent-v1",
    )
    # The rendered prompt is wrapped in a single user Message.
    assert len(captured["messages"]) == 1
    assert captured["messages"][0].role == "user"
    assert captured["messages"][0].content == "RENDERED PROMPT"


async def test_non_json_llm_output_falls_back_to_the_transcript(monkeypatch):
    class _Resp:
        content = "not json {"

    async def fake_complete_and_meter(*args, **kwargs):
        return _Resp()

    monkeypatch.setattr(classify_module, "render_template", lambda name, vars_: "PROMPT")
    monkeypatch.setattr(classify_module.metering, "complete_and_meter", fake_complete_and_meter)

    result = await classify_intent("go to inspections", object(), object(), "tenant-abc")

    assert result.intent == "UNKNOWN"
    assert result.text == "go to inspections"
