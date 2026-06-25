// E2E-only: remembers the last in-app route so the network-toggle deep link can return the user to
// exactly where they were. Opening `cos://e2e/network` navigates expo-router to that route; a plain
// router.back() lands on the default (home) tab rather than, say, the inspections tab the test was on.
// The (app) layout records every non-e2e path here; app/e2e/network.tsx navigates back to it.

let lastAppPath = '/(app)/home';

export function setLastAppPath(path: string): void {
  if (path && !path.includes('/e2e/')) lastAppPath = path;
}

export function getLastAppPath(): string {
  return lastAppPath;
}
