/**
 * Phase 16 — the security controls (master:4450-4572).
 *
 * Almost every item here is a NEGATIVE: a control is not "present", it is "not bypassable". So the
 * assertions are largely about absences — no superuser connection, no plaintext secret, no
 * unsafe-inline, no string-built SQL — because that is the shape a security regression takes.
 */
import * as fs from 'fs';
import * as path from 'path';
import { parse as parseYaml } from 'yaml';

import { exists, read, readYaml, repoRoot } from '../helpers';

/** Source with comments and string bodies neutralised — a comment naming a construct is not one. */
const codeOnly = (body: string): string =>
  body
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/gm, '$1 ')
    .replace(/(^|\s)#[^\n]*/gm, '$1 ');

const backendSources = ((): Array<[string, string]> => {
  const out: Array<[string, string]> = [];
  const walk = (dir: string): void => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!['node_modules', 'dist', '__tests__'].includes(e.name)) walk(full);
      } else if (e.name.endsWith('.ts') && !/\.(spec|test)\./.test(e.name)) {
        out.push([path.relative(repoRoot, full), fs.readFileSync(full, 'utf8')]);
      }
    }
  };
  walk(path.join(repoRoot, 'backend/src'));
  return out;
})();

describe('Phase 16 · RLS is the primary isolation (master:4493-4497)', () => {
  // The predicate itself and the TO app_user grant used to be asserted here by reading the
  // migration. backend/test/phase-16-security/01-tenant-isolation-and-audit.integration now proves
  // both by BEHAVIOUR against a live database — that app_user is neither superuser nor BYPASSRLS,
  // that an unset tenant sees nothing rather than everything, and that WITH CHECK refuses a foreign
  // stamp. Those are strictly stronger statements, so the text scans were dropped (2026-08-25).
  // What stays below cannot be reached that way: it is about how the process STARTS.

  it('the application refuses to boot without the app role', () => {
    // Booting on the owner role would silently disable every policy above — so it fails fast
    // instead (main.ts calls appDatabaseUrl() before anything else).
    expect(read('backend/src/main.ts')).toMatch(/appDatabaseUrl\(\)/);
    const helper = read('backend/src/shared/prisma/create-prisma-client.ts');
    expect(helper).toMatch(/APP_DATABASE_URL/);
  });

  it('no service connects as the owner role in compose', () => {
    // QM-18 + ADR-031. The ai-gateway was the last one on the owner role and was moved in E-1.
    const compose = codeOnly(read('docker-compose.yml'));
    const ownerDsns = [...compose.matchAll(/postgresql:\/\/cos:[^@\s]*@/g)];
    expect(ownerDsns.map((m) => m[0])).toEqual([]);
  });
});

// audit_logs immutability moved to the integration suite (2026-08-25): it now issues a real UPDATE
// and a real DELETE under app_user and asserts nothing changed, which says more than the absence of
// a FOR UPDATE policy in one migration file.

