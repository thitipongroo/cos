'use client';

/**
 * Authenticated API client for the web operational pages.
 *
 * The NestJS backend authenticates via `Authorization: Bearer <access_token>`
 * only (keycloak-jwt strategy uses `ExtractJwt.fromAuthHeaderAsBearerToken()`),
 * so every browser→backend call must carry the next-auth session access token
 * in that header. RLS/ABAC tenant scoping is enforced server-side from the JWT.
 */
import { useSession } from 'next-auth/react';
import { useCallback } from 'react';
import { isSyncPushable } from '@cos/types';
import { enqueueMutation } from '../pwa/sync-service';

export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    /**
     * The API's own error code (`{ error: { code } }`, docs/api/error-codes.md) when the body carried one — so a
     * screen can tell two 409s apart (COS-PLAN-002 vs COS-PLAN-004) or a read-only trial's 403 (COS-PLAN-003)
     * from a missing role. Undefined when the body was not the API's error envelope.
     */
    public readonly code?: string,
    public readonly details?: Record<string, unknown>,
    /**
     * The API's i18n key for the case (`{ error: { messageKey } }`) when the body carried one — so a screen can say
     * why in the user's language (plan CW) rather than show the server's English message.
     */
    public readonly messageKey?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** The `{ error: { code, details, messageKey } }` envelope of HttpExceptionFilter, or nothing when not one. */
async function readErrorEnvelope(
  res: Response,
): Promise<{ code?: string; details?: Record<string, unknown>; messageKey?: string }> {
  try {
    const body = (await res.json()) as {
      error?: { code?: unknown; details?: unknown; messageKey?: unknown };
    } | null;
    const error = body?.error;
    return {
      code: typeof error?.code === 'string' ? error.code : undefined,
      messageKey: typeof error?.messageKey === 'string' ? error.messageKey : undefined,
      details:
        error?.details && typeof error.details === 'object'
          ? (error.details as Record<string, unknown>)
          : undefined,
    };
  } catch {
    // Not JSON (a proxy's HTML page, an empty body): the status alone has to do.
    return {};
  }
}

/** Low-level fetch wrapper that injects the Bearer token and parses JSON. */
export async function apiFetch<T>(
  path: string,
  token: string | undefined,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers);
  // Only advertise a JSON body when one is actually sent. Setting content-type: application/json on a
  // bodyless request (e.g. PATCH .../acknowledge) makes Fastify try to parse an empty body and reject
  // it with 400 "Body cannot be empty when content-type is set to 'application/json'".
  if (init?.body != null) {
    headers.set('content-type', 'application/json');
  }
  if (token) {
    headers.set('authorization', `Bearer ${token}`);
  }
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    const { code, details, messageKey } = await readErrorEnvelope(res);
    throw new ApiError(res.status, `Request failed: ${res.status}`, code, details, messageKey);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

/**
 * The token a request is sent with (plan DM). `SessionProvider` gets no session from the server, so on a hard load
 * the first renders see the session `loading` with no token, and a request sent then went out unauthenticated (401,
 * recovered only by the retry plan DL kept for it). While loading, the request waits for the provider's OWN session
 * fetch to settle (`sessionSettled`) and uses its token — never a second `/api/auth/session` request: the backend's
 * refresh tokens are single-use, and two concurrent session reads with an expired access token would both refresh
 * it, the loser's cookie able to sign the user out (found by /doubt). Signed in or signed out, the token in hand.
 */
export async function tokenFor(
  status: 'loading' | 'authenticated' | 'unauthenticated',
  token: string | undefined,
  waitForSession: () => Promise<string | undefined>,
): Promise<string | undefined> {
  if (token || status !== 'loading') return token;
  return waitForSession();
}

/** How long a request waits for the session before going out without a token (a 401, which plan DL retries). */
export const SESSION_WAIT_MS = 10_000;

let settledToken: string | undefined;
let isSettled = false;
let waiters: Array<(token: string | undefined) => void> = [];

/**
 * Called by `SessionSettledReporter` (app/providers.tsx) whenever the provider's session is no longer loading, with
 * its token (none when signed out). Releases every request waiting in `sessionSettled`.
 */
