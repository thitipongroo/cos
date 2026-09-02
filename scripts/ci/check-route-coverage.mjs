#!/usr/bin/env node
// Every HTTP route this repository serves must appear in an OpenAPI document under docs/api/.
//
// WHY THIS EXISTS. `.github/workflows/ci.yml` claimed exactly this — "Every controller route must
// appear in an OpenAPI document, and each document must be no older than the module it describes" —
// while only the second half was enforced. `check-openapi-freshness.sh` compares git commit
// timestamps; it cannot see a route that appears in no document at all, and it never looked outside
// `backend/src/modules/`. A route-level audit on 2026-09-03 found seven such routes:
//
//   GET  /api/v1/health/live, /api/v1/health/ready   backend/src/health.controller.ts
//   GET  /api/v1/flags                               backend/src/shared/feature-flags/
//   POST /api/v1/ai/intent                           services/ai-gateway/main.py       (ADR-073)
//   GET  /api/v1/ai/usage                            services/ai-gateway/usage.py
//   POST /api/v1/ai/transcribe                       services/ai-gateway/main.py       (ADR-052)
//   POST /api/v1/files/admin/{fileId}/recover        services/file-service/
//
// plus every route of credential-service, which had no document at all. The first audit of this kind
// on 2026-08-24 found 62 of 276. Two audits, two harvests, and nothing enforcing the rule between
// them: that is what an unenforced claim in a CI comment buys.
//
// WHAT IT READS. Three runtimes, because the routes live in three:
//   NestJS   backend/src/**/*.controller.ts  — @Controller + @Get/@Post/…/@All/@Sse, under the
//            global `api/v1` prefix set in backend/src/main.ts with no route excluded
//   Fastify  services/*/src/**/*.ts          — app.get/post/… with the prefix from its register()
//   FastAPI  services/**/*.py                — @app.get/@router.post/… with the router's own prefix
//
// It is a text scan, not an evaluation. A route assembled from a variable rather than a string
// literal is invisible to it, and that is the known limit: this gate proves that what it CAN see is
// documented. It does not prove the reverse — a document may describe a route nobody serves.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const API_DIR = path.join(ROOT, 'docs/api');

// ── Deliberate exclusions ────────────────────────────────────────────────────────────────────────
//
// Unversioned liveness/readiness probes on the standalone deployables. They are served at bare
// `/health/live` with no `/api/v1` prefix, so they cannot sit under any existing document's
// `servers.url`, and they are not an API contract — they are a container contract, specified in
// `08-enterprise-deployment.md` ("Health probes must match the route the service actually serves")
// and verified by the Phase 19 automated check that curls each one in the cluster.
//
// The monolith's probes are NOT excluded: it serves them at `/api/v1/health/*` under its global
// prefix, and they are documented in `docs/api/platform.openapi.yaml`. credential-service's bare
// `/health` IS excluded by this rule and is nonetheless documented in `credential.openapi.yaml`,
// because that document's server is `/` — an exclusion permits silence, it does not require it.
const EXCLUSIONS = [
  {
    pattern: /^\/health(\/(live|ready))?$/,
    why: 'unversioned container probe — §08 deployment, verified by the Phase 19 curl check',
  },
];

const exclusionFor = (route) => EXCLUSIONS.find((e) => e.pattern.test(route));

// ── Path normalisation ───────────────────────────────────────────────────────────────────────────
// `{fileId}`, `:fileId` and `{file_id}` name the same position. A trailing slash is not meaningful.
const norm = (p) => {
  const out = p
    .replace(/\{[^}]*\}/g, '{}')
    .replace(/:[A-Za-z0-9_]+/g, '{}')
    .replace(/\/+/g, '/')
    .replace(/\/$/, '');
  return out === '' ? '/' : out;
};

const join = (...parts) => norm('/' + parts.filter(Boolean).join('/'));

const SKIP_DIRS = new Set([
  'node_modules',
  '.venv',
  'dist',
  'coverage',
  '__pycache__',
  'test',
  'tests',
]);

const walk = (dir, test, out = []) => {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name) || e.name === '__tests__') continue;
      walk(path.join(dir, e.name), test, out);
    } else if (test(e.name)) out.push(path.join(dir, e.name));
  }
  return out;
};

const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');
const isTestFile = (n) => /\.(spec|test)\.ts$/.test(n) || /^test_.*\.py$/.test(n);

