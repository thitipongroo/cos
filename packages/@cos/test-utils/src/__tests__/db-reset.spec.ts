// db-reset.ts — unit tests with a mocked pg Client
import { truncateAllTables, resetAndSeed } from '../db-reset';

type MockClient = { query: jest.Mock };

const makeClient = (tableRows: Array<{ tablename: string }> = []): MockClient => ({
  query: jest.fn().mockImplementation((sql: string) => {
    if (typeof sql === 'string' && sql.includes('pg_tables')) {
      return Promise.resolve({ rows: tableRows });
    }
    return Promise.resolve({ rows: [] });
  }),
});

describe('truncateAllTables', () => {
  it('sets and resets session_replication_role', async () => {
    const client = makeClient();
    await truncateAllTables(client as unknown as Parameters<typeof truncateAllTables>[0]);
    expect(client.query).toHaveBeenCalledWith('SET session_replication_role = replica');
    expect(client.query).toHaveBeenCalledWith('SET session_replication_role = DEFAULT');
  });

  it('queries pg_tables for each domain schema', async () => {
    const client = makeClient();
    await truncateAllTables(client as unknown as Parameters<typeof truncateAllTables>[0]);
    const schemaCalls = client.query.mock.calls.filter(
      ([sql]: [string]) => typeof sql === 'string' && sql.includes('pg_tables'),
    );
    expect(schemaCalls).toHaveLength(9);
  });

  it('truncates each table returned for a schema', async () => {
    const client = makeClient([{ tablename: 'users' }, { tablename: 'sessions' }]);
    await truncateAllTables(client as unknown as Parameters<typeof truncateAllTables>[0]);
    const truncateCalls = client.query.mock.calls.filter(
      ([sql]: [string]) => typeof sql === 'string' && sql.startsWith('TRUNCATE'),
    );
    expect(truncateCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('does not truncate when schema has no tables', async () => {
    const client = makeClient([]);
    await truncateAllTables(client as unknown as Parameters<typeof truncateAllTables>[0]);
    const truncateCalls = client.query.mock.calls.filter(
      ([sql]: [string]) => typeof sql === 'string' && sql.startsWith('TRUNCATE'),
    );
    expect(truncateCalls).toHaveLength(0);
  });
});

describe('resetAndSeed', () => {
  it('calls truncateAllTables then the seed function', async () => {
    const client = makeClient();
    const seed = jest.fn().mockResolvedValue(undefined);
    await resetAndSeed(
      client as unknown as Parameters<typeof resetAndSeed>[0],
      seed as Parameters<typeof resetAndSeed>[1],
    );
    expect(client.query).toHaveBeenCalledWith('SET session_replication_role = replica');
    expect(seed).toHaveBeenCalledWith(client);
  });
});
