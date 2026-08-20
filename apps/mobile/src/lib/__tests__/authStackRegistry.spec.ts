// Auth-stack registration guard — the (auth) counterpart to routeRegistry.spec.ts.
//
// Same technique and the same reason: this reads the real source rather than importing it, because
// what is being checked is that a hand-maintained list inside a component stays in step with the set
// of files on disk. Importing the layout would pull in expo-router and a navigator to test a list of
// names that is plain text in a JSX block.
//
// WHY THE (auth) GROUP NEEDS ITS OWN GUARD. The (app) group's failure mode is a screen appearing on
// every role's bottom bar; this group's is quieter. A route file with no <Stack.Screen> entry still
// routes — expo-router picks it up from the filesystem — but it inherits none of the stack options
// the layout declares, so it is the one screen in the group that can arrive with a native header on
// it. And an entry naming a file that no longer exists is a line nobody notices until someone reads
// the list and believes it.
//
// The group grew from three screens to fourteen over 2026-08-03…17 (the policy's sections became
// pushed routes, then the DPO contact flow and two download receipts were added), which is exactly
// the kind of growth that leaves a list behind.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const AUTH_DIR = join(__dirname, '..', '..', 'app', '(auth)');

/** Every route file in the group, by route name. `_layout` is the stack itself, not a route. */
function routeFiles(): string[] {
  return readdirSync(AUTH_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.tsx') && e.name !== '_layout.tsx')
    .map((e) => e.name.replace(/\.tsx$/, ''));
}

const layout = readFileSync(join(AUTH_DIR, '_layout.tsx'), 'utf8');

/** The names the stack declares. */
const declared = [...layout.matchAll(/<Stack\.Screen\s+name="([^"]+)"/g)].map((m) => m[1]!);

describe('every (auth) route is declared on the stack', () => {
  it('finds the group is not empty, so an empty read cannot pass silently', () => {
    expect(routeFiles().length).toBeGreaterThan(0);
    expect(declared.length).toBeGreaterThan(0);
  });

  // A file with no entry still routes, but inherits none of the stack's options — so it is the one
  // screen in the group that can arrive with a native header on it.
  it('declares every route file that exists', () => {
    const missing = routeFiles().filter((name) => !declared.includes(name));

    expect(missing).toEqual([]);
  });

  // A line naming a deleted file is a line nobody notices until someone reads the list and
  // believes it.
  it('declares no route that no longer exists', () => {
    const files = new Set(routeFiles());
    const stale = declared.filter((name) => !files.has(name));

    expect(stale).toEqual([]);
  });

  it('declares each route exactly once', () => {
    const seen = new Set<string>();
    const duplicated = declared.filter((name) => (seen.has(name) ? true : (seen.add(name), false)));

    expect(duplicated).toEqual([]);
  });

  // The group's entry point. Losing it would leave the stack with no first screen, and the whole
  // group is reachable only because AuthGate redirects here.
  it('declares login', () => {
    expect(declared).toContain('login');
  });

  // Two screens in this group have (app) twins rather than links across the boundary, because
  // AuthGate redirects a signed-in user OUT of (auth) — a link would land them on Home. The twins
  // share their document component; they are not duplicated content.
  it.each(['privacy-policy', 'support'])(
    'keeps %s in this group, where its twin expects it',
    (name) => {
      expect(declared).toContain(name);
    },
  );
});
