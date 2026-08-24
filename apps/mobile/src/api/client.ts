// DeltaSyncClient — Priority 0 Section F (spec §Phase 10)
// Axios-based HTTP client with:
//   - Auth token injection from authStore
//   - 401 → silent refresh flow
//   - Offline queue: mutations enqueued to sync_queue when network unavailable
//   - Delta sync: GET /api/v1/sync/delta?since={timestamp}&entity_types[]=...

import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';
import { useAuthStore } from '../store/authStore';
import { enqueue, SyncOperation } from '../db/sync-queue';
import { isNetworkError, isTimeout } from '../sync/httpFailure';
import { SYNC_PUSHABLE_ENTITY_TYPES } from '@cos/types';

const BASE_URL = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:3000/api/v1';

/**
 * The same base the axios instance below uses, exported for the few callers that need a full URL
 * rather than a request — handing a link to the system browser, for one (the policy PDF, ADR-091).
 * Exported rather than re-derived so there is one place the base is decided.
 */
export const API_BASE_URL = BASE_URL;

// Maximum retries for 401 → refresh flow

export interface DeltaResponse<T> {
  updated: T[];
  deleted: string[];
  /** The cursor to send as `since` on the NEXT call — not necessarily "now"; see `has_more`. */
  server_timestamp: string;
  /**
   * At least one entity type had more rows than fit in this page (server cap: 500 per type). The
   * client MUST call again with the returned `server_timestamp` until this is false.
   *
   * Absent on older backends, hence optional — treated as false, which is the pre-paging behaviour.
   */
  has_more?: boolean;
  /**
   * `since` predates the server's tombstone retention window, so `deleted` is NOT complete: rows
   * deleted and then pruned while this device was away are absent from it and would otherwise
   * survive locally forever. The client must drop its local copies of these entity types before
   * applying the pages.
   */
  full_resync_required?: boolean;
  /** Retention window in days, sent only alongside `full_resync_required`, for logging. */
  retention_days?: number;
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
//
// THE WAITERS MUST ALWAYS BE SETTLED. Requests that hit a 401 while a refresh is already in flight
// park themselves in `refreshQueue` and wait for the new token. Until 2026-08-19 only the SUCCESS
// path drained that queue: when a refresh failed, every parked promise was left pending forever, so
// each of those screens sat in its loading state until the app was restarted — and the entries stayed
// in the array, to be resolved by some later refresh and replayed against a session the user had
// already been logged out of. Both halves now settle, which is why these are pairs and not bare
// resolvers.
let isRefreshing = false;
let refreshQueue: Array<{ resolve: (token: string) => void; reject: (reason: unknown) => void }> =
  [];

/**
 * Put the freshly-minted bearer token on a request that is about to be replayed.
 *
 * `Object.assign` rather than `if (config.headers)`: axios always normalises headers before an
 * interceptor sees the config, so the guard's false branch was unreachable — an untestable line
 * standing in for a case that cannot happen, in a file where "cannot happen" had already been wrong
 * once. This sets the header whether or not any existed.
 */
function withBearer(config: AxiosRequestConfig, token: string): void {
  config.headers = Object.assign({}, config.headers, {
    Authorization: `Bearer ${token}`,
  }) as AxiosRequestConfig['headers'];
}

/** Hand the new token to everything that was waiting, or fail them all. Always empties the queue. */
function settleRefreshQueue(token: string | null, reason?: unknown): void {
  const waiting = refreshQueue;
  refreshQueue = [];
  for (const waiter of waiting) {
    if (token === null) waiter.reject(reason);
    else waiter.resolve(token);
  }
}

http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as AxiosRequestConfig & { _retried?: boolean };

    if (error.response?.status !== 401 || originalRequest._retried) {
      return Promise.reject(error);
    }

    originalRequest._retried = true;

    if (isRefreshing) {
      return new Promise<string>((resolve, reject) => refreshQueue.push({ resolve, reject })).then(
        (token) => {
          withBearer(originalRequest, token);
          return http(originalRequest);
        },
      );
    }

    isRefreshing = true;
    // Settled in `finally`, never on a branch. An earlier version drained the queue inline on each
    // failure path, which looked complete and was not: the "no refresh token" branch drained an
    // EMPTY queue and then awaited `logout()`, and a concurrent 401 arriving during that await
    // parked a waiter behind an `isRefreshing` that nothing would ever clear again. Deciding the
    // outcome here and settling once, after the flag drops, is what makes "always settled" true by
    // construction rather than by inspection of every exit.
    let newToken: string | null = null;
    let failure: unknown = error;