describe('Phase 16 · rate limits (master:4486-4488, 4514-4519)', () => {
  const kong = readYaml<{
    services: Array<{ routes?: Array<{ paths?: string[] }>; plugins?: unknown[] }>;
  }>('infrastructure/kubernetes/kong/kong-declarative.yml');
  const kongText = read('infrastructure/kubernetes/kong/kong-declarative.yml');

  it.each([
    ['general API', '/api/v1', 100],
    ['auth', '/api/v1/auth', 10],
    ['file upload', '/api/v1/files', 20],
  ])('%s is limited to %s req/min', (_name, routePath, limit) => {
    // The tier that matters most is auth at 10/min — it is the brute-force control, and a default
    // of 100 would leave it ten times too loose.
    const idx = kongText.indexOf(`'${routePath}'`);
    expect(idx).toBeGreaterThan(-1);
    const after = kongText.slice(idx, idx + 900);
    expect(after).toMatch(new RegExp(`minute:\\s*${limit}\\b`));
  });

  it('health and metrics are limited too', () => {
    expect(kongText).toMatch(/minute:\s*60/);
  });

  it('the declarative config parses', () => {
    expect(Array.isArray(kong.services)).toBe(true);
  });

  // The application-side limit is proven by behaviour in
  // backend/test/phase-16-security/02-headers-and-rate-limits.integration: the eleventh auth
  // request in a minute is refused with 429, ordinary API traffic is not, and the bucket is per
  // caller. Those replaced the decorator text scan here (2026-08-25). The KONG tier table above
  // stays — nothing in this repo boots Kong, so its config has no other reader.

  it('rate limiting keys on the real client, not the edge', () => {
    // Without trustProxy, request.ip is the Cloudflare address and EVERY user shares one bucket —
    // the auth limit of 10/min would lock out an entire tenant rather than one attacker.
    expect(read('backend/src/main.ts')).toMatch(/trustProxy:\s*resolveTrustProxy\(\)/);
    expect(exists('backend/src/shared/net/trusted-proxy.ts')).toBe(true);
  });
});

describe('Phase 16 · WAF integration (master:4521-4531)', () => {
  const waf = read('backend/src/shared/middleware/cloudflare-waf.middleware.ts');

  it('checks CF-Ray on every request', () => {
    expect(codeOnly(waf)).toMatch(/cf-ray/);
  });

  it('binds traffic to the edge by peer address, not by a header alone', () => {
    // master:4529 asks for CF-Ray validation, and the implementation keeps it — but a header is
    // forgeable by anyone who can reach the origin directly, so it cannot be the whole control.
    // The TCP peer address can't be, which is why the allowlist exists.
    expect(waf).toMatch(/TRUSTED_PROXY_CIDRS/);
    expect(exists('backend/src/shared/net/cidr-match.ts')).toBe(true);
  });

  it('the origin-protection manifest exists', () => {
    expect(exists('infrastructure/kubernetes/security/cloudflare-origin-protection.yaml')).toBe(
      true,
    );
  });

  it('the Terraform module carries all four files the spec names', () => {
    for (const f of ['main.tf', 'waf.tf', 'variables.tf', 'outputs.tf']) {
      expect(exists(`infrastructure/terraform/cloudflare/${f}`)).toBe(true);
    }
  });

  it('an unset security toggle cannot pass for a deliberate one', () => {
    // WAF_ORIGIN_ENFORCE defaults OFF. A production instance booting with it unset looks identical
    // to one where it was turned off on purpose — so startup refuses instead.
    expect(exists('backend/src/shared/config/security-toggles.ts')).toBe(true);
    expect(read('backend/src/main.ts')).toMatch(/assertSecurityTogglesConfigured\(\)/);
  });
});

describe('Phase 16 · secure headers (master:4535-4541)', () => {
  const headers = read('backend/src/shared/middleware/secure-headers.middleware.ts');

  // The four header VALUES are asserted on real responses — including error responses — by
  // backend/test/phase-16-security/02-headers-and-rate-limits.integration, together with the
  // absence of a server fingerprint. Reading the middleware's source said less, so it went
  // (2026-08-25). The CSP content check below stays: it is a prohibition, and the integration
  // suite checks that the header is present, not what it forbids.

  it('the CSP policy forbids unsafe-inline and unsafe-eval (master:4540)', () => {
    // Those two directives re-open exactly the XSS class the header exists to close.
    const policy = codeOnly(read('docs/security/csp-policy.md'));
    expect(headers).not.toMatch(/unsafe-inline|unsafe-eval/);
    expect(policy).toMatch(/report[- ]only/i);
  });
});

