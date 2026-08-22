/**
 * Phase 1 Generate items 6, 7, 8, 9 and Constraint C4 — master:1687-1704, 1745
 *
 *   item 6  "Docker Compose (local dev: PostgreSQL, TimescaleDB, Redis, Kafka,
 *            OpenSearch, Neo4j, ClickHouse, MinIO, Confluent Schema Registry,
 *            Vault dev mode, PgBouncer)"
 *           "application must connect to PgBouncer address — never directly to
 *            PostgreSQL port 5432" (QM-18)
 *   item 7  "Docker Compose `apps` profile (ADR-036) ... make docker-apps-up-full"
 *   item 8  "Istio local dev: skip Istio for Docker Compose"
 *   item 9  "HashiCorp Vault: dev mode container for local secret injection"
 *   C4      "all services must start with Docker Compose from day one"
 *
 * TimescaleDB is a PostgreSQL extension co-located on the primary instance
 * (ADR-032, master:613), so one service may satisfy both rows.
 */
import { read, readYaml } from '../helpers';

interface ComposeService {
  image?: string;
  build?: unknown;
  command?: string | string[];
  environment?: Record<string, string> | string[];
  profiles?: string[];
}

interface ComposeFile {
  services?: Record<string, ComposeService>;
}

const compose = readYaml<ComposeFile>('docker-compose.yml');
const services = compose.services ?? {};
const serviceEntries = Object.entries(services);
const allImages = serviceEntries.map(([, s]) => s.image ?? '').join('\n');

/** Normalise `environment` (map or KEY=VALUE list) to a map. */
const envOf = (svc: ComposeService): Record<string, string> => {
  const env = svc.environment;
  if (!env) return {};
  if (Array.isArray(env)) {
    return Object.fromEntries(
      env.map((line) => {
        const idx = line.indexOf('=');
        return idx === -1 ? [line, ''] : [line.slice(0, idx), line.slice(idx + 1)];
      }),
    );
  }
  return env;
};

describe('Phase 1 · required local-dev infrastructure (master:1687-1689)', () => {
  const REQUIRED: ReadonlyArray<[string, RegExp]> = [
    ['PostgreSQL', /postgres|timescale/i],
    ['TimescaleDB', /timescale/i],
    ['Redis', /redis/i],
    ['Kafka', /kafka/i],
    ['OpenSearch', /opensearch/i],
    ['Neo4j', /neo4j/i],
    ['ClickHouse', /clickhouse/i],
    ['MinIO', /minio/i],
    ['Confluent Schema Registry', /schema-registry/i],
    ['Vault', /vault/i],
    ['PgBouncer', /pgbouncer/i],
  ];

  it.each(REQUIRED)('provides %s', (_name, pattern) => {
    expect(allImages).toMatch(pattern);
  });
});

describe('Phase 1 · Vault runs in dev mode (master:1704, 1873)', () => {
  it('a Vault service is configured for dev mode', () => {
    const vault = serviceEntries.find(([, s]) => /vault/i.test(s.image ?? ''));
    expect(vault).toBeDefined();
    const [, svc] = vault as [string, ComposeService];
    const command = Array.isArray(svc.command) ? svc.command.join(' ') : (svc.command ?? '');
    const env = envOf(svc);
    const devSignals =
      /server\s+-dev|\bagent\b.*-dev|-dev\b/.test(command) ||
      'VAULT_DEV_ROOT_TOKEN_ID' in env ||
      'VAULT_DEV_LISTEN_ADDRESS' in env;
    expect(devSignals).toBe(true);
  });
});

describe('Phase 1 · QM-18 application connects through PgBouncer (master:1691-1693)', () => {
  /**
   * QM-18: "Application layer must connect to PgBouncer address — never directly
   * to PostgreSQL port 5432". Prisma's separate direct URL (DIRECT_DATABASE_URL)
   * is the migration path and is out of scope for this rule.
   */
  const appDbUrls: Array<[string, string, string]> = [];
  for (const [name, svc] of serviceEntries) {
    for (const [key, value] of Object.entries(envOf(svc))) {
      if (/^(APP_)?DATABASE_URL$/.test(key) && typeof value === 'string') {
        appDbUrls.push([name, key, value]);
      }
    }
  }

  it('at least one application DATABASE_URL is declared in compose', () => {
    expect(appDbUrls.length).toBeGreaterThan(0);
  });

  it.each(appDbUrls)('%s · %s targets PgBouncer, not PostgreSQL:5432', (_svc, _key, value) => {
    expect(value).toMatch(/pgbouncer/i);
  });
});

describe('Phase 1 · apps profile, ADR-036 (master:1695-1698)', () => {
  const appsProfileServices = serviceEntries
    .filter(([, s]) => (s.profiles ?? []).includes('apps'))
    .map(([name]) => name);

  it('defines an "apps" profile', () => {
    expect(appsProfileServices.length).toBeGreaterThan(0);
  });

  it('covers the seven app services named in the spec', () => {
    // backend, file-service, ai-gateway, ai-embedding-worker, ai-ocr-pipeline,
    // analytics-worker, kg-ingestion-worker
    expect(appsProfileServices.length).toBeGreaterThanOrEqual(7);
  });

  it('Makefile exposes docker-apps-up-full', () => {
    expect(read('Makefile')).toMatch(/^docker-apps-up-full:/m);
  });
});

describe('Phase 1 · Istio is skipped locally (master:1700-1702)', () => {
  it('compose declares no Istio or Envoy sidecar', () => {
    expect(read('docker-compose.yml')).not.toMatch(/istio|envoyproxy|envoy-sidecar/i);
  });
});

describe('Phase 1 · C4 every service starts from Compose (master:1745)', () => {
  it('compose parses and declares services', () => {
    expect(serviceEntries.length).toBeGreaterThan(0);
  });

  it.each(serviceEntries.map(([name]) => name))('%s declares an image or a build', (name) => {
    const svc = services[name];
    expect(Boolean(svc.image) || Boolean(svc.build)).toBe(true);
  });
});
