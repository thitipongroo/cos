/**
 * Phase 2 Generate item 01 — master:1926-1928
 *
 *   "Keycloak Docker Compose service with realm import template
 *    IMPORTANT: realm import template MUST include protocol mappers for tenant_id, user_id, role
 *    (see spec §05-security-compliance §5.4.2 and §07-multi-tenant-architecture §7.6 step 3)"
 *
 * Also master:1931-1933 — the realm model:
 *   STARTER/PROFESSIONAL -> shared realm 'construction-os'
 *   ENTERPRISE           -> dedicated realm 'cos-{tenantCode}' (Phase 25)
 *
 * The realm file is located THROUGH compose rather than by a guessed path: whatever the
 * Keycloak service actually mounts or imports is the template that ships.
 */
import * as fs from 'fs';
import * as path from 'path';
import { abs, read, readYaml, repoRoot } from '../helpers';

interface ComposeService {
  image?: string;
  command?: string | string[];
  volumes?: string[];
  environment?: Record<string, string> | string[];
}
interface ComposeFile {
  services?: Record<string, ComposeService>;
}

const services = readYaml<ComposeFile>('docker-compose.yml').services ?? {};
const keycloakEntry = Object.entries(services).find(([, s]) => /keycloak/i.test(s.image ?? ''));

/** The host-side path of every file/dir the Keycloak service mounts. */
const mountedHostPaths = (svc: ComposeService): string[] =>
  (svc.volumes ?? [])
    .map((v) => v.split(':')[0])
    .filter((p) => p.startsWith('./') || p.startsWith('/'))
    .map((p) => p.replace(/^\.\//, ''));

/** Every realm JSON reachable from the service's mounts. */
const realmFiles = (): string[] => {
  if (!keycloakEntry) return [];
  const out: string[] = [];
  for (const rel of mountedHostPaths(keycloakEntry[1])) {
    const full = abs(rel);
    if (!fs.existsSync(full)) continue;
    if (fs.statSync(full).isDirectory()) {
      for (const f of fs.readdirSync(full)) {
        if (f.endsWith('.json')) out.push(path.relative(repoRoot, path.join(full, f)));
      }
    } else if (rel.endsWith('.json')) {
      out.push(rel);
    }
  }
  return out;
};

describe('Phase 2 · Keycloak compose service (master:1926)', () => {
  it('a Keycloak service is defined', () => {
    expect(keycloakEntry).toBeDefined();
  });

  it('it imports a realm at startup', () => {
    const [, svc] = keycloakEntry as [string, ComposeService];
    const cmd = Array.isArray(svc.command) ? svc.command.join(' ') : (svc.command ?? '');
    const mounts = mountedHostPaths(svc).join(' ');
    expect(`${cmd} ${mounts}`).toMatch(/import|realm/i);
  });

  it('the realm template ships in the repo', () => {
    expect(realmFiles().length).toBeGreaterThan(0);
  });
});

describe('Phase 2 · realm protocol mappers (master:1927-1928)', () => {
  const files = realmFiles();

  it.each(['tenant_id', 'user_id', 'role'])('a mapper exists for the %s claim', (claim) => {
    const anyFileHasIt = files.some((f) => {
      const realm = JSON.parse(read(f)) as unknown;
      const text = JSON.stringify(realm);
      // A mapper is a protocolMapper entry whose config names this claim.
      return new RegExp(`"claim\\.name"\\s*:\\s*"${claim}"`).test(text);
    });
    expect(anyFileHasIt).toBe(true);
  });

  it('every shipped realm template declares a realm name', () => {
    const names = files.map((f) => (JSON.parse(read(f)) as { realm?: string }).realm);
    expect(names.every((n) => typeof n === 'string' && n.length > 0)).toBe(true);
  });
});

describe('Phase 2 · shared realm name (master:1932; context.md:214)', () => {
  /**
   * The spec fixes the SHARED realm at `construction-os`. The local template declares
   * `construction-os-dev`, which is a documented per-environment override (ADR-074 calls it
   * "dev realm `construction-os-dev`") selected through KEYCLOAK_REALM — not a second
   * convention. So the obligation lands on the CODE DEFAULT, which is what a deployment with
   * no override gets.
   */
  it('the code default for a shared-realm tenant is construction-os', () => {
    const strategy = read('backend/src/modules/identity/strategies/keycloak-jwt.strategy.ts');
    expect(strategy).toMatch(/KEYCLOAK_REALM'?\]?\s*\?\?\s*'construction-os'/);
  });

  it('the realm is environment-driven, never hardcoded to the dev name', () => {
    const strategy = read('backend/src/modules/identity/strategies/keycloak-jwt.strategy.ts');
    expect(strategy).toMatch(/KEYCLOAK_REALM/);
    expect(strategy).not.toMatch(/construction-os-dev/);
  });

  it('the dev override is declared in compose, not baked into an image', () => {
    expect(read('docker-compose.yml')).toMatch(/KEYCLOAK_REALM:\s*\$\{KEYCLOAK_REALM/);
  });
});

describe('Phase 2 · realm model in code (master:1931-1933)', () => {
  it('ENTERPRISE resolves to a dedicated cos-{tenantCode} realm', () => {
    // The naming rule must exist in source, not only in the spec.
    const hits = Array.from(
      fs.readdirSync(abs('backend/src/modules/tenant'), { recursive: true }) as string[],
    )
      .filter((f) => typeof f === 'string' && f.endsWith('.ts') && !f.endsWith('.spec.ts'))
      .map((f) => read(`backend/src/modules/tenant/${f}`))
      .join('\n');
    expect(hits).toMatch(/cos-\$\{|`cos-/);
  });
});
