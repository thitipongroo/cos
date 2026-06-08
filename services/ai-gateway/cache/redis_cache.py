import hashlib
import json
from typing import Any

import redis.asyncio as aioredis


class RedisResponseCache:
    """LLM response cache — TTL configurable per template.

    Key format: llm:{template_name}:{sha256(variables_json)}
    Source: context/00_master_construction_os.md §Phase 11 LLM Gateway.
    """

    def __init__(self, client: aioredis.Redis, default_ttl_seconds: int = 3600) -> None:
        self._client = client
        self._default_ttl = default_ttl_seconds

    def _make_key(self, template_name: str, variables: dict[str, Any]) -> str:
        payload = json.dumps(variables, sort_keys=True, ensure_ascii=False)
        digest = hashlib.sha256(payload.encode()).hexdigest()
        return f"llm:{template_name}:{digest}"

    async def get(self, template_name: str, variables: dict[str, Any]) -> str | None:
        key = self._make_key(template_name, variables)
        value = await self._client.get(key)
        return value.decode() if value else None

    async def set(
        self,
        template_name: str,
        variables: dict[str, Any],
        response: str,
        ttl_seconds: int | None = None,
    ) -> None:
        key = self._make_key(template_name, variables)
        ttl = ttl_seconds if ttl_seconds is not None else self._default_ttl
        await self._client.setex(key, ttl, response.encode())

    async def invalidate(self, template_name: str, variables: dict[str, Any]) -> None:
        key = self._make_key(template_name, variables)
        await self._client.delete(key)
