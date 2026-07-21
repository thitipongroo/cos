"""Unit tests for the LLM response cache (§Phase 11 LLM Gateway — "Response caching (Redis, TTL
configurable per template)").

The file was at 0% coverage. The risk it carries is not "does Redis work" but the key function:
two different prompts hashing to the same key would serve one tenant's report as another's, and a
key that varies on dict ordering would make the cache never hit. Both are asserted here with a fake
Redis client — no server involved.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from cache.redis_cache import RedisResponseCache


class _FakeRedis:
    def __init__(self, initial: dict | None = None):
        self.store: dict = dict(initial or {})
        self.setex_calls: list = []
        self.deleted: list = []

    async def get(self, key):
        return self.store.get(key)

    async def setex(self, key, ttl, value):
        self.setex_calls.append((key, ttl, value))
        self.store[key] = value

    async def delete(self, key):
        self.deleted.append(key)
        self.store.pop(key, None)


class TestKeyDerivation:
    def test_key_is_namespaced_by_template(self):
        cache = RedisResponseCache(_FakeRedis())
        key = cache._make_key("report-daily-summary-v1", {"project": "p1"})

        assert key.startswith("llm:report-daily-summary-v1:")

    def test_same_variables_in_a_different_order_hit_the_same_key(self):
        # Python dicts preserve insertion order, so without sort_keys the cache would miss on every
        # call whose variables were assembled in a different order — a silent 100% miss rate.
        cache = RedisResponseCache(_FakeRedis())

        assert cache._make_key("t", {"a": 1, "b": 2}) == cache._make_key("t", {"b": 2, "a": 1})

    def test_different_variables_produce_different_keys(self):
        # The failure this prevents: one project's cached report served for another project.
        cache = RedisResponseCache(_FakeRedis())

        assert cache._make_key("t", {"project": "p1"}) != cache._make_key("t", {"project": "p2"})

    def test_same_variables_under_different_templates_do_not_collide(self):
        cache = RedisResponseCache(_FakeRedis())

        assert cache._make_key("summary", {"p": 1}) != cache._make_key("executive", {"p": 1})

    def test_thai_variables_are_not_escaped_before_hashing(self):
        # ensure_ascii=False keeps Thai text intact; escaping would still hash deterministically but
        # this pins the documented behaviour so a future change is a visible decision.
        cache = RedisResponseCache(_FakeRedis())
        expected_payload = json.dumps({"note": "รายงาน"}, sort_keys=True, ensure_ascii=False)

        import hashlib

        digest = hashlib.sha256(expected_payload.encode()).hexdigest()
        assert cache._make_key("t", {"note": "รายงาน"}) == f"llm:t:{digest}"


class TestGet:
    @pytest.mark.asyncio
    async def test_returns_none_on_a_miss(self):
        cache = RedisResponseCache(_FakeRedis())

        assert await cache.get("t", {"a": 1}) is None

    @pytest.mark.asyncio
    async def test_decodes_the_cached_bytes(self):
        client = _FakeRedis()
        cache = RedisResponseCache(client)
        client.store[cache._make_key("t", {"a": 1})] = "สรุปรายงาน".encode()

        assert await cache.get("t", {"a": 1}) == "สรุปรายงาน"

    @pytest.mark.asyncio
    async def test_empty_cached_value_reads_as_a_miss(self):
        # b"" is falsy — the code treats it as absent rather than returning an empty report.
        client = _FakeRedis()
        cache = RedisResponseCache(client)
        client.store[cache._make_key("t", {"a": 1})] = b""

        assert await cache.get("t", {"a": 1}) is None


class TestSet:
    @pytest.mark.asyncio
    async def test_writes_with_the_default_ttl(self):
        client = _FakeRedis()
        cache = RedisResponseCache(client)

        await cache.set("t", {"a": 1}, "answer")

        key, ttl, value = client.setex_calls[0]
        assert key == cache._make_key("t", {"a": 1})
        assert ttl == 3600
        assert value == b"answer"

    @pytest.mark.asyncio
    async def test_per_call_ttl_overrides_the_default(self):
        # "TTL configurable per template" — a short-lived template must not inherit the hour default.
        client = _FakeRedis()
        cache = RedisResponseCache(client)

        await cache.set("t", {"a": 1}, "answer", ttl_seconds=30)

        assert client.setex_calls[0][1] == 30

    @pytest.mark.asyncio
    async def test_zero_ttl_is_honoured_not_treated_as_absent(self):
        # `ttl_seconds is not None` rather than a truthiness check — 0 must reach Redis.
        client = _FakeRedis()
        cache = RedisResponseCache(client)

        await cache.set("t", {"a": 1}, "answer", ttl_seconds=0)

        assert client.setex_calls[0][1] == 0

    @pytest.mark.asyncio
    async def test_constructor_default_ttl_is_configurable(self):
        client = _FakeRedis()
        cache = RedisResponseCache(client, default_ttl_seconds=120)

        await cache.set("t", {"a": 1}, "answer")

        assert client.setex_calls[0][1] == 120

    @pytest.mark.asyncio
    async def test_round_trips_through_get(self):
        cache = RedisResponseCache(_FakeRedis())

        await cache.set("t", {"a": 1}, "สรุป")

        assert await cache.get("t", {"a": 1}) == "สรุป"


class TestInvalidate:
    @pytest.mark.asyncio
    async def test_deletes_the_matching_key(self):
        client = _FakeRedis()
        cache = RedisResponseCache(client)
        await cache.set("t", {"a": 1}, "answer")

        await cache.invalidate("t", {"a": 1})

        assert client.deleted == [cache._make_key("t", {"a": 1})]
        assert await cache.get("t", {"a": 1}) is None

    @pytest.mark.asyncio
    async def test_invalidating_a_missing_key_is_not_an_error(self):
        cache = RedisResponseCache(_FakeRedis())

        await cache.invalidate("t", {"never": "cached"})
