// Readiness endpoint — spec §Phase 19 "All services have health check endpoints
// (/health/live, /health/ready)". See ./live/route.ts for why this must stay outside the auth
// matcher in src/middleware.ts.
//
// Deliberately reports only that this Next.js server is up and serving. apps/web renders in the
// browser against the backend API; it holds no database or broker connection of its own, so there is
// no dependency here whose health this process could honestly assert. Adding a backend round-trip
// would make a backend blip evict every web pod from its Service — an outage amplifier, not a
// readiness check. If web ever owns a real dependency, check that one here.
export const dynamic = 'force-dynamic';

export function GET(): Response {
  return Response.json({ status: 'ok', service: 'web' });
}
