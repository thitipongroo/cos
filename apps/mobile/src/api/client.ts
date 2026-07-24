// DeltaSyncClient — Priority 0 Section F (spec §Phase 10)
// Axios-based HTTP client with:
//   - Auth token injection from authStore
//   - 401 → silent refresh flow
//   - Offline queue: mutations enqueued to sync_queue when network unavailable
//   - Delta sync: GET /api/v1/sync/delta?since={timestamp}&entity_types[]=...

import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';
import { useAuthStore } from '../store/authStore';
import { enqueue, SyncOperation } from '../db/sync-queue';

const BASE_URL = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:3000/api/v1';

// Maximum retries for 401 → refresh flow

interface DeltaResponse<T> {
  updated: T[];
  deleted: string[];
  server_timestamp: string;
}

// ── Axios instance ─────────────────────────────────────────────────────────

const http: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach access token before every request
http.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token && config.headers) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 → attempt silent token refresh once
let isRefreshing = false;
let refreshQueue: Array<(token: string) => void> = [];

http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as AxiosRequestConfig & { _retried?: boolean };

    if (error.response?.status !== 401 || originalRequest._retried) {
      return Promise.reject(error);
    }

    originalRequest._retried = true;

    if (isRefreshing) {
      return new Promise<string>((resolve) => refreshQueue.push(resolve)).then((token) => {
        if (originalRequest.headers) {
          originalRequest.headers['Authorization'] = `Bearer ${token}`;
        }
        return http(originalRequest);
      });
    }

    isRefreshing = true;

    try {
      const refreshToken = useAuthStore.getState().refreshToken;
      if (!refreshToken) {
        await useAuthStore.getState().logout();
        return Promise.reject(error);
      }

      const { data } = await axios.post<{ access_token: string; refresh_token?: string }>(
        `${BASE_URL}/auth/refresh`,
        { refresh_token: refreshToken },
      );

      const newToken = data.access_token;
      await useAuthStore.getState().updateAccessToken(newToken);
      // Keycloak issues single-use refresh tokens (revokeRefreshToken=true) — the old one is now
      // invalid, so persist the rotated token or the next refresh fails and forces a re-login.
      if (data.refresh_token) {
        await useAuthStore.getState().updateRefreshToken(data.refresh_token);
      }

      refreshQueue.forEach((resolve) => resolve(newToken));
      refreshQueue = [];

      if (originalRequest.headers) {
        originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
      }
      return http(originalRequest);
    } catch {
      await useAuthStore.getState().logout();
      return Promise.reject(error);
    } finally {
      isRefreshing = false;
    }
  },
);

// ── Delta sync ─────────────────────────────────────────────────────────────

export async function fetchDelta<T>(
  entityTypes: string[],
  since: string,
): Promise<DeltaResponse<T>> {
  const params = new URLSearchParams({ since });
  entityTypes.forEach((t) => params.append('entity_types[]', t));
  const { data } = await http.get<DeltaResponse<T>>(`/sync/delta?${params.toString()}`);
  return data;
}

// ── Mutation with offline fallback ─────────────────────────────────────────
// When offline (network error), the mutation is enqueued to sync_queue
// and resolves as { queued: true }. The SyncManager will replay it later.

export interface QueuedResult {
  queued: true;
  queueId: number;
}

export async function mutate<T>(
  method: 'POST' | 'PATCH' | 'PUT',
  path: string,
  payload: unknown,
  entityType: string,
  entityId: string,
): Promise<T | QueuedResult> {
  try {
    const { data } = await http.request<T>({ method, url: path, data: payload });
    return data;
  } catch (err: unknown) {
    if (isNetworkError(err)) {
      const op: SyncOperation = method === 'POST' ? 'CREATE' : 'UPDATE';
      const queueId = enqueue(entityType, entityId, op, payload);
      return { queued: true, queueId };
    }
    throw err;
  }
}

// ── Non-queuing POST ─────────────────────────────────────────────────────────
// Unlike mutate(), this NEVER enqueues on network error — it throws so the caller can surface an
// offline/"unavailable" state. Use for online-only actions that must not be replayed later, e.g.
// AI report generation (master 3099 — EXEC reports are read-only/last-cached offline, not queued).
export async function post<T>(path: string, payload: unknown): Promise<T> {
  const { data } = await http.post<T>(path, payload);
  return data;
}

// ── GET helper ─────────────────────────────────────────────────────────────

export async function get<T>(path: string, params?: Record<string, string>): Promise<T> {
  const { data } = await http.get<T>(path, { params });
  return data;
}

// ── Network error detection ────────────────────────────────────────────────

function isNetworkError(err: unknown): boolean {
  return (
    axios.isAxiosError(err) &&
    (err.code === 'ERR_NETWORK' || err.code === 'ECONNABORTED' || !err.response)
  );
}

export { http as apiClient };
