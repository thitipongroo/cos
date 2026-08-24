// Pool sharing — the behaviour that turns ~21 PrismaClients into 2 connection pools.
//
// pg.Pool is REAL here (it connects lazily, so constructing one opens no socket); only PrismaClient
// is mocked. That is deliberate: the property under test is which pg.Pool object each adapter is
// handed, and a mocked Pool would let the registry return anything and still pass.

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({ $disconnect: jest.fn() })),
  Prisma: {},
}));

const adapterArgs: unknown[] = [];
jest.mock('@prisma/adapter-pg', () => ({
  PrismaPg: jest.fn().mockImplementation((poolOrConfig: unknown) => {
    adapterArgs.push(poolOrConfig);
    return {};
  }),
}));

import { Pool } from 'pg';
import { createPrismaClient, endSharedPgPools } from '../create-prisma-client';

const URL_A = 'postgresql://a@localhost:6432/one';
const URL_B = 'postgresql://b@localhost:6432/two';

function poolFor(nth: number): Pool {
  return adapterArgs[nth] as Pool;
}

describe('createPrismaClient — shared pg pools', () => {
  afterEach(async () => {
    await endSharedPgPools();
    adapterArgs.length = 0;
  });

  it('hands the adapter a real pg.Pool, not a bare connection config', () => {
    createPrismaClient(URL_A);
    expect(poolFor(0)).toBeInstanceOf(Pool);
    expect(poolFor(0).options.connectionString).toBe(URL_A);
  });

  // The whole point: the twenty-odd call sites are two datasources, not twenty datasources.
  it('reuses ONE pool across every client built from the same connection string', () => {
    createPrismaClient(URL_A);
    createPrismaClient(URL_A);
    createPrismaClient(URL_A);
    expect(poolFor(0)).toBe(poolFor(1));
    expect(poolFor(1)).toBe(poolFor(2));
  });

  it('keeps distinct datasources on distinct pools (enterprise dedicated DBs must not share)', () => {
    createPrismaClient(URL_A);
    createPrismaClient(URL_B);
    expect(poolFor(0)).not.toBe(poolFor(1));
    expect(poolFor(1).options.connectionString).toBe(URL_B);
  });

  // A pg Pool with no 'error' listener takes the process down when an idle backend dies (PgBouncer
  // recycling a server connection is routine). PrismaPg attaches its own and removes it on dispose,
  // so the pool must carry one of its own that outlives every client.
  it('attaches an idle-client error listener that no client disposal can remove', () => {
    createPrismaClient(URL_A);
    expect(poolFor(0).listenerCount('error')).toBeGreaterThan(0);
  });

  it('endSharedPgPools closes the pools and empties the registry', async () => {
    createPrismaClient(URL_A);
    const first = poolFor(0);
    const ended = jest.spyOn(first, 'end');

    await endSharedPgPools();
    expect(ended).toHaveBeenCalledTimes(1);

    // Registry cleared — the next client builds a fresh pool rather than handing out the closed one.
    createPrismaClient(URL_A);
    expect(poolFor(1)).not.toBe(first);
  });

  it('endSharedPgPools is safe to call twice (Nest can fire shutdown hooks more than once)', async () => {
    createPrismaClient(URL_A);
    await endSharedPgPools();
    await expect(endSharedPgPools()).resolves.toBeUndefined();
  });

  // Shutdown is the last thing to run; a pool that refuses to close must not take the rest of it down
  // with an unhandled rejection.
  it('endSharedPgPools survives a pool that fails to close', async () => {
    createPrismaClient(URL_A);
    jest
      .spyOn(poolFor(0), 'end')
      .mockImplementationOnce(() => Promise.reject(new Error('connection already gone')));

    await expect(endSharedPgPools()).resolves.toBeUndefined();
  });

  // The listener attached in sharedPool() has to actually absorb the event. An 'error' with no
  // handler on an EventEmitter is a process-level throw, and pg emits one whenever an IDLE backend
  // dies — routine when PgBouncer recycles a server connection.
  it('swallows an idle-client error instead of letting it crash the process', () => {
    createPrismaClient(URL_A);
    const emit = poolFor(0).emit.bind(poolFor(0)) as (event: string, err: Error) => boolean;
    expect(() => emit('error', new Error('idle client terminated'))).not.toThrow();
  });
});
