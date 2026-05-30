// Extension Point Stub Base — TypeScript
// Source: context/00_master_construction_os.md §EXTENSION POINT PROTOCOL
// Every extension_point() stub MUST extend this class and call logStubCall().

import { createLogger } from '@cos/logger';

const epLogger = createLogger('extension-points');

export abstract class StubBase {
  abstract readonly EP_ID: string;
  abstract readonly EP_VERSION: string;
  abstract readonly TRIGGER: string;
  abstract readonly PHASE: string;

  /**
   * Must be called at the start of every stub method.
   * Emits a WARN log so stubs are always visible in observability.
   * QM-8: trace_id is injected when available via AsyncLocalStorage context.
   */
  protected logStubCall(methodName: string, context?: Record<string, unknown>): void {
    epLogger.warn(
      {
        ep_id: this.EP_ID,
        ep_version: this.EP_VERSION,
        phase: this.PHASE,
        trigger: this.TRIGGER,
        method: methodName,
        context,
      },
      `[STUB] ${this.EP_ID}#${methodName} called — implement when: ${this.TRIGGER}`,
    );
  }
}
