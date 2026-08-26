/**
 * Phase 7 Generate items — module, DTOs, and the three Strategy-pattern integration points
 * (master:2972, 2976, 3003, 3015-3026).
 */
import * as fs from 'fs';
import * as path from 'path';
import { exists, read, repoRoot } from '../helpers';

const financeDir = 'backend/src/modules/finance';

const collect = (rel: string): string[] => {
  const dir = path.join(repoRoot, rel);
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        if (!['node_modules', 'dist', 'coverage', '__tests__'].includes(e.name)) walk(full);
      } else if (e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts')) out.push(full);
    }
  };
  walk(dir);
  return out;
};

const files = collect(financeDir);
const src = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');

describe('Phase 7 · finance module (master:2972)', () => {
  it('exists as a NestJS module', () => {
    expect(exists(`${financeDir}/finance.module.ts`)).toBe(true);
    expect(read(`${financeDir}/finance.module.ts`)).toContain('@Module');
  });

  it('separates controller, service and repository', () => {
    for (const f of ['finance.controller.ts', 'finance.service.ts', 'finance.repository.ts']) {
      expect(exists(`${financeDir}/${f}`)).toBe(true);
    }
  });

  it('carries a Kafka consumer for the procurement events', () => {
    expect(exists(`${financeDir}/finance.consumer.ts`)).toBe(true);
  });
});

describe('Phase 7 · DTOs with validation (master:2976)', () => {
  const dtoDir = path.join(repoRoot, financeDir, 'dto');
  const dtos = fs.existsSync(dtoDir)
    ? fs.readdirSync(dtoDir).filter((f) => f.endsWith('.dto.ts'))
    : [];

  it('has a dto directory with at least one DTO per write surface', () => {
    // Budget creation, budget lines, payments and AR billing are the four write shapes master's API
    // list defines a body for.
    expect(dtos.length).toBeGreaterThanOrEqual(4);
  });

  it.each(dtos)('%s validates its fields rather than accepting anything', (file) => {
    // A DTO with no decorator is a body the ValidationPipe waves through: `whitelist: true` strips
    // what is not decorated, so an undecorated DTO arrives EMPTY rather than unvalidated — which is
    // the more confusing failure of the two.
    const body = read(`${financeDir}/dto/${file}`);
    expect(body).toMatch(/@Is[A-Za-z]+\(/);
  });
});

describe('Phase 7 · ERP integration — Strategy pattern, three stubs (master:3003, 3015-3020)', () => {
  const erp = `${financeDir}/ep/erp-integration.stub.ts`;

  it('declares the common ERPIntegration interface', () => {
    expect(exists(erp)).toBe(true);
    expect(read(erp)).toMatch(/interface ERPIntegration/);
  });

  it.each(['postCostTransaction', 'postInvoice', 'syncVendor'])(
    'the interface declares %s (master:3015)',
    (method) => {
      expect(read(erp)).toContain(method);
    },
  );

  it.each(['SAPAdapter', 'OracleAdapter', 'DynamicsAdapter'])(
    '%s exists and implements the interface (master:3017-3019)',
    (adapter) => {
      // Three adapters, one interface: the point of the pattern is that onboarding a fourth ERP adds
      // a class and changes no caller.
      expect(read(erp)).toMatch(new RegExp(`class ${adapter}\\w*\\s+implements ERPIntegration`));
    },
  );
});

describe('Phase 7 · construction financing — AR factoring (master:3023-3026)', () => {
  const fin = `${financeDir}/ep/construction-financing.stub.ts`;

  it('exists', () => {
    expect(exists(fin)).toBe(true);
  });

  it('declares submitFactoringApplication(invoiceId, tenantId) (master:3024)', () => {
    expect(read(fin)).toContain('submitFactoringApplication');
  });

  it('refuses rather than returning a fake reference (master:3026)', () => {
    // "per-partner adapter implemented on first tenant request" — so an unimplemented stub is the
    // CORRECT state, and the only thing it must not do is succeed. A stub that returned a plausible
    // FinancingRef would tell a user their invoice had been submitted to a lender that never
    // received it.
    //
    // The earlier version of this test asserted the stub filtered on `invoice.status = VERIFIED`
    // (master:3025). That describes what the adapter will export once written; requiring it of a
    // body that is a single throw was reading an implementation obligation into a deferral.
    expect(read(fin)).toMatch(/NotImplementedException|throw/);
  });
});

describe('Phase 7 · exchange rates — Open Exchange Rates only (master:3004-3008)', () => {
  const rates = `${financeDir}/exchange-rate.service.ts`;

  it('exists', () => {
    expect(exists(rates)).toBe(true);
  });

  it('calls Open Exchange Rates', () => {
    expect(read(rates)).toContain('openexchangerates.org');
  });

  it('caches for 24 hours', () => {
    // 86400 seconds. Spelled either way, but it must be the number the spec states.
    expect(read(rates)).toMatch(/86400|24 \* 60 \* 60/);
  });

  it('refreshes daily at 00:00 UTC', () => {
    const body = read(rates);
    expect(body).toMatch(/@Cron\('0 0 \* \* \*'/);
    expect(body).toContain('UTC');
  });

  it('falls back to the last cached rate when the API is unavailable', () => {
    // Stale-while-revalidate: a payment must not fail because a rate provider is down.
    expect(read(rates)).toMatch(/stale|cached/i);
  });

  it('no bespoke rate arithmetic lives in the module (master:3008)', () => {
    // "Do NOT implement custom exchange rate logic" — no cross-rate derivation, no hand-rolled
    // triangulation, no hardcoded pairs.
    expect(src).not.toMatch(/const\s+\w*RATES?\s*(:\s*[^=]+)?=\s*\{[^}]*THB/i);
  });
});
