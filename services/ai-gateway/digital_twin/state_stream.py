"""In-process fan-out of twin state changes to SSE subscribers — Phase 24 (master:5610).

`subscribeToStateChanges(projectId): AsyncIterable<TwinStateEvent>` is the third of the three query
methods the spec names, and it was the one with no implementation.

WHY SSE, AND WHY THE FAN-OUT IS IN PROCESS (product-owner decision 2026-08-25).

SSE, because the stream is one-way. The spec's own signature is an AsyncIterable — the client never
sends anything back — and a one-way stream over SSE rides the existing L7 path without sticky
sessions, connection draining or a load balancer that understands the upgrade handshake. Nothing in
this platform speaks WebSocket today and §19.2 bans it outright for notifications, so choosing it
here would introduce the first one for a case that does not need duplex. Going SSE now and adding
WebSocket later is the cheap direction; the reverse is not.

The fan-out is in process because ONE Kafka consumer already runs in this service and reads the
telemetry topic. Opening a consumer per HTTP connection would create a consumer group per browser
tab, rebalance the topic on every page load, and read the same partitions many times over. So the
consumer publishes here after it publishes to Kafka, and each subscriber gets a bounded queue.

WHAT THIS IS NOT: a durable subscription. A client that disconnects misses what happened while it
was away and re-reads current state through GET /projects/{id}/state on reconnect. The twin is
eventually consistent and read-optimised (master:5646) — the stream is a nudge, not a log. A
durable, cross-replica fan-out is the Azure Digital Twins shape (route to an event bus, then a
separate broadcast tier), and it belongs to whoever builds the browser tier, not here.
"""

from __future__ import annotations

import asyncio
import logging
from typing import AsyncIterator

logger = logging.getLogger("digital-twin.state-stream")

# Bounded on purpose. A subscriber that stops reading — a laptop that slept, a tab behind a
# breakpoint — must not grow this queue without limit; the oldest event is dropped instead, because
# for a state stream the newest reading is the one that matters.
_QUEUE_MAXSIZE = 100

# (tenant_id, project_id) -> live subscriber queues.
_subscribers: dict[tuple[str, str], set[asyncio.Queue]] = {}


def subscriber_count(tenant_id: str, project_id: str) -> int:
    """How many streams are open for this project. Exposed for tests and metrics."""
    return len(_subscribers.get((str(tenant_id), str(project_id)), ()))


def publish(tenant_id: str, project_id: str, payload: dict) -> int:
    """Hand one twin-state payload to every subscriber of that project. Returns how many got it.

    Tenant AND project both key the fan-out: a subscriber must never see another tenant's readings,
    and the HTTP layer has already verified the caller's tenant before subscribing.
    """
    queues = _subscribers.get((str(tenant_id), str(project_id)))
    if not queues:
        return 0

    delivered = 0
    for queue in queues:
        if queue.full():
            # Drop the oldest, not the newest: a stale reading is worth less than the current one.
            try:
                queue.get_nowait()
            except asyncio.QueueEmpty:  # pragma: no cover - race with a consumer that just drained
                pass
        queue.put_nowait(payload)
        delivered += 1
    return delivered


async def subscribe(tenant_id: str, project_id: str) -> AsyncIterator[dict]:
    """Yield twin-state payloads for one project until the caller stops iterating."""
    key = (str(tenant_id), str(project_id))
    queue: asyncio.Queue = asyncio.Queue(maxsize=_QUEUE_MAXSIZE)
    _subscribers.setdefault(key, set()).add(queue)
    logger.info("twin state stream opened (project %s)", project_id)
    try:
        while True:
            yield await queue.get()
    finally:
        # Always runs — including on client disconnect, which is how the registry stays bounded.
        holders = _subscribers.get(key)
        if holders is not None:
            holders.discard(queue)
            if not holders:
                del _subscribers[key]
        logger.info("twin state stream closed (project %s)", project_id)
