// E2E-only route that absorbs the `cos://e2e/reset` deep link (see app/_layout.tsx, which performs the
// logout). Renders nothing; the suite issues a reloadReactNative() right after, landing on login.

export default function E2EReset() {
  return null;
}