    try {
      const refreshToken = useAuthStore.getState().refreshToken;
      // Empty string as well as null: a Path B sign-in that came back without a refresh token used to
      // persist '' (see (auth)/login.tsx), which is falsy here but was still a stored "session".
      if (!refreshToken) {
        await useAuthStore.getState().logout();
        return Promise.reject(error);
      }

      const { data } = await axios.post<{ access_token: string; refresh_token?: string }>(
        `${BASE_URL}/auth/refresh`,
        { refresh_token: refreshToken },
      );

      newToken = data.access_token;
      await useAuthStore.getState().updateAccessToken(newToken);
      // Keycloak issues single-use refresh tokens (revokeRefreshToken=true) — the old one is now
      // invalid, so persist the rotated token or the next refresh fails and forces a re-login.
      if (data.refresh_token) {
        await useAuthStore.getState().updateRefreshToken(data.refresh_token);
      }

      withBearer(originalRequest, newToken);
      return http(originalRequest);
    } catch (refreshError) {
      failure = refreshError;
      newToken = null;
      await useAuthStore.getState().logout();
      return Promise.reject(error);
    } finally {
      isRefreshing = false;
      settleRefreshQueue(newToken, failure);
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
  /**
   * The request TIMED OUT rather than never leaving the device, so the server may already have
   * applied it and the replay may duplicate it.
   *
   * Reported to the caller rather than written into the payload: the payload is forwarded verbatim as
   * `/sync/push` → domain DTO, and those DTOs are validated with `forbidNonWhitelisted`, so a marker
   * field smuggled into it would be rejected by the very replay it was meant to annotate.
   */
  afterTimeout?: boolean;
}

/**
 * The entity types `/sync/push` can actually replay.
 *
 * NOT a list maintained here. `SYNC_PUSHABLE_ENTITY_TYPES` is declared once in @cos/types and
 * imported by both sides, and a backend test asserts the switch in `SyncService.push()` names exactly
 * those types — so a capability added on one side without the other fails CI rather than shipping.
 *
 * WHY THE CLIENT HAS TO KNOW AT ALL. Before 2026-08-19 `mutate()` queued whatever it was handed, so
 * an offline material request resolved as `{queued: true}` and the screen said "saved, will sync" —
 * while the row was destined for five 400s and then a silent discard (its entity type is in none of
 * the §17.2 notify sets, so "Unknown entity types: no action" applied). Failing at the point of the
 * write instead means the user is told now, while they are still standing in front of the form.
 */
const PUSHABLE_ENTITY_TYPES = new Set<string>(SYNC_PUSHABLE_ENTITY_TYPES);

/**
 * Send a mutation, falling back to the offline outbox when the network is unreachable.
 *
 * ON TIMEOUTS, THE WRITE IS STILL QUEUED. A timeout (`ECONNABORTED`) is the one failure where the
 * server may have applied the request already, so a replay can duplicate it. Queuing anyway is the
 * deliberate choice, and it is the platform's: SyncService.delta states the delivery contract as
 * "At-least-once, never skip". Losing a safety incident because the link was slow is the worse
 * outcome, and the server carries client-generated ids for the paths where a duplicate would matter
 * most (`client_id` on CreateIssueDto / SyncSiteReportsDto; task push is GREATEST-wins).
 *
 * `isTimeout` is still consulted separately so the distinction is not lost inside a single "offline"
 * branch: the caller gets `afterTimeout` and can word its confirmation accordingly.
 */
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
      if (!PUSHABLE_ENTITY_TYPES.has(entityType)) {
        // Not queueable — surface the failure rather than promising a replay that cannot happen.
        throw err;
      }
      const op: SyncOperation = method === 'POST' ? 'CREATE' : 'UPDATE';
      const queueId = enqueue(entityType, entityId, op, payload);
      return { queued: true, queueId, afterTimeout: isTimeout(err) };
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

// Same contract as post() — never enqueues, throws on network error — for PATCH state transitions
// that must not be replayed later. Added 2026-08-04 for the CRM opportunity→customer convert, which
// the server rejects on a second attempt (COS-CRM-003): a queued replay could only ever fail.
export async function patch<T>(path: string, payload: unknown): Promise<T> {
  const { data } = await http.patch<T>(path, payload);
  return data;
}

// ── GET helper ─────────────────────────────────────────────────────────────

export async function get<T>(path: string, params?: Record<string, string>): Promise<T> {
  const { data } = await http.get<T>(path, { params });
  return data;
}

export { http as apiClient };
