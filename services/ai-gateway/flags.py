"""Feature-flag client — server-evaluated via the backend GET /api/v1/flags (ADR-049; QM-15).

The gateway does NOT talk to Unleash. It polls the backend flag endpoint (which evaluates
per-tenant via Unleash) with a short TTL cache. Kill-switches fail OPEN: if the backend or
flag service is unreachable, reports keep working — an outage of the flag path must never
disable a live feature. Set BACKEND_FLAGS_URL (e.g. http://backend:3000/api/v1/flags);
unset = fallback defaults (local dev, unit tests).
"""
import os
import time

import httpx

FLAG_AI_REPORTS = "s1.ai.report-generation"
FLAG_AI_COMPLETIONS = "s1.ai.completions"

_TTL_SECONDS = 15.0  # matches backend Unleash poll — kill switch stays inside the 60s bound
_cache: dict = {"at": 0.0, "flags": {}}


def _reset_cache() -> None:
    """Test hook — clears the TTL cache."""
    _cache["at"] = 0.0
    _cache["flags"] = {}


async def is_enabled(flag: str, default: bool = True) -> bool:
    base_url = os.getenv("BACKEND_FLAGS_URL", "")
    if not base_url:
        return default
    now = time.monotonic()
    if now - _cache["at"] > _TTL_SECONDS:
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                resp = await client.get(base_url)
                resp.raise_for_status()
                _cache["flags"] = resp.json().get("flags", {})
        except Exception:  # noqa: BLE001 — any flag-path failure degrades to last-known/default
            pass
        _cache["at"] = now  # back off for a full TTL either way
    return bool(_cache["flags"].get(flag, default))
