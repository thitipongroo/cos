// Regression guard: every feature module under src/modules/*/ must be registered in AppModule's
// imports. EquipmentModule (Phase 21) was fully implemented but never wired — its 9 endpoints were
// unreachable (404) and no test caught it because unit tests instantiate controllers directly and the
// integration suite never hit an equipment route. This fs-level check needs no app bootstrap.

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

// Feature modules intentionally NOT registered at the app root (e.g. sub-modules imported only by a
// parent module). Empty today — every src/modules/* module is a root feature module.
const EXEMPT = new Set<string>([]);

describe('AppModule feature-module wiring', () => {
  it('registers every src/modules/*/*.module.ts in AppModule imports', () => {
    const srcDir = __dirname;
    const modulesDir = join(srcDir, 'modules');
    const appModuleSrc = readFileSync(join(srcDir, 'app.module.ts'), 'utf-8');

    const unwired: string[] = [];
    for (const entry of readdirSync(modulesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const moduleFile = readdirSync(join(modulesDir, entry.name)).find(
        (f) => f.endsWith('.module.ts') && !f.endsWith('.spec.ts'),
      );
      if (!moduleFile) continue;
      const moduleSrc = readFileSync(join(modulesDir, entry.name, moduleFile), 'utf-8');
      const cls = moduleSrc.match(/export class (\w+Module)/)?.[1];
      if (!cls || EXEMPT.has(cls)) continue;

      // Registered = the class name appears as an entry in the imports array (`    XModule,`) AND is
      // imported at the top of app.module.ts.
      const inImportsArray = new RegExp(`^\\s*${cls},`, 'm').test(appModuleSrc);
      const isImported = new RegExp(`import \\{ ${cls} \\}`).test(appModuleSrc);
      if (!inImportsArray || !isImported) unwired.push(cls);
    }

    expect(unwired).toEqual([]);
  });
});
