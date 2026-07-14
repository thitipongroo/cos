// Expo Router deep-link filter.
//
// Path B (§20.6.1) sends office users to Keycloak's hosted page and gets them back on the
// AuthSession redirect `cos://oauth2redirect?code=…&state=…` (see (auth)/login.tsx). That URL is not
// a screen — it is the OIDC response, and expo-auth-session's own listener consumes it to resolve
// promptAsync(). But the app registers `scheme: "cos"` (app.json), so Expo Router treats the same
// URL as navigation, finds no /oauth2redirect route, and renders "Unmatched Route" — which unmounts
// LoginScreen and takes its `oidcBusy`/`response` effect with it, so the code is never exchanged for
// tokens and a correct sign-in dies on an error page.
//
// Returning null leaves the URL to the AuthSession listener and navigates nowhere.

/** Paths that are OIDC/auth callbacks rather than screens. */
const AUTH_CALLBACK_PATHS = ['oauth2redirect'];

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string | null {
  // `path` arrives as the full URL for custom-scheme links; match on the host/first segment either way.
  const withoutScheme = path.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  const head = withoutScheme.split(/[/?#]/).filter(Boolean)[0];
  if (head && AUTH_CALLBACK_PATHS.includes(head)) return null;
  return path;
}
