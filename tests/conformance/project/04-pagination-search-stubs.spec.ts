/**
 * Phase 3 Generate items 03, 06, 07, the two Decisions, and Constraint C2
 * — master:2185, 2188-2189, 2199-2214, 2220-2222
 *
 *   item 03 "DTOs for create, update, transition (with class-validator)"
 *   item 06 "Pagination utility (cursor-based preferred over offset)"
 *   item 07 "Full-text search via OpenSearch (project_name, project_code)"
 *   D1      CRMIntegration — interface + Salesforce/HubSpot/Pipedrive sub-stubs
 *   D2      BIMIntegration — importProjectStructure interface
 *   C2      docs/registers/localization-gaps.md must exist by Phase 3 completion
 */
import * as fs from 'fs';
import * as path from 'path';
import { exists, read, repoRoot } from '../helpers';

const moduleFiles = ((): string[] => {
  const dir = path.join(repoRoot, 'backend/src/modules/project');
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else out.push(full);
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return out;
})();

const dtos = moduleFiles.filter((f) => f.endsWith('.dto.ts'));
const readAll = (fs_: string[]): string => fs_.map((f) => fs.readFileSync(f, 'utf8')).join('\n');

describe('Phase 3 · DTOs use class-validator (master:2185; QM-4)', () => {
  it('the module ships DTOs', () => {
    expect(dtos.length).toBeGreaterThan(0);
  });

  it.each(['create', 'update', 'transition'])('a %s DTO exists', (kind) => {
    expect(dtos.some((f) => path.basename(f).includes(kind))).toBe(true);
  });

  it.each(dtos.map((f) => path.relative(repoRoot, f)))('%s imports class-validator', (rel) => {
    expect(read(rel)).toMatch(/from ['"]class-validator['"]/);
  });
});

describe('Phase 3 · cursor-based pagination (master:2188)', () => {
  /** master:1594 puts the pagination helper in @cos/database. */
  const dbSrc = ((): string => {
    const dir = path.join(repoRoot, 'packages/@cos/database/src');
    if (!fs.existsSync(dir)) return '';
    const out: string[] = [];
    const walk = (d: string): void => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) {
          if (e.name !== '__tests__') walk(full);
        } else if (full.endsWith('.ts') && !full.endsWith('.spec.ts')) out.push(full);
      }
    };
    walk(dir);
    return readAll(out);
  })();

  it('@cos/database ships a pagination helper', () => {
    expect(dbSrc).toMatch(/paginat/i);
  });

  it('it is cursor-based, not offset-based (master:2188)', () => {
    expect(dbSrc).toMatch(/cursor/i);
  });
});

describe('Phase 3 · OpenSearch full-text on project_name and project_code (master:2189)', () => {
  const src = readAll(moduleFiles.filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts')));

  it('the module talks to OpenSearch', () => {
    expect(src).toMatch(/opensearch/i);
  });

  it.each(['project_name', 'project_code'])('%s is an indexed/searched field', (field) => {
    expect(src).toMatch(new RegExp(field));
  });
});

describe('Phase 3 · D1 CRMIntegration stub (master:2201-2208)', () => {
  const corpus = ((): string => {
    const out: string[] = [];
    const walk = (d: string): void => {
      if (!fs.existsSync(d)) return;
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) {
          if (!['node_modules', 'dist'].includes(e.name)) walk(full);
        } else if (full.endsWith('.ts')) out.push(full);
      }
    };
    walk(path.join(repoRoot, 'backend/src'));
    walk(path.join(repoRoot, 'packages'));
    return readAll(out);
  })();

  it('declares createProjectFromLead(crmLeadId, tenantId)', () => {
    expect(corpus).toMatch(/createProjectFromLead/);
  });

  it.each(['Salesforce', 'HubSpot', 'Pipedrive'])('%s adapter stub exists', (vendor) => {
    expect(corpus).toMatch(new RegExp(`${vendor}Adapter`));
  });

  it('D2 BIMIntegration declares importProjectStructure (master:2212)', () => {
    expect(corpus).toMatch(/importProjectStructure/);
  });
});

describe('Phase 3 · C2 localization gaps documented (master:2220-2222)', () => {
  it('docs/registers/localization-gaps.md exists', () => {
    expect(exists('docs/registers/localization-gaps.md')).toBe(true);
  });
});
