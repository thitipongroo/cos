// The Temporal connection every backend worker runs on (D41, 2026-11-12).
//
// `Worker.create()` without a `connection` dials localhost:7233, whatever TEMPORAL_ADDRESS says. All
// three backend workers did that, so in compose (Temporal at temporal:7233) and in Kubernetes they
// could never have reached Temporal. Nobody saw it: on the Alpine image they died earlier, loading
// Temporal's glibc-only native bridge (D40). The address comes from the same variable, with the same
// default, as the Temporal clients in tenant.service.ts and data-export.service.ts.

import { NativeConnection } from '@temporalio/worker';

export function temporalAddress(): string {
  return process.env['TEMPORAL_ADDRESS'] ?? 'localhost:7233';
}

export function connectTemporalWorker(): Promise<NativeConnection> {
  return NativeConnection.connect({ address: temporalAddress() });
}
