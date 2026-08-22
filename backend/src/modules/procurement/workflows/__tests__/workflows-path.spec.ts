// Guards the defect that made every backend Temporal worker unstartable.
//
// All three workers passed `require.resolve('./')` as Temporal's `workflowsPath`. That resolves a
// DIRECTORY: Node then looks for `package.json#main` or `index.js` inside it, and none of the three
// directories had either — not in `src`, not in `backend/dist`. So `Worker.create` threw
// `MODULE_NOT_FOUND` before it ever contacted Temporal, and `runProcurementWorker()`,
// `runEnterpriseProvisioningWorker()` and `runDataExportWorker()` could not start at all.
//
// The workflow specs never touched it: they pass an explicit file
// (`require.resolve('../workflows/rfq.workflow')`) to their own TestWorkflowEnvironment worker, so
// the production line was unreachable from the suite even at 100% branch coverage. And nothing
// launched the workers in production either, so no environment ever reported the failure
// (TDD OQ-32). It surfaced only when the worker was run against a live Temporal server on
// 2026-08-22.
//
// This spec asserts the one property that was false: that each worker's workflowsPath argument
// resolves to a real module. It is deliberately a resolution test and not a Worker.create test —
// starting a real worker needs a Temporal server, which the unit suite does not have, and that is
// precisely the gap this defect lived in.

import { existsSync, readFileSync } from 'fs';

describe('Temporal workflowsPath resolution (OQ-32)', () => {
  // Same specifiers the three workers pass, resolved from the same directories.
  const cases: Array<{ worker: string; from: string; specifier: string }> = [
    {
      worker: 'runProcurementWorker',
      from: '../../workflows',
      specifier: '../index',
    },
    {
      worker: 'runEnterpriseProvisioningWorker',
      from: '../../../tenant/workflows',
      specifier: '../../../tenant/workflows/enterprise-provisioning.workflow',
    },
    {
      worker: 'runDataExportWorker',
      from: '../../../identity/data-export/workflows',
      specifier: '../../../identity/data-export/workflows/data-export.workflow',
    },
  ];

  it.each(cases)('$worker: workflowsPath resolves to a real module', ({ specifier }) => {
    const resolved = require.resolve(specifier);
    expect(resolved).toBeTruthy();
    expect(existsSync(resolved)).toBe(true);
  });

  it('the procurement bundle entry re-exports BOTH workflows', () => {
    // jest.requireActual, not a static import: a static one turns a missing entry module into a
    // TypeScript compile error for the whole suite, which is a blunter signal than an assertion
    // naming the missing export.
    const bundle = jest.requireActual('../index') as Record<string, unknown>;
    // The procurement queue serves TWO workflows. An entry that re-exported only one would start
    // the worker cleanly and then fail at signal time, which is harder to trace than a startup error.
    expect(typeof bundle['rfqWorkflow']).toBe('function');
    expect(typeof bundle['poWorkflow']).toBe('function');
  });

  it('the bundle entry pulls in no activities module', () => {
    // The workflow bundle is compiled into Temporal's deterministic sandbox, where Node built-ins
    // and I/O do not exist. An activities import here would break the bundle at runtime rather than
    // at build time, so keep the entry to workflows only.
    const src = readFileSync(require.resolve('../index'), 'utf-8');
    expect(src).not.toMatch(/from '\.\/[a-z-]*\.activities'/);
    expect(src).not.toMatch(/from '\.\/activity-helpers'/);
  });
});
