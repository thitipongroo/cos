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
  ) {
    super(message);
    this.name = 'ApiError';
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
    throw new ApiError(res.status, `Request failed: ${res.status}`);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

/** Hook returning a token-bound `apiFetch` for use inside client components. */
export function useApi(): <T>(path: string, init?: RequestInit) => Promise<T> {
  const { data } = useSession();
  const token = data?.accessToken;
  return useCallback(
    <T>(path: string, init?: RequestInit) => apiFetch<T>(path, token, init),
    [token],
  );
}

/** Hook for multipart uploads (e.g. photos via the File Service). Does NOT set a JSON
 *  content-type so the browser can add the multipart boundary. */
export function useUpload(): <T>(path: string, form: FormData) => Promise<T> {
  const { data } = useSession();
  const token = data?.accessToken;
  return useCallback(
    async <T>(path: string, form: FormData): Promise<T> => {
      const headers = new Headers();
      if (token) headers.set('authorization', `Bearer ${token}`);
      const res = await fetch(`${API_BASE}${path}`, { method: 'POST', headers, body: form });
      if (!res.ok) throw new ApiError(res.status, `Upload failed: ${res.status}`);
      return (await res.json()) as T;
    },
    [token],
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
  const { data } = useSession();
  const token = data?.accessToken;
  return useCallback(
    async <T>(
      path: string,
      init: RequestInit,
      entity: { type: string; id: string },
    ): Promise<T | QueuedResult> => {
      try {
        return await apiFetch<T>(path, token, init);
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
    [token],
  );
}
