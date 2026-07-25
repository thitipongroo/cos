"""Voice-command intent classification orchestration (ADR-073).

Render the prompt → classify via the metered LLM path → parse. Stub-safe via the injected provider: no
key → NotImplementedError → the endpoint returns 503 and the FAB degrades to "voice command
unavailable". The JSON parsing (the branchy part) lives in intent.parse, unit-gated to 100%.
"""

from __future__ import annotations

from pydantic import BaseModel

import metering
from providers.llm_provider import LLMProvider, Message
from templates.loader import render_template

from intent.parse import IntentResult, parse_intent_json

_TEMPLATE = "voice-intent-v1"


async def classify_intent(
    transcript: str,
    provider: LLMProvider,
    db_pool,
    tenant_id: str,
) -> IntentResult:
    class _Vars(BaseModel):
        model_config = {"extra": "allow"}

    prompt = render_template(_TEMPLATE, _Vars(transcript=transcript))
    messages = [Message(role="user", content=prompt)]
    response = await metering.complete_and_meter(
        provider, messages, "intent-classification", tenant_id, "ai.intent", db_pool, _TEMPLATE
    )
    return parse_intent_json(response.content, transcript)