export function reportSessionSettled(token: string | undefined): void {
  settledToken = token;
  isSettled = true;
  const pending = waiters;
  waiters = [];
  for (const release of pending) release(token);
}

/**
 * The provider's session token once its first fetch has settled — at once if it already has; else when it does, or
 * `undefined` after `timeoutMs` so a stalled session fetch cannot hold requests forever.
 */
export function sessionSettled(timeoutMs: number = SESSION_WAIT_MS): Promise<string | undefined> {
  if (isSettled) return Promise.resolve(settledToken);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      waiters = waiters.filter((w) => w !== release);
      resolve(undefined);
    }, timeoutMs);
    const release = (token: string | undefined) => {
      clearTimeout(timer);
      resolve(token);
    };
    waiters.push(release);
  });
}

/** Test seam: back to "not yet settled". */
export function resetSessionSettled(): void {
  settledToken = undefined;
  isSettled = false;
  waiters = [];
}

/** Hook returning a token-bound `apiFetch` for use inside client components. */
export function useApi(): <T>(path: string, init?: RequestInit) => Promise<T> {
  const { data, status } = useSession();
  const token = data?.accessToken;
  return useCallback(
    async <T>(path: string, init?: RequestInit) =>
      apiFetch<T>(path, await tokenFor(status, token, sessionSettled), init),
    [token, status],
  );
}

/** Hook for multipart uploads (e.g. photos via the File Service). Does NOT set a JSON
 *  content-type so the browser can add the multipart boundary. */
export function useUpload(): <T>(path: string, form: FormData) => Promise<T> {
  const { data, status } = useSession();
  const token = data?.accessToken;
  return useCallback(
    async <T>(path: string, form: FormData): Promise<T> => {
      const headers = new Headers();
      const bearer = await tokenFor(status, token, sessionSettled);
      if (bearer) headers.set('authorization', `Bearer ${bearer}`);
      const res = await fetch(`${API_BASE}${path}`, { method: 'POST', headers, body: form });
      if (!res.ok) throw new ApiError(res.status, `Upload failed: ${res.status}`);
      return (await res.json()) as T;
    },
    [token, status],
  );
}

/** What a mutation returns when the network was gone and it was stored for replay instead. */
export interface QueuedResult {
  queued: true;
}

export function isQueued(value: unknown): value is QueuedResult {
  return typeof value === 'object' && value !== null && 'queued' in value;
}

/**
 * A mutation that survives being offline (spec 17 §17.4; master:3620).
 *
 * On a NETWORK failure the mutation is written to the IndexedDB queue and `{ queued: true }` comes
 * back, so the caller can tell the user their work is saved rather than showing an error for
 * something that will be sent. A failure the SERVER produced is NOT queued — a 400 or a 403 will
 * fail again identically on replay, and burying it in the queue turns an error the user could have
 * fixed into five silent retries and a FAILED row.
 *
 * `entityType` is checked against SYNC_PUSHABLE_ENTITY_TYPES — the single declaration in @cos/types
 * that the backend's switch and the mobile client are also held to — so this cannot become a way to
 * queue something /sync/push has no case for.
 */
export function useOfflineApi(): <T>(
  path: string,
  init: RequestInit,
  entity: { type: string; id: string },
) => Promise<T | QueuedResult> {
  const { data, status } = useSession();
  const token = data?.accessToken;
  return useCallback(
    async <T>(
      path: string,
      init: RequestInit,
      entity: { type: string; id: string },
    ): Promise<T | QueuedResult> => {
      try {
        return await apiFetch<T>(path, await tokenFor(status, token, sessionSettled), init);
      } catch (error) {
        // ApiError means the server answered. Only a transport failure gets queued.
        if (error instanceof ApiError) throw error;
        if (!isSyncPushable(entity.type)) throw error;

        const method = (init.method ?? 'POST').toUpperCase();
        await enqueueMutation(
          entity.type,
          entity.id,
          method === 'POST' ? 'CREATE' : 'UPDATE',
          init.body ? JSON.parse(String(init.body)) : {},
        );
        return { queued: true };
      }
    },
    [token, status],
  );
}
