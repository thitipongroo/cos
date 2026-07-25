"""Pure parsing for voice-command intent classification (ADR-073).

Kept free of the LLM/metering/template imports so it carries a standalone 100% unit gate. Any malformed
model output, non-object JSON, or unrecognised intent collapses to UNKNOWN — a bad classification must
never fire a wrong action (ห้ามเดา).
"""

from __future__ import annotations

import json

from pydantic import BaseModel

VALID_INTENTS = frozenset({"DAILY_REPORT", "LOG_ISSUE", "NAVIGATE", "SEARCH", "UNKNOWN"})


class IntentResult(BaseModel):
    intent: str
    target: str | None = None
    text: str | None = None
    confidence: float | None = None


def parse_intent_json(content: str, transcript: str) -> IntentResult:
    try:
        data = json.loads(content)
    except (json.JSONDecodeError, TypeError):
        return IntentResult(intent="UNKNOWN", text=transcript)
    if not isinstance(data, dict):
        return IntentResult(intent="UNKNOWN", text=transcript)
    intent = data.get("intent")
    if intent not in VALID_INTENTS:
        intent = "UNKNOWN"
    return IntentResult(
        intent=intent,
        target=data.get("target"),
        text=data.get("text") or transcript,
        confidence=data.get("confidence"),
    )
