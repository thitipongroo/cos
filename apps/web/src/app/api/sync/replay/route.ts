// Server-side replay of one queued offline mutation (spec §Phase 10 Web App Stack; master:3620).
//
// WHY THIS ROUTE EXISTS AT ALL. The queue is drained by the Service Worker, which runs after the tab
// is closed — that is the whole point of Background Sync. But the NestJS backend authenticates with
// `Authorization: Bearer <access_token>` and lives on a DIFFERENT origin
// (NEXT_PUBLIC_API_URL), so the browser sends it no cookies and the worker has no session to read.
// The two obvious ways out are both bad:
//
//   - Store the bearer token beside each queued item in IndexedDB. That puts a live credential in
//     scriptable, on-disk storage for as long as the queue is unflushed, and it still fails: a
//     mutation replayed hours later carries a token that expired long before.
//   - Have the page flush instead of the worker. Then nothing replays after the tab closes, which is
//     precisely the case an offline queue exists for.
//
// This route is same-origin to the app, so a Service Worker fetch carries the NextAuth session
// cookie — httpOnly, unreadable by any script — and `getServerSession` runs the jwt callback, which
// ROTATES an expired access token through the backend before handing it over. The credential never
// enters IndexedDB, never reaches client JavaScript, and is always fresh at the moment of replay.
//
// The queue therefore stores the mutation only. That is what makes "replay after the tab is gone"
// and "no credential at rest on the device" hold at the same time.

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { isSyncPushable } from '@cos/types';
import { authOptions } from '../../../../lib/auth/options';

// Read here rather than imported from lib/api/client: that module is 'use client' and pulling it
// into a route handler drags React and next-auth/react into the server bundle.
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

interface ReplayBody {
  entity_type?: unknown;
  entity_id?: unknown;
  operation?: unknown;
  payload?: unknown;
  client_submitted_at?: unknown;
}

export async function POST(request: Request): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  const token = session?.accessToken;
  if (!token || session?.error) {
    // The refresh token is gone or rotation failed. Answering 401 leaves the item PENDING on the
    // device rather than consuming one of its retries against a session that cannot be recovered
    // without the user signing in again.
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  let body: ReplayBody;
  try {
    body = (await request.json()) as ReplayBody;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const entityType = body.entity_type;
  // The same single declaration the backend's switch and the mobile client are held to
  // (@cos/types). Refusing an unknown type here keeps this route from becoming a second, laxer
  // doorway into /sync/push than the one the mobile app goes through.
  if (typeof entityType !== 'string' || !isSyncPushable(entityType)) {
    return NextResponse.json({ error: 'entity_type not offline-pushable' }, { status: 400 });
  }

  const upstream = await fetch(`${API_BASE}/sync/push`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      entity_type: entityType,
      entity_id: body.entity_id,
      operation: body.operation,
      payload: body.payload,
      client_submitted_at: body.client_submitted_at,
    }),
  });

  // The server's verdict is passed through untouched — ACCEPTED / CONFLICT_FLAGGED /
  // CONFLICT_REJECTED is the client's business (§17.5), not this route's.
  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  });
}
