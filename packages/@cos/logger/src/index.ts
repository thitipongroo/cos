// @cos/logger — Structured JSON logging (Pino-based)
// QM-8: every log entry must include trace_id, span_id, tenantId, userId
// NEVER use console.log — always use this logger

import pino, { Logger } from 'pino';

export interface LogContext {
  tenantId?: string;
  userId?: string;
  traceId?: string;
  spanId?: string;
  service?: string;
  module?: string;
  event?: string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

const base = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  messageKey: 'event',
  formatters: {
    level: (label) => ({ level: label }),
  },
  base: {
    service: process.env['OTEL_SERVICE_NAME'] ?? 'cos-backend',
  },
  timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
});

export function createLogger(module: string): Logger {
  return base.child({ module });
}

export const logger = base;
export type { Logger };
