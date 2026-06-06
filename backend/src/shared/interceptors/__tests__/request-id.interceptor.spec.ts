import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';
import { RequestIdInterceptor } from '../request-id.interceptor';

function makeContext(requestId?: string): {
  context: ExecutionContext;
  header: jest.Mock;
  request: { headers: Record<string, string | undefined>; requestId?: string };
} {
  const header = jest.fn();
  const request: { headers: Record<string, string | undefined>; requestId?: string } = {
    headers: requestId !== undefined ? { 'x-request-id': requestId } : {},
  };
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({ header }),
    }),
  } as unknown as ExecutionContext;
  return { context, header, request };
}

const callHandler: CallHandler = { handle: () => of(null) };

describe('RequestIdInterceptor', () => {
  let interceptor: RequestIdInterceptor;

  beforeEach(() => {
    interceptor = new RequestIdInterceptor();
  });

  it('uses incoming x-request-id header when present', (done) => {
    const { context, header, request } = makeContext('client-id-123');
    interceptor.intercept(context, callHandler).subscribe(() => {
      expect(request.requestId).toBe('client-id-123');
      expect(header).toHaveBeenCalledWith('x-request-id', 'client-id-123');
      done();
    });
  });

  it('generates a UUID when x-request-id header is absent', (done) => {
    const { context, header, request } = makeContext();
    interceptor.intercept(context, callHandler).subscribe(() => {
      expect(request.requestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      expect(header).toHaveBeenCalledWith('x-request-id', request.requestId);
      done();
    });
  });

  it('uses first value when x-request-id header is an array', (done) => {
    const header = jest.fn();
    const request: { headers: Record<string, string | string[] | undefined>; requestId?: string } =
      {
        headers: { 'x-request-id': ['first-id', 'second-id'] },
      };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({ header }),
      }),
    } as unknown as ExecutionContext;
    interceptor.intercept(context, callHandler).subscribe(() => {
      expect(request.requestId).toBe('first-id');
      done();
    });
  });

  it('passes the observable through unchanged', (done) => {
    const { context } = makeContext('id-1');
    const result: unknown[] = [];
    interceptor.intercept(context, { handle: () => of('payload') }).subscribe({
      next: (v) => result.push(v),
      complete: () => {
        expect(result).toEqual(['payload']);
        done();
      },
    });
  });
});
