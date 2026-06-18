/**
 * Route protection (spec §20.6.2 — every authenticated page enforces auth).
 * Unauthenticated requests to protected routes are redirected to `/login`
 * (configured as the next-auth signIn page). Auth pages, the next-auth API,
 * the PWA offline shell, and static assets are excluded from the matcher.
 */
export { default } from 'next-auth/middleware';

export const config = {
  matcher: [
    '/((?!login|api/auth|offline|manifest.json|sw.js|workbox-|icons/|_next/static|_next/image|favicon.ico).*)',
  ],
};
