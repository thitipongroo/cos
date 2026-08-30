"""Twin state fan-out — master:5610 subscribeToStateChanges.

The behaviour that matters is not "a stream exists" but what it does at the edges: that a subscriber
of one project never sees another's readings, that a tenant never sees another tenant's, that a
client which stops reading cannot grow the queue without bound, and that a disconnect leaves nothing
behind. Those are the four ways a fan-out goes wrong in production.
"""

from __future__ import annotations

import asyncio

import pytest

from digital_twin import state_stream

TENANT_A = "11111111-1111-1111-1111-111111111111"
TENANT_B = "22222222-2222-2222-2222-222222222222"
PROJECT_1 = "aaaaaaaa-1111-1111-1111-111111111111"
PROJECT_2 = "bbbbbbbb-2222-2222-2222-222222222222"


async def _open(tenant: str, project: str):
    """Open a subscription and let it register before returning it."""
    stream = state_stream.subscribe(tenant, project)
    task = asyncio.ensure_future(stream.__anext__())
    # Yield control so subscribe() reaches its first await and the queue is in the registry.
    await asyncio.sleep(0)
    return stream, task


async def _close(stream, task) -> None:
    """Cancel the pending read, let the cancellation settle, then close the generator.

    aclose() on a generator that is still mid-await raises "already running", so the tick between
    the two is not optional.
    """
    task.cancel()
    await asyncio.sleep(0)
    try:
        await task
    except (asyncio.CancelledError, StopAsyncIteration):
        pass
    await stream.aclose()


class TestFanOut:
    @pytest.mark.asyncio
    async def test_a_subscriber_receives_its_own_project(self):
        stream, first = await _open(TENANT_A, PROJECT_1)
        try:
            delivered = state_stream.publish(TENANT_A, PROJECT_1, {"entity_id": "e1"})
            assert delivered == 1
            assert (await asyncio.wait_for(first, timeout=1))["entity_id"] == "e1"
        finally:
            await stream.aclose()

    @pytest.mark.asyncio
    async def test_another_project_is_not_delivered(self):
        stream, first = await _open(TENANT_A, PROJECT_1)
        try:
            assert state_stream.publish(TENANT_A, PROJECT_2, {"entity_id": "other"}) == 0
            with pytest.raises(asyncio.TimeoutError):
                await asyncio.wait_for(asyncio.shield(first), timeout=0.05)
        finally:
            await _close(stream, first)

    @pytest.mark.asyncio
    async def test_another_TENANT_is_not_delivered(self):
        # The one that would be a breach rather than a bug. Same project id, different tenant — an
        # id collision across tenants must not cross the boundary.
        stream, first = await _open(TENANT_A, PROJECT_1)
        try:
            assert state_stream.publish(TENANT_B, PROJECT_1, {"entity_id": "theirs"}) == 0
            with pytest.raises(asyncio.TimeoutError):
                await asyncio.wait_for(asyncio.shield(first), timeout=0.05)
        finally:
            await _close(stream, first)

    @pytest.mark.asyncio
    async def test_two_subscribers_of_one_project_both_receive(self):
        s1, f1 = await _open(TENANT_A, PROJECT_1)
        s2, f2 = await _open(TENANT_A, PROJECT_1)
        try:
            assert state_stream.publish(TENANT_A, PROJECT_1, {"entity_id": "e1"}) == 2
            assert (await asyncio.wait_for(f1, timeout=1))["entity_id"] == "e1"
            assert (await asyncio.wait_for(f2, timeout=1))["entity_id"] == "e1"
        finally:
            await s1.aclose()
            await s2.aclose()


class TestBackpressureAndCleanup:
    @pytest.mark.asyncio
    async def test_a_slow_subscriber_drops_the_oldest_rather_than_growing(self):
        # A laptop that slept, or a tab paused on a breakpoint. The queue is bounded; the newest
        # reading is the one worth keeping for a state stream.
        stream, first = await _open(TENANT_A, PROJECT_1)
        try:
            overflow = state_stream._QUEUE_MAXSIZE + 10
            for i in range(overflow):
                state_stream.publish(TENANT_A, PROJECT_1, {"seq": i})

            queues = state_stream._subscribers[(TENANT_A, PROJECT_1)]
            queue = next(iter(queues))
            assert queue.qsize() <= state_stream._QUEUE_MAXSIZE

            # What survived is the tail, not the head.
            newest = queue.get_nowait()
            assert newest["seq"] > 0
        finally:
            await _close(stream, first)

    @pytest.mark.asyncio
    async def test_closing_a_stream_deregisters_it(self):
        stream, first = await _open(TENANT_A, PROJECT_1)
        assert state_stream.subscriber_count(TENANT_A, PROJECT_1) == 1

        await _close(stream, first)

        # Nothing left behind: the key is gone, not merely emptied, so the registry cannot grow one
        # entry per project that was ever watched.
        assert state_stream.subscriber_count(TENANT_A, PROJECT_1) == 0
        assert (TENANT_A, PROJECT_1) not in state_stream._subscribers

    @pytest.mark.asyncio
    async def test_publishing_with_no_subscribers_is_a_no_op(self):
        assert state_stream.publish(TENANT_A, "cccccccc-3333-3333-3333-333333333333", {"a": 1}) == 0
