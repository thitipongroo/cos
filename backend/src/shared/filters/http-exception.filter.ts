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

// Duck-typed response shape — the filter must work under the Fastify adapter
// (Reply: .status()/.code() + .send()) AND Express (.status() + .json()), and must
// tolerate the raw Node ServerResponse handed to it when an exception is thrown inside
// @fastify/middie middleware (.statusCode + .end(), no .status()/.json()). Writing the
// response must NEVER throw — a throwing exception filter crashes the whole process.
interface ResponseLike {
  status?: (code: number) => unknown;
  code?: (code: number) => unknown;
  json?: (body: unknown) => void;
  send?: (body: unknown) => void;
  statusCode?: number;
  setHeader?: (name: string, value: string) => void;
  end?: (chunk: string) => void;
}

interface HttpRequest {
  requestId?: string;
}

// Adapter-agnostic, crash-proof response writer.
function writeError(response: ResponseLike, status: number, body: Qm10Body): void {
  try {
    // Express — status().json()
    if (typeof response.status === 'function' && typeof response.json === 'function') {
      (response.status(status) as { json: (b: unknown) => void }).json(body);
      return;
    }
    // Fastify Reply — status()/code() then send() (auto-serializes objects to JSON)
    if (typeof response.send === 'function') {
      const setStatus = response.status ?? response.code;
      if (typeof setStatus === 'function') setStatus.call(response, status);
      response.send(body);
      return;
    }
    // Raw Node ServerResponse (middie middleware context)
    if (typeof response.end === 'function') {
      if (typeof response.setHeader === 'function') {
        response.setHeader('content-type', 'application/json; charset=utf-8');
      }
      response.statusCode = status;
      response.end(JSON.stringify(body));
      return;
    }
    logger.error({ status }, 'exception-filter.unwritable-response');
  } catch (writeErr) {
    // Last-resort guard — the error handler must never crash the process itself.
    logger.error(
      { err: writeErr instanceof Error ? writeErr.message : String(writeErr) },
      'exception-filter.write-failed',
    );
  }
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
    const response = ctx.getResponse<ResponseLike>();
    const request = ctx.getRequest<HttpRequest>();

    const traceId = getTraceId();
    const timestamp = new Date().toISOString();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      if (isQm10Body(body)) {
        const err = body.error;
        writeError(response, status, {
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

        writeError(response, status, {
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

      writeError(response, status, {
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

    writeError(response, HttpStatus.INTERNAL_SERVER_ERROR, {
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
