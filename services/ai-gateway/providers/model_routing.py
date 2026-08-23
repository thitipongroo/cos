"""The two-tier model routing table (master §Phase 11 LLM Gateway, lines 3794-3798).

WHY THIS MODULE EXISTS. `config/routing.yaml` has always held the correct table — tier POWERFUL for
report-generation / risk-analysis / document-extraction, tier FAST for summarization /
classification / autocomplete — but nothing in the service ever read it. The real routing was a
module constant, `DEFAULT_MODEL = "gpt-4o"`, beside an empty `MODEL_BY_HINT`, so every hint resolved
to the POWERFUL model. That is not a wrong-answer bug: the completions were fine. It is a bill. The
`/ai/completions` endpoint defaults `model_hint` to "summarization", a FAST-tier hint, and those
tokens are metered per tenant for the subscription overage master §26.1 charges from.

The spec's rule is "store in env/YAML, never hardcode model names", so the names live in the YAML —
including the fallback, written as `${VAR:-default}` rather than a Python constant. Neither
OPENAI_POWERFUL_MODEL nor OPENAI_FAST_MODEL is set anywhere in the repo (no compose entry, no .env,
no manifest), so without an in-file default the table would resolve to empty strings and the service
would ask the provider for a model named "".
"""

from __future__ import annotations

import os
import re
from functools import lru_cache
from pathlib import Path

import yaml

ROUTING_TABLE_PATH = Path(__file__).resolve().parents[1] / "config" / "routing.yaml"

# ${VAR} or ${VAR:-default}
_PLACEHOLDER = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}")


def _expand(value: str) -> str:
    """Substitute ${VAR} / ${VAR:-default} from the environment."""

    def replace(match: re.Match[str]) -> str:
        name, default = match.group(1), match.group(2)
        env = os.environ.get(name)
        # An empty env var is treated as unset: `OPENAI_FAST_MODEL=` in a compose file is a common
        # way to "leave it blank", and resolving that to "" would send an empty model name upstream.
        if env:
            return env
        return default if default is not None else ""

    return _PLACEHOLDER.sub(replace, value)


class RoutingTable:
    """hint → model, resolved from the YAML table."""

    def __init__(self, tiers: dict[str, dict[str, object]], fallback_tier: str) -> None:
        self._model_by_hint: dict[str, str] = {}
        self._model_by_tier: dict[str, str] = {}
        for tier_name, tier in tiers.items():
            model = _expand(str(tier.get("model", "")))
            self._model_by_tier[tier_name] = model
            for hint in tier.get("model_hints", []) or []:
                self._model_by_hint[str(hint)] = model
        self._fallback_tier = fallback_tier

    @property
    def fallback_model(self) -> str:
        """The model an unrecognised hint resolves to (`defaults.fallback_tier` in the YAML).

        The table names FAST, which is the safe direction to be wrong in: an unknown hint costs the
        cheap model rather than silently spending the expensive one.
        """
        return self._model_by_tier.get(self._fallback_tier, "")

    def model_for_hint(self, model_hint: str) -> str:
        return self._model_by_hint.get(model_hint, self.fallback_model)

    def hints(self) -> dict[str, str]:
        return dict(self._model_by_hint)


@lru_cache(maxsize=1)
def load_routing_table(path: str | None = None) -> RoutingTable:
    """Read and cache the table. Pass a path to load a different file (tests)."""
    table_path = Path(path) if path else ROUTING_TABLE_PATH
    raw = yaml.safe_load(table_path.read_text(encoding="utf-8")) or {}
    tiers = raw.get("tiers") or {}
    fallback = str((raw.get("defaults") or {}).get("fallback_tier", "FAST"))
    return RoutingTable(tiers, fallback)
