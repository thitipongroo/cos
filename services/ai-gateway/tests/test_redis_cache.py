"""Unit tests for the LLM response cache — Phase 11 LLM Gateway.

§35.13 ESC-24: cache/redis_cache.py was entirely uncovered (23 statements). The cache key is the
part that matters: it is a sha256 over the template variables, so two calls that differ only in
dict ordering must hit the same entry, and any change to a variable must miss. A silent key bug
would serve one tenant's generated report to another.
"""

import hashlib
import json

import pytest

from cache.redis_cache import RedisResponseCache


class _FakeRedis:
    """Minimal aioredis stand-in recording the calls the cache makes."""

    def __init__(self, stored: dict[str, bytes] | None = None):
        self.stored = dict(stored or {})
        self.setex_calls: list[tuple[str, int, bytes]] = []
        self.deleted: list[str] = []

    async def get(self, key):
        return self.stored.get(key)

    async def setex(self, key, ttl, value):
        self.setex_calls.append((key, ttl, value))
        self.stored[key] = value

    async def delete(self, key):
        self.deleted.append(key)
        self.stored.pop(key, None)


def _expected_key(template: str, variables: dict) -> str:
    payload = json.dumps(variables, sort_keys=True, ensure_ascii=False)
    return f"llm:{template}:{hashlib.sha256(payload.encode()).hexdigest()}"


class TestMakeKey:
    def test_uses_the_documented_key_format(self):
        cache = RedisResponseCache(_FakeRedis())
        variables = {"project": "P1", "period": "2026-06"}
        assert cache._make_key("weekly_report", variables) == _expected_key(
            "weekly_report", variables
        )

    def test_is_insensitive_to_dict_ordering(self):
        """Same variables, different insertion order — one cache entry, not two."""
        cache = RedisResponseCache(_FakeRedis())
        a = cache._make_key("t", {"a": 1, "b": 2})
        b = cache._make_key("t", {"b": 2, "a": 1})
        assert a == b

    def test_a_changed_variable_changes_the_key(self):
        cache = RedisResponseCache(_FakeRedis())
        assert cache._make_key("t", {"a": 1}) != cache._make_key("t", {"a": 2})

    def test_a_changed_template_changes_the_key(self):
        cache = RedisResponseCache(_FakeRedis())
        assert cache._make_key("t1", {"a": 1}) != cache._make_key("t2", {"a": 1})

    def test_thai_variables_are_not_escaped_away(self):
        """ensure_ascii=False — two different Thai values must not collapse to the same key."""
        cache = RedisResponseCache(_FakeRedis())
        assert cache._make_key("t", {"note": "งานเสร็จ"}) != cache._make_key(
            "t", {"note": "งานล่าช้า"}
        )


class TestGet:
    @pytest.mark.asyncio
    async def test_returns_the_decoded_hit(self):
        variables = {"project": "P1"}
        redis = _FakeRedis({_expected_key("weekly", variables): b"generated text"})
        cache = RedisResponseCache(redis)

        assert await cache.get("weekly", variables) == "generated text"

    @pytest.mark.asyncio
    async def test_returns_none_on_a_miss(self):
        cache = RedisResponseCache(_FakeRedis())
        assert await cache.get("weekly", {"project": "P1"}) is None

    @pytest.mark.asyncio
    async def test_treats_an_empty_stored_value_as_a_miss(self):
        variables = {"project": "P1"}
        redis = _FakeRedis({_expected_key("weekly", variables): b""})
        cache = RedisResponseCache(redis)
        assert await cache.get("weekly", variables) is None


class TestSet:
    @pytest.mark.asyncio
    async def test_writes_with_the_default_ttl(self):
        redis = _FakeRedis()
        cache = RedisResponseCache(redis, default_ttl_seconds=3600)
        variables = {"project": "P1"}

        await cache.set("weekly", variables, "generated text")

        key, ttl, value = redis.setex_calls[0]
        assert key == _expected_key("weekly", variables)
        assert ttl == 3600
        assert value == b"generated text"

    @pytest.mark.asyncio
    async def test_a_per_call_ttl_overrides_the_default(self):
        redis = _FakeRedis()
        cache = RedisResponseCache(redis, default_ttl_seconds=3600)

        await cache.set("weekly", {"p": 1}, "text", ttl_seconds=60)

        assert redis.setex_calls[0][1] == 60

    @pytest.mark.asyncio
    async def test_a_zero_ttl_is_honoured_rather_than_falling_back(self):
        """`ttl_seconds if ttl_seconds is not None` — 0 is falsy but explicit, and must win."""
        redis = _FakeRedis()
        cache = RedisResponseCache(redis, default_ttl_seconds=3600)

        await cache.set("weekly", {"p": 1}, "text", ttl_seconds=0)

        assert redis.setex_calls[0][1] == 0

    @pytest.mark.asyncio
    async def test_a_written_value_is_readable_again(self):
        redis = _FakeRedis()
        cache = RedisResponseCache(redis)
        variables = {"project": "P1"}

        await cache.set("weekly", variables, "round trip")
        assert await cache.get("weekly", variables) == "round trip"


class TestInvalidate:
    @pytest.mark.asyncio
    async def test_deletes_the_matching_key(self):
        redis = _FakeRedis()
        cache = RedisResponseCache(redis)
        variables = {"project": "P1"}
        await cache.set("weekly", variables, "text")

        await cache.invalidate("weekly", variables)

        assert redis.deleted == [_expected_key("weekly", variables)]
        assert await cache.get("weekly", variables) is None
