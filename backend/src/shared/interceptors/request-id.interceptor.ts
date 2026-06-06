// RequestIdInterceptor — propagates x-request-id on every request/response (QM-8, Priority 0 §E).
// Reads x-request-id from inbound header; generates UUID v4 if absent.
// Sets request.requestId so exception filters and loggers can reference it.
// Sets x-request-id response header so callers can correlate logs.

import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';

interface IncomingRequest {
  headers: Record<string, string | string[] | undefined>;
  requestId?: string;
}

interface OutgoingResponse {
  header(name: string, value: string): void;
}

function uuidV4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<IncomingRequest>();
    const response = ctx.getResponse<OutgoingResponse>();

    const incoming = request.headers['x-request-id'];
    const requestId = (Array.isArray(incoming) ? incoming[0] : incoming) ?? uuidV4();

    request.requestId = requestId;
    response.header('x-request-id', requestId);

    return next.handle();
  }
}
