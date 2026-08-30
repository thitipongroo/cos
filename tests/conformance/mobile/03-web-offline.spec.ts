/**
 * Phase 10 — the Web App half of the offline engine (master:3614-3632; spec §32.7 Web
 * Implementation build constraints).
 *
 * Target B is not a lesser client: master:3545-3547 gives it ALL roles on tablet/laptop with "online
 * AND offline — no app switching". So the same questions asked of React Native are asked here — is
 * there a queue, does it survive being closed, does anything replay it — rather than only "is a
 * service worker registered".
 */
import { read, exists, readJson } from '../helpers';

const web = 'apps/web';
const routeFile = `${web}/src/app/serwist/[path]/route.ts`;

describe('Phase 10 · Serwist configuration (master:3615)', () => {
  it('next.config.mjs wraps the config with withSerwist', () => {
    const cfg = read(`${web}/next.config.mjs`);
    expect(cfg).toMatch(/withSerwist/);
    expect(cfg).toMatch(/from '@serwist\/turbopack'/);
  });

  it('the service worker is served from a route, not emitted into public/', () => {
    // §32.7: "no sw.js / workbox-*.js artifacts land in apps/web/public/" — the difference from
    // next-pwa, and the reason there is nothing to git-ignore there.
    expect(exists(routeFile)).toBe(true);
    expect(read(routeFile)).toMatch(/createSerwistRoute/);
    expect(exists(`${web}/public/sw.js`)).toBe(false);
    expect(exists(`${web}/public/workbox-window.prod.es5.js`)).toBe(false);
  });

  it('the SW source exists and is excluded from the app tsconfig', () => {
    // Its WebWorker lib would otherwise collide with the app's DOM types (§32.7).
    expect(exists(`${web}/src/app/sw.ts`)).toBe(true);
    const tsconfig = read(`${web}/tsconfig.json`);
    expect(tsconfig).toMatch(/sw\.ts/);
  });

  it('carries runtime caching strategies (master:3615)', () => {
    expect(read(`${web}/src/app/sw.ts`)).toMatch(/runtimeCaching/);
  });

  it('the client registers the SW from the root layout (master:3621)', () => {
    const layout = read(`${web}/src/app/layout.tsx`);
    expect(layout).toMatch(/SerwistProvider/);
  });
});

describe('Phase 10 · the esbuild pairing that keeps the build cross-platform (§32.7:1096)', () => {
  // The rule this replaced said `useNativeEsbuild: false`. It was corrected on 2026-08-23 because
  // esbuild-wasm rejects a Windows absolute working directory, so the invariant that actually has to
  // hold is not the flag's value — it is that BOTH bundlers are declared and cannot drift apart.
  const pkg = readJson<{
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  }>(`${web}/package.json`);
  const dep = (n: string): string | undefined => pkg.dependencies?.[n] ?? pkg.devDependencies?.[n];

  it('declares both esbuild and esbuild-wasm', () => {
    expect(dep('esbuild')).toBeDefined();
    expect(dep('esbuild-wasm')).toBeDefined();
  });

  it('pins them to the SAME version', () => {
    // They speak a shared service protocol; a version skew between them is the failure this pairing
    // exists to prevent, and it would only ever show up on one platform.
    expect(dep('esbuild')).toBe(dep('esbuild-wasm'));
  });

  it('lets esbuild run its postinstall so the platform binary is linked', () => {
    // Without this pnpm blocks the postinstall and the native path fails at build time on Windows.
    expect(read('pnpm-workspace.yaml')).toMatch(/^\s*esbuild:\s*true\s*$/m);
  });
});

