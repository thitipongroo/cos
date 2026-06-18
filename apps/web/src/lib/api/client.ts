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
  headers.set('content-type', 'application/json');
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
