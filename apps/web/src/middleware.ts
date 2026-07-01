/**
 * Route protection (spec §20.6.2 — every authenticated page enforces auth).
 * Unauthenticated requests to protected routes are redirected to `/login`
 * (configured as the next-auth signIn page). Auth pages, the next-auth API,
 * the PWA offline shell, and static assets are excluded from the matcher.
 */
// Next 16's build analyzer requires the middleware default to be a resolvable function value; a
// bare `export { default } from '...'` re-export is not recognized. Import then re-export instead.
import authMiddleware from 'next-auth/middleware';

export default authMiddleware;

export const config = {
  matcher: [
    '/((?!login|api/auth|offline|manifest.json|sw.js|workbox-|icons/|_next/static|_next/image|favicon.ico).*)',
  ],
};
