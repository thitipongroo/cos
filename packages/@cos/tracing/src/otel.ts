// OpenTelemetry initialization — Phase 15 adds the full implementation.
// Import this module as early as possible in main.ts (before other imports).

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

let sdk: NodeSDK | null = null;

export function initTracing(serviceName: string): void {
  sdk = new NodeSDK({
    serviceName,
    instrumentations: [getNodeAutoInstrumentations()],
  });
  sdk.start();
}

export async function shutdownTracing(): Promise<void> {
  if (sdk) {
    await sdk.shutdown();
  }
}

export function getTraceId(): string {
  // Phase 15: wire to active OTel span context
  return 'unset';
}
