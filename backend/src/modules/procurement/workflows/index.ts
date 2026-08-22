// Workflow bundle entry for the `procurement` task queue.
//
// Temporal's `workflowsPath` needs ONE module that reaches every workflow the worker should serve.
// `worker.ts` used to pass `require.resolve('./')`, which resolves a DIRECTORY — Node then looks for
// `package.json#main` or `index.js` inside it, and neither existed here or in `backend/dist`. So the
// call threw `MODULE_NOT_FOUND` and `runProcurementWorker()` could never start, in ts-node or in the
// compiled build.
//
// Nothing caught it because nothing ran it: the workflow specs pass an explicit file
// (`require.resolve('../workflows/rfq.workflow')`), so the line in worker.ts was unreachable from
// the test suite even at 100% coverage — and no process launched the worker in production either
// (TDD OQ-32). Found 2026-08-22 by starting the worker against a live Temporal server.
//
// THIS FILE IS THE FIX. `worker.ts` now says `require.resolve('./index')` rather than `'./'`, but
// that change alone would have resolved nothing — the directory had no entry module at all. The
// explicit specifier is for the reader; this file is what makes the worker start.
//
// Re-export only WORKFLOWS. The module is bundled into
// the deterministic workflow sandbox, where Node built-ins and I/O are unavailable, so pulling in an
// activities module would break the bundle at runtime.

export * from './rfq.workflow';
export * from './po.workflow';
