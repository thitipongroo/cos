import { request as httpRequest, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  DEFAULT_INTERNAL_PORT,
  closeServer,
  internalPort,
  isInternalRequest,
  isInternalRoute,
  startInternalListener,
} from '../internal-listener';

const ORIGINAL = process.env['INTERNAL_PORT'];

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env['INTERNAL_PORT'];
  else process.env['INTERNAL_PORT'] = ORIGINAL;
});

describe('internalPort', () => {
  it('defaults to 3100 when unset or empty', () => {
    delete process.env['INTERNAL_PORT'];
    expect(internalPort()).toBe(DEFAULT_INTERNAL_PORT);
    process.env['INTERNAL_PORT'] = '';
    expect(internalPort()).toBe(3100);
  });

  it('reads INTERNAL_PORT', () => {
    process.env['INTERNAL_PORT'] = '4100';
    expect(internalPort()).toBe(4100);
  });

  it.each(['abc', '0', '70000', '31.5'])(
    'refuses "%s" — a wrong port must not boot silently',
    (v) => {
      process.env['INTERNAL_PORT'] = v;
      expect(() => internalPort()).toThrow('INTERNAL_PORT must be a TCP port');
    },
  );
});

describe('isInternalRequest', () => {
  it('is true only when the accepting socket is the internal port — raw request', () => {
    expect(isInternalRequest({ socket: { localPort: 3100 } } as unknown as IncomingMessage)).toBe(
      true,
    );
    expect(isInternalRequest({ socket: { localPort: 3000 } } as unknown as IncomingMessage)).toBe(
      false,
    );
  });

  it('reads the raw socket of a Fastify request', () => {
    expect(isInternalRequest({ raw: { socket: { localPort: 3100 } } } as never)).toBe(true);
    expect(isInternalRequest({ raw: { socket: { localPort: 3000 } } } as never)).toBe(false);
  });

  it('is false when there is no socket at all', () => {
    expect(isInternalRequest({} as never)).toBe(false);
  });
});

describe('isInternalRoute', () => {
  it('admits exactly the identity route, with or without a query string', () => {
    expect(isInternalRoute('/api/v1/auth/identity')).toBe(true);
    expect(isInternalRoute('/api/v1/auth/identity?x=1')).toBe(true);
  });

  it.each(['/api/v1/auth/identity/', '/api/v1/users/me', '/api/v1/auth/identityx', '', undefined])(
    'refuses %p',
    (url) => {
      expect(isInternalRoute(url)).toBe(false);
    },
  );
});

describe('startInternalListener', () => {
  it("hands every request to Fastify's routing handler, on INTERNAL_PORT", async () => {
    const routing = jest.fn((_req: IncomingMessage, res: { end: (b: string) => void }) =>
      res.end('ok'),
    );
    const app = { getHttpAdapter: () => ({ getInstance: () => ({ routing }) }) } as never;

    // Pick a free port first, then point INTERNAL_PORT at it.
    const probe = (await import('node:net')).createServer();
    await new Promise<void>((r) => probe.listen(0, '127.0.0.1', r));
    const free = (probe.address() as AddressInfo).port;
    await new Promise<void>((r) => probe.close(() => r()));
    process.env['INTERNAL_PORT'] = String(free);

    const server = await startInternalListener(app);
    const body = await new Promise<string>((resolve, reject) => {
      const req = httpRequest({ host: '127.0.0.1', port: free, path: '/x' }, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve(data));
      });
      req.on('error', reject);
      req.end();
    });
    expect(body).toBe('ok');
    expect(routing).toHaveBeenCalledTimes(1);

    await closeServer(server);
    expect(server.listening).toBe(false);
  });

  it('rejects when the port is taken', async () => {
    const blocker = (await import('node:net')).createServer();
    await new Promise<void>((r) => blocker.listen(0, '0.0.0.0', r));
    process.env['INTERNAL_PORT'] = String((blocker.address() as AddressInfo).port);
    const app = {
      getHttpAdapter: () => ({ getInstance: () => ({ routing: jest.fn() }) }),
    } as never;
    await expect(startInternalListener(app)).rejects.toThrow(/EADDRINUSE/);
    await new Promise<void>((r) => blocker.close(() => r()));
  });
});

describe('closeServer', () => {
  it('resolves at once for no server, or one that is not listening', async () => {
    await expect(closeServer(undefined)).resolves.toBeUndefined();
    await expect(closeServer({ listening: false } as never)).resolves.toBeUndefined();
  });

  it('rejects when close reports an error', async () => {
    const server = { listening: true, close: (cb: (e?: Error) => void) => cb(new Error('boom')) };
    await expect(closeServer(server as never)).rejects.toThrow('boom');
  });
});
