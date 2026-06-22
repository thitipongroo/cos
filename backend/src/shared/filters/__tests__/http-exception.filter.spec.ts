import {
  ArgumentsHost,
  HttpException,
  HttpStatus,
  NotFoundException,
  UnprocessableEntityException,
  BadRequestException,
} from '@nestjs/common';
import { GlobalExceptionFilter } from '../http-exception.filter';

jest.mock('@cos/tracing', () => ({ getTraceId: () => 'trace-abc' }));
jest.mock('@cos/logger', () => ({ createLogger: () => ({ error: jest.fn() }) }));

function makeHost(requestId?: string): { host: ArgumentsHost; json: jest.Mock; status: jest.Mock } {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status, json }),
      getRequest: () => ({ requestId }),
    }),
  } as unknown as ArgumentsHost;
  return { host, json, status };
}

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;

  beforeEach(() => {
    filter = new GlobalExceptionFilter();
  });

  describe('HttpException — already QM-10 body', () => {
    it('passes through QM-10 body with existing traceId', () => {
      const { host, status, json } = makeHost('req-1');
      const err = {
        code: 'COS-PROJ-001',
        message: 'Project not found',
        messageKey: 'project.error.notFound',
        traceId: 'existing-trace',
        timestamp: '2026-01-01T00:00:00.000Z',
      };
      filter.catch(new NotFoundException({ error: err }), host);
      expect(status).toHaveBeenCalledWith(404);
      expect(json).toHaveBeenCalledWith({
        error: expect.objectContaining({ code: 'COS-PROJ-001', traceId: 'existing-trace' }),
      });
    });

    it('fills missing traceId from getTraceId()', () => {
      const { host, json } = makeHost();
      filter.catch(
        new NotFoundException({
          error: { code: 'COS-PROJ-001', message: 'Not found', traceId: '', timestamp: '' },
        }),
        host,
      );
      expect(json).toHaveBeenCalledWith({
        error: expect.objectContaining({ traceId: 'trace-abc' }),
      });
    });

    it('fills missing timestamp', () => {
      const { host, json } = makeHost();
      filter.catch(
        new NotFoundException({
          error: { code: 'COS-PROJ-001', message: 'Not found', traceId: 'x', timestamp: '' },
        }),
        host,
      );
      const call = (json as jest.Mock).mock.calls[0][0] as { error: { timestamp: string } };
      expect(call.error.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('HttpException — ValidationPipe array message', () => {
    it('converts array message to fieldErrors details', () => {
      const { host, status, json } = makeHost();
      filter.catch(
        new BadRequestException({
          message: ['name must not be empty', 'email must be an email'],
          error: 'Bad Request',
          statusCode: 400,
        }),
        host,
      );
      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith({
        error: expect.objectContaining({
          code: 'COS-GENERAL-400',
          message: 'Validation failed',
          messageKey: 'general.error.validation',
          details: { fieldErrors: ['name must not be empty', 'email must be an email'] },
          traceId: 'trace-abc',
        }),
      });
    });

    it('converts string message in object body', () => {
      const { host, status, json } = makeHost();
      filter.catch(
        new UnprocessableEntityException({ message: 'Business rule violated', statusCode: 422 }),
        host,
      );
      expect(status).toHaveBeenCalledWith(422);
      expect(json).toHaveBeenCalledWith({
        error: expect.objectContaining({
          code: 'COS-GENERAL-422',
          message: 'Business rule violated',
          traceId: 'trace-abc',
        }),
      });
    });

    it('falls back to exception.message when msg is not string/array', () => {
      const { host, json } = makeHost();
      filter.catch(new BadRequestException({ message: 42, statusCode: 400 }), host);
      expect(json).toHaveBeenCalledWith({
        error: expect.objectContaining({ code: 'COS-GENERAL-400' }),
      });
    });
  });

  describe('HttpException — string body', () => {
    it('wraps plain string body in QM-10 format', () => {
      const { host, status, json } = makeHost();
      filter.catch(new HttpException('Forbidden resource', HttpStatus.FORBIDDEN), host);
      expect(status).toHaveBeenCalledWith(403);
      expect(json).toHaveBeenCalledWith({
        error: expect.objectContaining({
          code: 'COS-GENERAL-403',
          message: 'Forbidden resource',
          traceId: 'trace-abc',
        }),
      });
    });

    it('falls back to exception.message when body is non-string non-object (null)', () => {
      const { host, json } = makeHost();
      const exception = new HttpException('fallback message', HttpStatus.BAD_GATEWAY);
      jest.spyOn(exception, 'getResponse').mockReturnValue(null as unknown as string);
      filter.catch(exception, host);
      expect(json).toHaveBeenCalledWith({
        error: expect.objectContaining({
          code: 'COS-GENERAL-502',
          message: 'fallback message',
        }),
      });
    });
  });

  describe('Unknown error (non-HttpException)', () => {
    it('returns 500 COS-GENERAL-500 for Error instance', () => {
      const { host, status, json } = makeHost('req-2');
      filter.catch(new Error('database connection lost'), host);
      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith({
        error: expect.objectContaining({
          code: 'COS-GENERAL-500',
          message: 'Internal server error',
          messageKey: 'general.error.internal',
          traceId: 'trace-abc',
        }),
      });
    });

    it('returns 500 for non-Error thrown value', () => {
      const { host, status, json } = makeHost();
      filter.catch('unexpected string thrown', host);
      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith({
        error: expect.objectContaining({ code: 'COS-GENERAL-500' }),
      });
    });
  });

  // The filter must write responses under any adapter and never throw — under Fastify
  // (Reply.send), and under @fastify/middie middleware errors (raw Node ServerResponse).
  describe('adapter-agnostic response writing', () => {
    function hostWith(response: unknown): ArgumentsHost {
      return {
        switchToHttp: () => ({
          getResponse: () => response,
          getRequest: () => ({ requestId: 'r' }),
        }),
      } as unknown as ArgumentsHost;
    }

    it('uses Fastify Reply API (status + send) when json is absent', () => {
      const send = jest.fn();
      const status = jest.fn().mockReturnThis();
      filter.catch(new NotFoundException('nope'), hostWith({ status, send }));
      expect(status).toHaveBeenCalledWith(404);
      expect(send).toHaveBeenCalledWith({
        error: expect.objectContaining({ code: 'COS-GENERAL-404', message: 'nope' }),
      });
    });

    it('falls back to Fastify code() when status() is absent', () => {
      const send = jest.fn();
      const code = jest.fn();
      filter.catch(new Error('boom'), hostWith({ code, send }));
      expect(code).toHaveBeenCalledWith(500);
      expect(send).toHaveBeenCalledWith({
        error: expect.objectContaining({ code: 'COS-GENERAL-500' }),
      });
    });

    it('sends via send() even when neither status() nor code() exist', () => {
      const send = jest.fn();
      filter.catch(new NotFoundException('nope'), hostWith({ send }));
      expect(send).toHaveBeenCalledWith({
        error: expect.objectContaining({ code: 'COS-GENERAL-404' }),
      });
    });

    it('writes to a raw Node ServerResponse (statusCode + setHeader + end)', () => {
      const end = jest.fn();
      const setHeader = jest.fn();
      const res: { statusCode: number; setHeader: jest.Mock; end: jest.Mock } = {
        statusCode: 0,
        setHeader,
        end,
      };
      filter.catch(new NotFoundException('nope'), hostWith(res));
      expect(res.statusCode).toBe(404);
      expect(setHeader).toHaveBeenCalledWith('content-type', 'application/json; charset=utf-8');
      const written = JSON.parse((end as jest.Mock).mock.calls[0][0] as string) as {
        error: { code: string };
      };
      expect(written.error.code).toBe('COS-GENERAL-404');
    });

    it('writes to a raw response that has no setHeader', () => {
      const end = jest.fn();
      const res: { statusCode: number; end: jest.Mock } = { statusCode: 0, end };
      filter.catch(new Error('x'), hostWith(res));
      expect(res.statusCode).toBe(500);
      expect(end).toHaveBeenCalled();
    });

    it('does not throw when the response is unwritable', () => {
      expect(() => filter.catch(new Error('x'), hostWith({}))).not.toThrow();
    });

    it('does not throw when writing the response itself throws (Error)', () => {
      const status = jest.fn(() => {
        throw new Error('socket closed');
      });
      const json = jest.fn();
      expect(() => filter.catch(new Error('x'), hostWith({ status, json }))).not.toThrow();
    });

    it('does not throw when writing throws a non-Error value', () => {
      const status = jest.fn(() => {
        throw 'raw string failure';
      });
      const json = jest.fn();
      expect(() => filter.catch(new Error('x'), hostWith({ status, json }))).not.toThrow();
    });
  });
});