describe('Phase 10 · IndexedDB offline store (master:3619)', () => {
  const schema = read(`${web}/src/lib/idb/schema.ts`);

  it('uses the idb library', () => {
    expect(schema).toMatch(/from 'idb'/);
  });

  it('is typed through DBSchema rather than an untyped store', () => {
    // "typed, versioned" — an untyped IndexedDB wrapper puts every store name and value shape beyond
    // the compiler's reach.
    expect(schema).toMatch(/DBSchema/);
    expect(schema).toMatch(/openDB<\w+>/);
  });

  it('is versioned with an upgrade path', () => {
    expect(schema).toMatch(/DB_VERSION/);
    expect(schema).toMatch(/upgrade\s*\(/);
  });

  it('carries a sync_queue store — the web queue, not only a read cache', () => {
    // master:3620 asks for a "PWA sync service using Background Sync API + IndexedDB queue". A cache
    // of downloaded rows would satisfy "offline reads" and silently drop every offline WRITE.
    expect(schema).toMatch(/sync_queue\s*:/);
  });
});

describe('Phase 10 · Background Sync replay (master:3620)', () => {
  const svc = read(`${web}/src/lib/pwa/sync-service.ts`);

  it('registers with the Background Sync API', () => {
    // Not a setInterval: the point of Background Sync is that the browser replays the queue after
    // the tab is gone, which is the tablet equivalent of the phone's background fetch.
    expect(svc).toMatch(/sync\.register\(/);
    expect(svc).toMatch(/serviceWorker/);
  });

  it('the tag is declared exactly once, not repeated in both bundles', () => {
    // The page registers the tag and the SERVICE WORKER listens for it — two separate bundles. A
    // literal spelled out in each compiles cleanly in both while silently never matching, which is
    // precisely how the listener came to be missing without anything failing.
    expect(read(`${web}/src/lib/pwa/sync-tag.ts`)).toMatch(/export const SYNC_TAG = '[a-z-]+'/);
    expect(svc).toMatch(/import \{ SYNC_TAG \} from '\.\/sync-tag'/);
  });

  it('the service worker listens for the sync event, using that same declaration', () => {
    // The half that was missing: `sync.register()` fired into nothing on every browser that HAS
    // Background Sync, so the queue was drained only where the API is ABSENT.
    const sw = read(`${web}/src/app/sw.ts`);
    expect(sw).toMatch(/addEventListener\(\s*'sync'/);
    expect(sw).toMatch(/from '\.\.\/lib\/pwa\/sync-tag'/);
    // waitUntil, or the browser may kill the worker mid-replay and record attempts never made.
    expect(sw).toMatch(/waitUntil\(/);
  });

  it("replay goes through the app's own origin, never straight to the backend", () => {
    // That is what lets the httpOnly session cookie authenticate a replay the worker performs after
    // the tab is gone — WITHOUT a bearer token sitting in IndexedDB, and with the server refreshing
    // an expired one, which a stored token could not do.
    const drain = read(`${web}/src/lib/pwa/replay-queue.ts`);
    expect(drain).toMatch(/REPLAY_PATH = '\/api\//);
    expect(drain).not.toMatch(/Bearer/);
    expect(drain).toMatch(/credentials: 'same-origin'/);
  });

  it('the replay route refuses a type /sync/push cannot handle', () => {
    const route = read(`${web}/src/app/api/sync/replay/route.ts`);
    expect(route).toMatch(/isSyncPushable/);
    expect(route).toMatch(/getServerSession/);
  });

  it('offline-capable web mutations are actually routed through the queue', () => {
    // The queue existed and NOTHING ever wrote to it — enqueueMutation had zero callers. These are
    // the five §17.4 offline-capable writes the web client owns.
    const queries = read(`${web}/src/lib/api/queries.ts`);
    for (const t of ['site_report', 'issue', 'safety', 'delivery', 'purchase-request']) {
      expect(queries).toContain(`type: '${t}'`);
    }
  });

  it('online-required entities are NOT queued (§17.4)', () => {
    // A queued payment approval would be a financial commitment replayed against state the approver
    // never saw. The guard is the shared SYNC_PUSHABLE_ENTITY_TYPES list, asserted here at the call
    // site too, because that is where a well-meaning edit would add one.
    const queries = read(`${web}/src/lib/api/queries.ts`);
    for (const forbidden of ['payment', 'budget', 'vendor', 'tenant-settings']) {
      expect(queries).not.toContain(`type: '${forbidden}'`);
    }
  });
});

describe('Phase 10 · offline fallback and install prompt (master:3622-3623)', () => {
  it('has an offline fallback page', () => {
    expect(exists(`${web}/src/app/offline/page.tsx`)).toBe(true);
  });

  it('has an install prompt handling beforeinstallprompt', () => {
    const prompt = read(`${web}/src/components/pwa/InstallPrompt.tsx`);
    expect(prompt).toMatch(/beforeinstallprompt/);
    // The event has to be captured and re-fired later; a page that only listens can never install.
    expect(prompt).toMatch(/prompt\(\)/);
  });
});
