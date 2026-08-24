// Liveness endpoint — spec §Phase 19 "All services have health check endpoints
// (/health/live, /health/ready)". Same path and body shape as every other COS service
// (backend, file-service, credential-service, analytics-worker, iot-ingestion-worker).
//
// MUST stay excluded from the auth matcher in src/middleware.ts. The chart used to probe
// /api/health, a route that does not exist: next-auth's middleware intercepted it first and answered
// 307 → /api/auth/signin, and Kubernetes counts any 2xx/3xx as a passing probe. The probe therefore
// could never fail, so a wedged web pod would never be restarted. An authenticated health endpoint
// is a health endpoint that reports the auth redirect, not the app.
//
// force-dynamic so this is evaluated per request instead of being prerendered into a static asset at
// build time — a cached 200 would report the build, not the running server.
export const dynamic = 'force-dynamic';

export function GET(): Response {
  return Response.json({ status: 'ok', service: 'web' });
}
