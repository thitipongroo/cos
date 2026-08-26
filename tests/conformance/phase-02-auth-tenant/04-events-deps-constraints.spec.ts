/**
 * Phase 2 Generate items 14, 15 and Constraints C1, C3, C4 — master:1993-2011
 *
 *   item 14 six Kafka events; master:939 "agents must generate both TypeScript interface AND
 *           Avro schema for each event"; master:937 RecordNameStrategy — the subject IS the
 *           canonical event type, never {topic}-value.
 *   item 15 npm packages that must be in backend/package.json BEFORE implementing (Rule 26)
 *   C1      "No insecure auth patterns (no MD5 passwords, no symmetric JWT signing)"
 *   C3      "Enterprise-ready: stateless JWT validation, no server-side session store"
 *   C4      "Keycloak must be the single source of truth for authentication"
 */
import * as fs from 'fs';
import * as path from 'path';
import { readJson, repoRoot } from '../helpers';

const walk = (dir: string, acc: string[] = []): string[] => {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!['node_modules', 'dist', 'coverage', '.turbo', '.git'].includes(e.name)) walk(full, acc);
    } else acc.push(full);
  }
  return acc;
};

const repoFiles = walk(path.join(repoRoot, 'packages')).concat(
  walk(path.join(repoRoot, 'backend', 'src')),
);
const avroFiles = repoFiles.filter((f) => f.endsWith('.avsc'));
const tsFiles = repoFiles.filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'));
const tsCorpus = tsFiles.map((f) => fs.readFileSync(f, 'utf8')).join('\n');

/** Phase 2's own events (master:1995-1996, 1999-2000). The two platform.enterprise.* rows
 *  are annotated "← Phase 25" in the same list, so their delivery belongs to that phase. */
const PHASE2_EVENTS = [
  'identity.tenant.created.v1',
  'identity.tenant.deactivated.v1',
  'identity.user.created.v1',
  'identity.user.role_changed.v1',
];

const PHASE25_EVENTS = [
  'platform.enterprise.contract_signed',
  'platform.enterprise.db_provisioned',
];

describe('Phase 2 · event type declared in TypeScript (master:1993-2000, 939)', () => {
  it.each(PHASE2_EVENTS)('%s appears in a typed contract', (evt) => {
    expect(tsCorpus).toContain(evt);
  });
});

describe('Phase 2 · Avro schema per event (master:939, 937)', () => {
  const subjects = avroFiles.map((f) => {
    const j = JSON.parse(fs.readFileSync(f, 'utf8')) as { name?: string; namespace?: string };
    return [j.namespace, j.name].filter(Boolean).join('.');
  });

  it('the repo ships Avro schemas', () => {
    expect(avroFiles.length).toBeGreaterThan(0);
  });

  it.each(PHASE2_EVENTS)('%s has an Avro schema', (evt) => {
    const byFilename = avroFiles.some((f) => path.basename(f).startsWith(evt));
    const bySubject = subjects.some((s) => s === evt);
    expect(byFilename || bySubject).toBe(true);
  });

  it('no Avro file uses the TopicNameStrategy "-value" suffix (master:937)', () => {
    const offenders = avroFiles.filter((f) => path.basename(f).includes('-value'));
    expect(offenders.map((f) => path.relative(repoRoot, f))).toEqual([]);
  });
});

describe('Phase 25 events are declared but not owned by Phase 2 (master:1997-1998)', () => {
  it.each(PHASE25_EVENTS)('%s has a contract in the repo', (evt) => {
    expect(tsCorpus).toContain(evt);
  });
});

describe('Phase 2 · Rule 26 backend dependencies (master:2002-2004)', () => {
  interface Pkg {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  }
  const pkg = readJson<Pkg>('backend/package.json');

  it.each([
    '@nestjs/passport',
    '@nestjs/jwt',
    'passport',
    'passport-jwt',
    '@aws-sdk/client-sns',
    '@keycloak/keycloak-admin-client',
  ])('declares dependency %s', (dep) => {
    expect(Object.keys(pkg.dependencies ?? {})).toContain(dep);
  });

  it.each([
    '@types/passport-jwt',
    '@types/passport',
    '@testcontainers/postgresql',
    '@testcontainers/redis',
  ])('declares devDependency %s', (dep) => {
    expect(Object.keys(pkg.devDependencies ?? {})).toContain(dep);
  });
});

describe('Phase 2 · C1 no insecure auth patterns (master:2008)', () => {
  const authSource = tsFiles
    .filter((f) => f.includes(`${path.sep}identity${path.sep}`))
    .map((f) => fs.readFileSync(f, 'utf8'))
    .join('\n');

  it('the identity module hashes nothing with MD5', () => {
    expect(authSource).not.toMatch(/createHash\(\s*['"]md5['"]/i);
  });

  it('no symmetric JWT signing algorithm is configured', () => {
    // RS256 is required (master:1772). HS* would mean a shared secret signs tokens.
    expect(authSource).not.toMatch(/['"]HS(256|384|512)['"]/);
  });

  it('RS256 is the declared algorithm', () => {
    expect(authSource).toMatch(/RS256/);
  });
});

describe('Phase 2 · C3 stateless JWT, no server-side session store (master:2010)', () => {
  interface Pkg {
    dependencies?: Record<string, string>;
  }
  const deps = Object.keys(readJson<Pkg>('backend/package.json').dependencies ?? {});

  it.each(['express-session', 'connect-redis', 'koa-session', '@fastify/session'])(
    'does not depend on the session package %s',
    (dep) => {
      expect(deps).not.toContain(dep);
    },
  );
});

describe('Phase 2 · C4 Keycloak is the single source of truth (master:2011)', () => {
  it('token issuance goes through Keycloak, not a hand-rolled signer', () => {
    // master:1776-1779 — OTP verification is custom, but the TOKEN comes from Keycloak
    // Direct Grant. A local `jwt.sign` of an access token would break that.
    const identity = tsFiles
      .filter((f) => f.includes(`${path.sep}identity${path.sep}`))
      .map((f) => fs.readFileSync(f, 'utf8'))
      .join('\n');
    expect(identity).toMatch(/grant_type|Direct Grant|KeycloakAdminService/);
  });
});