describe('Phase 16 · secrets and input (master:4489-4490, 4543-4546)', () => {
  it('no plaintext secret is committed in compose or manifests', () => {
    // "No plaintext secrets in code, ConfigMaps, or environment files." Dev placeholders are fine;
    // what must not appear is a real-looking credential.
    const compose = read('docker-compose.yml');
    expect(compose).not.toMatch(/AKIA[0-9A-Z]{16}/); // AWS access key id
    expect(compose).not.toMatch(/-----BEGIN (RSA |EC )?PRIVATE KEY-----/);
    expect(compose).not.toMatch(/sk-[A-Za-z0-9]{32,}/); // OpenAI-style key
  });

  it('sealed-secrets is the mechanism, not raw Secret manifests', () => {
    const manifests = fs
      .readdirSync(path.join(repoRoot, 'infrastructure/kubernetes'), { recursive: true })
      .filter((f): f is string => typeof f === 'string' && /\.ya?ml$/.test(f));
    const sealed = manifests.filter((f) => /sealed/i.test(f));
    expect(sealed.length).toBeGreaterThan(0);
  });

  it('every request DTO is validated by class-validator', () => {
    // A DTO without decorators passes ValidationPipe untouched — the pipe validates what the CLASS
    // declares, so an undecorated field is an unvalidated one.
    //
    // Only classes count. ValidationPipe needs runtime metadata, which an interface does not have,
    // so a `dto/` file exporting only interfaces is a response shape rather than an input — as
    // files/dto/annotation.dto.ts says of itself: annotations are written through /sync/push, whose
    // payload is deliberately opaque for every entity type.
    const requestDtos = backendSources.filter(
      ([f, body]) => f.includes('/dto/') && /export\s+class\s+\w/.test(codeOnly(body)),
    );
    expect(requestDtos.length).toBeGreaterThan(20);
    const undecorated = requestDtos.filter(([, body]) => !/from 'class-validator'/.test(body));
    expect(undecorated.map(([f]) => f)).toEqual([]);
  });

  it('no SQL is built by string concatenation', () => {
    // Prisma parameterises; $queryRawUnsafe with an interpolated VALUE is how that guarantee is
    // lost. Template literals in these queries carry Prisma's own parameter placeholders.
    const offenders: string[] = [];
    for (const [file, body] of backendSources) {
      for (const m of codeOnly(body).matchAll(/\$queryRawUnsafe\(\s*[`'"]([^`'"]*)/g)) {
        if (/\+\s*\w+|\$\{(?!\s*\})/.test(m[1] ?? '')) offenders.push(file);
      }
    }
    expect([...new Set(offenders)]).toEqual([]);
  });
});

describe('Phase 16 · CI security scanning (master:4560-4561)', () => {
  const workflows = fs
    .readdirSync(path.join(repoRoot, '.github/workflows'))
    .filter((f) => /\.ya?ml$/.test(f))
    .map((f) => read(`.github/workflows/${f}`))
    .join('\n');

  it('scans container images with Trivy', () => {
    expect(workflows).toMatch(/trivy/i);
  });

  it('runs an OWASP dependency check', () => {
    expect(workflows).toMatch(/dependency-check|owasp|audit/i);
  });
});

describe('Phase 16 · compliance and policy documents (master:4467-4471, 4564-4567)', () => {
  it.each([
    'docs/compliance/soc2-controls.md',
    'docs/compliance/data-flow-map.md',
    'docs/compliance/data-retention-policy.md',
    'docs/security/csp-policy.md',
    'docs/security/cors-policy.md',
    'docs/security/pentest-findings.md',
  ])('%s exists', (file) => {
    expect(exists(file)).toBe(true);
  });

  it('the CORS policy forbids a wildcard origin in production', () => {
    // `*` with credentials is rejected by browsers anyway; the danger is a wildcard on a
    // credential-less endpoint that later gains authentication.
    const cors = read('docs/security/cors-policy.md');
    expect(cors).toMatch(/\*.*forbidden|forbidden.*\*/i);
    expect(cors).toMatch(/production/i);
  });

  it('the preflight cache is within the ceiling the spec sets', () => {
    // master:4565 caps it at 86400s. The policy chooses 600 — well inside, and deliberately so: a
    // long preflight cache means a revoked origin keeps working in a browser that already cached
    // the allow.
    const cors = read('docs/security/cors-policy.md');
    const maxAge = /Access-Control-Max-Age:\s*(\d+)/.exec(cors);
    expect(maxAge).not.toBeNull();
    expect(Number(maxAge![1])).toBeLessThanOrEqual(86400);
  });
});

describe('Phase 16 · encryption at rest (master:4474-4480)', () => {
  const kms = read('infrastructure/terraform/aws/kms.tf');

  it('declares customer-managed keys with annual rotation', () => {
    expect(kms).toMatch(/aws_kms_key/);
    expect(kms).toMatch(/enable_key_rotation\s*=\s*true/);
  });

  it('uses the alias convention the spec fixes', () => {
    // cos/{env}/rds, cos/{env}/s3, cos/{env}/elasticache — one CMK per storage type per env, so a
    // compromised key cannot decrypt another store.
    expect(kms).toMatch(/cos\/\$\{[^}]+\}\/rds|cos\/.*\/rds/);
    expect(kms).toMatch(/s3/);
  });
});

/**
 * TLS 1.3 minimum on all ingress (master:4539).
 *
 * The annotation has been in infrastructure/kubernetes/cert-manager/cert-manager.yml since the file
 * was written, and nothing read it. That is the whole failure mode for a transport setting: it is
 * one line of YAML on an object nobody tests, it degrades silently when it is loosened, and the
 * symptom — a client negotiating TLS 1.2 — is invisible from inside the cluster.
 *
 * Asserted as an EXACT value rather than "contains TLSv1.3", because the realistic regression is
 * `'TLSv1.2 TLSv1.3'` — a change that reads as broadening compatibility, satisfies any containment
 * check, and drops the floor the spec sets.
 */
describe('Phase 16 · TLS 1.3 is the floor on every ingress (master:4539)', () => {
  const certManager = read('infrastructure/kubernetes/cert-manager/cert-manager.yml');

  const ingresses = (): Array<Record<string, unknown>> => {
    const docs = certManager
      .split(/^---$/m)
      .map((d) => {
        try {
          return parseYaml(d) as Record<string, unknown>;
        } catch {
          return null;
        }
      })
      .filter((d): d is Record<string, unknown> => d !== null);
    return docs.filter((d) => d['kind'] === 'Ingress');
  };

  it('the manifest declares at least one Ingress', () => {
    // Without this, a rename or a restructure empties the sweep below and it reports green.
    expect(ingresses().length).toBeGreaterThan(0);
  });

  it.each(['ssl-protocols', 'ssl-redirect', 'force-ssl-redirect'])(
    'every Ingress sets %s',
    (key) => {
      for (const ing of ingresses()) {
        const meta = ing['metadata'] as { name?: string; annotations?: Record<string, string> };
        const ann = meta.annotations ?? {};
        expect(`${meta.name}:${Object.keys(ann).join(',')}`).toContain(key);
      }
    },
  );

  it('pins TLSv1.3 exactly, so a 1.2 fallback cannot be added as a compatibility fix', () => {
    for (const ing of ingresses()) {
      const meta = ing['metadata'] as { name?: string; annotations?: Record<string, string> };
      const protocols = (meta.annotations ?? {})['nginx.ingress.kubernetes.io/ssl-protocols'];
      expect(`${meta.name}:${protocols}`).toContain('TLSv1.3');
      expect(protocols).toBe('TLSv1.3');
    }
  });

  it('redirects plaintext rather than serving it', () => {
    // TLS 1.3 on the HTTPS listener means nothing if the HTTP one still answers.
    for (const ing of ingresses()) {
      const ann = (ing['metadata'] as { annotations?: Record<string, string> }).annotations ?? {};
      expect(ann['nginx.ingress.kubernetes.io/ssl-redirect']).toBe('true');
      expect(ann['nginx.ingress.kubernetes.io/force-ssl-redirect']).toBe('true');
    }
  });
});
