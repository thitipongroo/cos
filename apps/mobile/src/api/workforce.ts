// Workforce API — self check-in (Path A worker).
// GET /workers/me resolves the worker linked to the authenticated user (backend option A);
// POST /workers/:id/attendance records a check-in (offline-queued via mutate()).

import { apiClient, mutate, type QueuedResult } from './client';

export interface MyWorker {
  worker_id: string;
  full_name: string;
  user_id: string | null;
}

export interface AttendanceResult {
  log_id: string;
}

export async function getMyWorker(): Promise<MyWorker> {
  const { data } = await apiClient.get<MyWorker>('/workers/me');
  return data;
}

export async function recordCheckIn(
  workerId: string,
  projectId: string,
  checkInAt: string,
): Promise<AttendanceResult | QueuedResult> {
  return mutate<AttendanceResult>(
    'POST',
    `/workers/${workerId}/attendance`,
    { project_id: projectId, check_in_at: checkInAt },
    'attendance',
    workerId,
  );
}
