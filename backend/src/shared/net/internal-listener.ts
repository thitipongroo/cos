// The internal listener — a second port for service-to-service routes (ADR-107, revision R8).
//
// WHY A SECOND PORT
// -----------------
// file-service, credential-service and ai-gateway ask the backend who a user is (`GET /api/v1/auth/identity`).
// On the public port every request passes CloudflareWafMiddleware, which in production refuses anything
// without a `CF-Ray` header — so every call from inside the cluster was a 403 (Rule 41 review, 2026-09-14).
// Routes meant only for those services are therefore served on INTERNAL_PORT, which the public edge never
// reaches (the Service port `internal`, admitted by NetworkPolicy from those three workloads only), and the
// WAF check does not apply there.
//
// HOW — ONE APPLICATION, TWO SOCKETS
// ----------------------------------
// Not a second Nest application: that would build every provider twice (a second Prisma pool, a second
// Unleash client, a second Kafka producer). Fastify exposes its complete HTTP handler as `fastify.routing`
// ("Method to access the lookup method of the internal router and match the request to the appropriate
// handler" — fastify 5.9.0 docs/Reference/Server.md#routing; fastify.js:176 assigns it `httpHandler`, the same
// function the main server and Fastify's own secondary-address servers use in lib/server.js). A plain Node
// server on INTERNAL_PORT hands every request to it, so hooks, Nest middleware, guards and filters all run.
//
// WHICH SOCKET A REQUEST CAME IN ON
// ---------------------------------
// `socket.localPort` — the port of OUR end of the TCP connection. The caller cannot choose it with a header;
// it is the listener that accepted the connection.

import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';

export const DEFAULT_INTERNAL_PORT = 3100;

export function internalPort(): number {
  const raw = process.env['INTERNAL_PORT'];
  const port = raw === undefined || raw === '' ? DEFAULT_INTERNAL_PORT : Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`INTERNAL_PORT must be a TCP port, got "${raw}"`);
  }
  return port;
}

/**
 * The ONLY paths the internal listener serves. It skips the WAF, so without this list every public route would
 * be reachable on INTERNAL_PORT from any pod the NetworkPolicy admits, minus the edge checks. Anything else
 * there is a 404 (CloudflareWafMiddleware). Exact paths; a query string is ignored.
 */
export const INTERNAL_ROUTES: ReadonlySet<string> = new Set(['/api/v1/auth/identity']);

export function isInternalRoute(url: string | undefined): boolean {
  return INTERNAL_ROUTES.has((url ?? '').split('?')[0]!);
}

/** A raw request, or a Fastify request wrapping one. */
type AnyRequest = IncomingMessage | { raw?: IncomingMessage; socket?: IncomingMessage['socket'] };

/** Did this request arrive on the internal listener? */
export function isInternalRequest(req: AnyRequest): boolean {
  const socket = (req as { raw?: IncomingMessage }).raw?.socket ?? (req as IncomingMessage).socket;
  return socket?.localPort === internalPort();
}

/**
 * Serve the already-listening application on INTERNAL_PORT too. Call after `app.listen()`: `routing` is only
 * meaningful once Fastify is ready. The returned server must be closed on shutdown — see `closeServer`.
 */
export async function startInternalListener(app: NestFastifyApplication): Promise<Server> {
  const fastify = app.getHttpAdapter().getInstance();
  const server = createServer((req, res) => fastify.routing(req, res));
  const port = internalPort();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', () => {
      server.off('error', reject);
      resolve();
    });
  });
  return server;
}

/** Close a server, resolving once it has stopped; a server that is not listening is already closed. */
export function closeServer(server: Server | undefined): Promise<void> {
  if (!server?.listening) return Promise.resolve();
  return new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}