// ── Extract: NestJS ──────────────────────────────────────────────────────────────────────────────
const NEST_PREFIX = 'api/v1'; // backend/src/main.ts setGlobalPrefix('api/v1'), no route excluded
const CTRL_RE = /@Controller\(\s*(?:['"`]([^'"`]*)['"`]|\{[^}]*path:\s*['"`]([^'"`]*)['"`])?/g;
const NEST_ROUTE_RE =
  /@(Get|Post|Put|Patch|Delete|Head|Options|All|Sse)\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/g;

function extractNest() {
  const routes = [];
  const files = walk(
    path.join(ROOT, 'backend/src'),
    (n) => n.endsWith('.controller.ts') && !isTestFile(n),
  );
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    const ctrls = [];
    CTRL_RE.lastIndex = 0;
    let c;
    while ((c = CTRL_RE.exec(src)) !== null) ctrls.push({ at: c.index, base: c[1] ?? c[2] ?? '' });
    if (!ctrls.length) continue;

    NEST_ROUTE_RE.lastIndex = 0;
    let m;
    while ((m = NEST_ROUTE_RE.exec(src)) !== null) {
      // A file may declare several @Controller classes with different bases; the governing one is
      // the last that PRECEDES this decorator. Taking the first mis-prefixes every class after it —
      // in this repository that would silently invent 13 routes that nobody serves.
      let base = ctrls[0].base;
      for (const ct of ctrls) if (ct.at < m.index) base = ct.base;
      routes.push({
        method: m[1] === 'Sse' ? 'GET' : m[1].toUpperCase(),
        route: join(NEST_PREFIX, base, m[2] ?? ''),
        file: rel(f),
      });
    }
  }
  return routes;
}

// ── Extract: Fastify ─────────────────────────────────────────────────────────────────────────────
// A route module is mounted either with a prefix — `app.register(filesRoutes, { prefix: '…' })` —
// or by direct call, `await credentialRoutes(app)`, which mounts at the root. Both are in main.ts.
const REG_PREFIX_RE = /register\(\s*([A-Za-z0-9_$]+)\s*,\s*\{[^}]*prefix:\s*['"`]([^'"`]*)['"`]/g;
const IMPORT_RE = /import\s*\{([^}]*)\}\s*from\s*['"`](\.[^'"`]*)['"`]/g;
const FASTIFY_ROUTE_RE = /\bapp\.(get|post|put|patch|delete|head|options)\(\s*['"`]([^'"`]*)['"`]/g;

function extractFastify(serviceSrc) {
  const mainPath = path.join(serviceSrc, 'main.ts');
  if (!fs.existsSync(mainPath)) return [];
  const main = fs.readFileSync(mainPath, 'utf8');

  // identifier → mount prefix, for the modules main.ts registers WITH one
  const prefixByIdent = new Map();
  REG_PREFIX_RE.lastIndex = 0;
  let r;
  while ((r = REG_PREFIX_RE.exec(main)) !== null) prefixByIdent.set(r[1], r[2]);

  // identifier → source file, so a prefix can be attached to the file that declares the routes
  const prefixByFile = new Map();
  IMPORT_RE.lastIndex = 0;
  let i;
  while ((i = IMPORT_RE.exec(main)) !== null) {
    const spec = i[2].replace(/\.js$/, '');
    for (const raw of i[1].split(',')) {
      const ident = raw
        .trim()
        .split(/\s+as\s+/)
        .pop();
      if (!prefixByIdent.has(ident)) continue;
      for (const ext of ['.ts', '.tsx']) {
        const resolved = path.resolve(serviceSrc, spec + ext);
        if (fs.existsSync(resolved)) prefixByFile.set(resolved, prefixByIdent.get(ident));
      }
    }
  }

  const routes = [];
  for (const f of walk(serviceSrc, (n) => n.endsWith('.ts') && !isTestFile(n))) {
    const src = fs.readFileSync(f, 'utf8');
    const prefix = prefixByFile.get(f) ?? '';
    FASTIFY_ROUTE_RE.lastIndex = 0;
    let m;
    while ((m = FASTIFY_ROUTE_RE.exec(src)) !== null) {
      routes.push({ method: m[1].toUpperCase(), route: join(prefix, m[2]), file: rel(f) });
    }
  }
  return routes;
}

// ── Extract: FastAPI ─────────────────────────────────────────────────────────────────────────────
// `@app.get("/x")` mounts at the root; `@router.get("/x")` mounts under that file's APIRouter prefix.
const PY_ROUTER_PREFIX_RE = /APIRouter\([^)]*prefix\s*=\s*['"]([^'"]*)['"]/;
const PY_ROUTE_RE =
  /@(app|router)\.(get|post|put|patch|delete|head|options)\(\s*\n?\s*['"]([^'"]*)['"]/g;

function extractFastApi(serviceDir) {
  const routes = [];
  for (const f of walk(serviceDir, (n) => n.endsWith('.py') && !isTestFile(n))) {
    const src = fs.readFileSync(f, 'utf8');
    const prefix = src.match(PY_ROUTER_PREFIX_RE)?.[1] ?? '';
    PY_ROUTE_RE.lastIndex = 0;
    let m;
    while ((m = PY_ROUTE_RE.exec(src)) !== null) {
      routes.push({
        method: m[2].toUpperCase(),
        route: join(m[1] === 'router' ? prefix : '', m[3]),
        file: rel(f),
      });
    }
  }
  return routes;
}

// ── Extract: the documents ───────────────────────────────────────────────────────────────────────
// A minimal reader rather than a YAML parser: only `servers[0].url` and the two-space `paths` keys
// with their four-space method keys are needed, and this file must run with no dependency installed.
function readSpecs() {
  const index = new Map(); // normalised full path → { methods:Set, files:Set }
  const files = fs.readdirSync(API_DIR).filter((f) => f.endsWith('.openapi.yaml'));
  for (const sf of files) {
    const lines = fs.readFileSync(path.join(API_DIR, sf), 'utf8').split(/\r?\n/);
    let server = '';
    let inServers = false;
    let inPaths = false;
    let cur = null;
    for (const ln of lines) {
      if (/^servers:\s*$/.test(ln)) {
        inServers = true;
        continue;
      }
      if (inServers) {
        const u = ln.match(/^\s*-?\s*url:\s*['"]?([^'"\s]+)['"]?\s*$/);
        if (u && !server) server = u[1];
        if (/^\S/.test(ln)) inServers = false;
      }
      if (/^paths:\s*$/.test(ln)) {
        inPaths = true;
        continue;
      }
      if (inPaths && /^\S/.test(ln)) inPaths = false;
      if (!inPaths) continue;

      const pm = ln.match(/^ {2}(\/[^:\s]*):\s*$/);
      if (pm) {
        cur = norm(join(server === '/' ? '' : server, pm[1]));
        if (!index.has(cur)) index.set(cur, { methods: new Set(), files: new Set() });
        index.get(cur).files.add(sf);
        continue;
      }
      const mm = ln.match(/^ {4}(get|post|put|patch|delete|head|options):\s*$/);
      if (mm && cur) index.get(cur).methods.add(mm[1].toUpperCase());
    }
  }
  return { index, count: files.length };
}

// ── Compare ──────────────────────────────────────────────────────────────────────────────────────
const routes = [
  ...extractNest(),
  ...extractFastify(path.join(ROOT, 'services/file-service/src')),
  ...extractFastify(path.join(ROOT, 'services/credential-service/src')),
  ...extractFastApi(path.join(ROOT, 'services/ai-gateway')),
  ...extractFastApi(path.join(ROOT, 'services/ai-ocr-pipeline')),
  ...extractFastApi(path.join(ROOT, 'services/ai-embedding-worker')),
  ...extractFastApi(path.join(ROOT, 'services/ai-transcription-pipeline')),
];

const { index: specIndex, count: specCount } = readSpecs();

// A wildcard route — `@All('ai/*')` on the backend proxy — describes no path of its own, so it is
// skipped. It must NOT be treated as covering the concrete paths beneath it.
//
// It was, in the first version of this file, and that made the gate decorative: the proxy's
// `/api/v1/ai/*` swallowed every route the AI Gateway serves, so deleting `/ai/usage` from
// `ai.openapi.yaml` still passed. A negative test caught it. Every gate added here gets one — a
// green result that cannot go red is worth less than no gate, because it is believed.
const undocumented = [];
let excluded = 0;

for (const r of routes) {
  if (r.route.endsWith('/*')) continue;
  if (exclusionFor(r.route)) {
    excluded += 1;
    continue;
  }
  const hit = specIndex.get(r.route);
  if (hit?.methods.has(r.method)) continue;
  undocumented.push({
    ...r,
    why: hit
      ? `path is in ${[...hit.files].join(', ')} but ${r.method} is not`
      : 'path appears in no document',
  });
}

console.log('==> OpenAPI route coverage');
console.log(`  routes found:      ${routes.length}  (NestJS + Fastify + FastAPI)`);
console.log(`  documents read:    ${specCount}`);
console.log(`  documented paths:  ${specIndex.size}`);
console.log(`  excluded by rule:  ${excluded}  (${EXCLUSIONS.map((e) => e.why).join('; ')})`);
console.log('');

if (undocumented.length === 0) {
  console.log(`  ✓ every route found is carried by an OpenAPI document`);
  process.exit(0);
}

const byFile = new Map();
for (const u of undocumented) {
  if (!byFile.has(u.file)) byFile.set(u.file, []);
  byFile.get(u.file).push(u);
}
for (const [f, us] of [...byFile].sort()) {
  console.log(`  ${f}`);
  for (const u of us) console.log(`    ✗ ${u.method.padEnd(6)} ${u.route}   — ${u.why}`);
}
console.log('');
console.log(`==> Result: ${undocumented.length} route(s) carried by no OpenAPI document`);
console.log(
  '    Add them to the owning docs/api/*.openapi.yaml, or — if a route genuinely belongs',
);
console.log('    to no API contract — add an EXCLUSIONS entry in this file with the reason.');
process.exit(1);
