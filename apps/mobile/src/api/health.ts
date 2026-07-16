// Backend liveness check for the login footer's status dot.
//
// The pre-auth login screen shows "ปกติ / ผิดพลาด" from whether the API is reachable — so this pings
// the public GET /health/live (no auth) and reports a boolean. Any failure (offline, DNS, 5xx) is
// "not healthy"; only a 2xx is healthy.

import { get } from './client';

export async function checkBackendHealth(): Promise<boolean> {
  try {
    await get('/health/live');
    return true;
  } catch {
    return false;
  }
}
