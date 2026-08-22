"""Two-tier LLM routing table (§Phase 11 LLM Gateway, §22.7 RT-001).

WHAT WAS WRONG
--------------
`config/routing.yaml` defined the two tiers correctly and **no Python file read it**. Routing went
through ``model_for_hint()`` in ``llm_provider.py``, which looked up ``MODEL_BY_HINT`` — an EMPTY
dict — and therefore returned the module-level constant ``DEFAULT_MODEL = "gpt-4o"`` for every hint.

So the FAST tier never activated: ``summarization``, ``classification`` and ``autocomplete`` all
billed at GPT-4o rates instead of GPT-4o-mini, and the model name the phase command explicitly
forbids hardcoding ("store in env/YAML, **never hardcode model names**") was hardcoded. The file
existed, so the deliverable read as present while being inert (TDD OQ-40).

WHERE THE MODEL NAMES LIVE
--------------------------
In the YAML, never here. The tier values use ``${VAR:-default}``, so the default travels with the
config rather than with the code, and an operator can override per environment without a deploy.
This module implements that expansion; it contains no model name of its own.
"""

from __future__ import annotations

import os
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

# Same override shape as CHAINS_DIR in langchain_config.py, for the same reason: the config is
# service-local, and tests need to point at a fixture without moving the real file.
ROUTING_CONFIG = Path(
    os.environ.get(
        "AI_ROUTING_CONFIG",
        str(Path(__file__).resolve().parents[1] / "config" / "routing.yaml"),
    )
)

# ${VAR} and ${VAR:-default}
_VAR = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}")


def _expand(value: str) -> str:
    """Substitute ${VAR} / ${VAR:-default} from the environment.

    An unset variable with no default is left as the literal ``${VAR}`` rather than becoming an empty
    string: an empty model name would be sent to the provider and fail with an opaque 400, whereas
    the literal makes the misconfiguration obvious in the error and in the ai_usage_logs row.
    """

    def sub(m: re.Match[str]) -> str:
        env = os.environ.get(m.group(1))
        if env:
            return env
        default = m.group(2)
        return default if default is not None else m.group(0)

    return _VAR.sub(sub, value)


@lru_cache(maxsize=1)
def load_routing() -> dict[str, Any]:
    """Parse and validate routing.yaml.

    Cached: the table is read once per process, not once per LLM call. Tests that point
    ``AI_ROUTING_CONFIG`` elsewhere must call ``load_routing.cache_clear()``.

    Raises rather than falling back to a built-in table. A gateway that silently routes every call to
    a guessed model is how this defect went unnoticed for months; a missing or malformed routing file
    is a deployment fault and should read as one.
    """
    import yaml

    if not ROUTING_CONFIG.exists():
        raise FileNotFoundError(f"LLM routing table not found at {ROUTING_CONFIG}")

    config = yaml.safe_load(ROUTING_CONFIG.read_text(encoding="utf-8")) or {}

    tiers = config.get("tiers")
    if not isinstance(tiers, dict) or not tiers:
        raise ValueError(f"{ROUTING_CONFIG.name}: 'tiers' missing or empty")

    hint_to_model: dict[str, str] = {}
    tier_to_model: dict[str, str] = {}
    for tier_name, tier in tiers.items():
        model = tier.get("model")
        if not model:
            raise ValueError(f"{ROUTING_CONFIG.name}: tier {tier_name!r} has no 'model'")
        model = _expand(str(model))
        tier_to_model[tier_name] = model
        for hint in tier.get("model_hints") or []:
            if hint in hint_to_model:
                raise ValueError(
                    f"{ROUTING_CONFIG.name}: model_hint {hint!r} appears in more than one tier"
                )
            hint_to_model[hint] = model

    defaults = config.get("defaults") or {}
    fallback_tier = defaults.get("fallback_tier")
    if fallback_tier not in tier_to_model:
        raise ValueError(
            f"{ROUTING_CONFIG.name}: defaults.fallback_tier {fallback_tier!r} is not a defined tier"
        )

    return {
        "hint_to_model": hint_to_model,
        "tier_to_model": tier_to_model,
        "fallback_model": tier_to_model[fallback_tier],
        "fallback_tier": fallback_tier,
        "max_retries": defaults.get("max_retries"),
        "timeout_seconds": defaults.get("timeout_seconds"),
    }


def model_for_hint(model_hint: str) -> str:
    """Resolve a model_hint to a concrete model name.

    An unrecognised hint goes to ``defaults.fallback_tier``, which the shipped table sets to FAST —
    the CHEAP tier. That is deliberate and is the opposite of the old behaviour, where every unknown
    hint fell through to GPT-4o: a hint nobody has classified is not evidence that the expensive
    model is needed.
    """
    routing = load_routing()
    return routing["hint_to_model"].get(model_hint, routing["fallback_model"])
