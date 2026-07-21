// Structured JSON logging (QM-8). Deliberately a local pino instance rather than `@cos/logger`:
// that package is CommonJS and `tsconfig.base.json` maps `@cos/*` to its *source*, so importing it
// from this ESM service would force `rootDir: "../.."` on the whole package — changing the emitted
// dist layout (and the Dockerfile entrypoint) to pull in ten lines of configuration. The pino options
// below mirror `packages/@cos/logger/src/logger.ts` exactly, so the emitted log shape (level,
// timestamp, service, module, `event` message key) stays identical across services.
//
// What may be logged is intentionally narrow: ids, enums, booleans. Never a credential body, claim,
// DID document, sign token, or any key material — plaintext or ciphertext (§5.9.8 Information
// Disclosure). The issuer private key never leaves key-manager, and nothing here takes it as input.
import pino, { type Logger } from 'pino';

const base = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  messageKey: 'event',
  formatters: {
    level: (label) => ({ level: label }),
  },
  base: {
    service: process.env['OTEL_SERVICE_NAME'] ?? 'credential-service',
  },
  timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
});

export function createLogger(module: string): Logger {
  return base.child({ module });
}
