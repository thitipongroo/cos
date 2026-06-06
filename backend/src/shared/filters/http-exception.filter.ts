// GlobalExceptionFilter — QM-10 error response standard.
// Catches all exceptions; formats to {error: {code, message, messageKey, details, traceId, timestamp}}.
// Never exposes stack traces or internal paths in API error responses (QM-10).

import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { getTraceId } from '@cos/tracing';
import { createLogger } from '@cos/logger';

const logger = createLogger('global-exception-filter');

interface Qm10Error {
  code: string;
  message: string;
  messageKey?: string;
  details?: unknown;
  traceId: string;
  timestamp: string;
}

interface Qm10Body {
  error: Qm10Error;
}

// Minimal duck-typed interfaces — avoids express/fastify import coupling
interface HttpResponse {
  status(code: number): this;
  json(body: unknown): void;
}

interface HttpRequest {
  requestId?: string;
}

function isQm10Body(body: unknown): body is Qm10Body {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as Record<string, unknown>;
  if (typeof b['error'] !== 'object' || b['error'] === null) return false;
  const e = b['error'] as Record<string, unknown>;
  return typeof e['code'] === 'string' && typeof e['message'] === 'string';
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<HttpResponse>();
    const request = ctx.getRequest<HttpRequest>();

    const traceId = getTraceId();
    const timestamp = new Date().toISOString();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      if (isQm10Body(body)) {
        const err = body.error;
        response.status(status).json({
          error: {
            ...err,
            traceId: err.traceId || traceId,
            timestamp: err.timestamp || timestamp,
          },
        });
        return;
      }

      // ValidationPipe produces { message: string[], error: string, statusCode: number }
      if (typeof body === 'object' && body !== null) {
        const b = body as Record<string, unknown>;
        const msg = b['message'];
        const details = Array.isArray(msg) ? { fieldErrors: msg } : undefined;
        const message = Array.isArray(msg)
          ? 'Validation failed'
          : typeof msg === 'string'
            ? msg
            : exception.message;

        response.status(status).json({
          error: {
            code: `COS-GENERAL-${status}`,
            message,
            messageKey: 'general.error.validation',
            ...(details !== undefined ? { details } : {}),
            traceId,
            timestamp,
          } satisfies Qm10Error,
        });
        return;
      }

      response.status(status).json({
        error: {
          code: `COS-GENERAL-${status}`,
          message: typeof body === 'string' ? body : exception.message,
          traceId,
          timestamp,
        } satisfies Qm10Error,
      });
      return;
    }

    logger.error(
      {
        requestId: request.requestId,
        err: exception instanceof Error ? exception.message : String(exception),
      },
      'unhandled.exception',
    );

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: 'COS-GENERAL-500',
        message: 'Internal server error',
        messageKey: 'general.error.internal',
        traceId,
        timestamp,
      } satisfies Qm10Error,
    });
  }
}
