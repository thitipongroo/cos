// sync_queue against a real SQLite (node:sqlite, in memory) standing in for expo-sqlite, so the SQL the
// queue runs is executed, not just matched as text (fix/mobile-queue-per-user).

// node:sqlite (Node 22.5+) has no typings in this app's @types/node 20 — the slice used here, declared.
interface MiniStatement {
  run(...params: unknown[]): { lastInsertRowid: number | bigint; changes: number | bigint };
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
}
interface MiniDatabase {
  exec(sql: string): void;
  prepare(sql: string): MiniStatement;
}
// eslint-disable-next-line @typescript-eslint/no-require-imports -- a Node builtin without typings here
const { DatabaseSync } = require('node:sqlite') as {
  DatabaseSync: new (path: string) => MiniDatabase;
};

let mockSqlite: MiniDatabase;

jest.mock('expo-sqlite', () => ({
  openDatabaseSync: () => ({
    execSync: (sql: string) => mockSqlite.exec(sql),
    withTransactionSync: (task: () => void) => {
      mockSqlite.exec('BEGIN');
      try {
        task();
        mockSqlite.exec('COMMIT');
      } catch (e) {
        mockSqlite.exec('ROLLBACK');
        throw e;
      }
    },
    runSync: (sql: string, ...params: unknown[]) => {
      const r = mockSqlite.prepare(sql).run(...(params as never[]));
      return { lastInsertRowId: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
    getAllSync: (sql: string, ...params: unknown[]) =>
      mockSqlite.prepare(sql).all(...(params as never[])),
    getFirstSync: (sql: string, ...params: unknown[]) =>
      mockSqlite.prepare(sql).get(...(params as never[])) ?? null,
  }),
}));

type Queue = typeof import('../sync-queue');
type Owner = typeof import('../owner');

function load(): { q: Queue; owner: Owner } {
  let q!: Queue;
  let owner!: Owner;
  // A fresh module per test: sync-queue caches its database handle, and each test opens a new one.
  jest.isolateModules(() => {
    q = jest.requireActual('../sync-queue');
    owner = jest.requireActual('../owner');
  });
  return { q, owner };
}

const ownerOf = (id: number): unknown =>
  (
    mockSqlite.prepare('SELECT owner_user_id FROM sync_queue WHERE id = ?').get(id) as {
      owner_user_id: unknown;
    }
  ).owner_user_id;

beforeEach(() => {
  mockSqlite = new DatabaseSync(':memory:');
});

describe("sync_queue — one user's items are sent only while that user is signed in", () => {
  it('records the signed-in user on every item it queues', () => {
    const { q, owner } = load();
    q.initSyncQueue();
    owner.setOwner('user-a');
    const id = q.enqueue('site_report', 'r-1', 'CREATE', { a: 1 });
    expect(ownerOf(id)).toBe('user-a');
  });

  it("fetches, counts and measures the signed-in user's items only", () => {
    const { q, owner } = load();
    q.initSyncQueue();
    owner.setOwner('user-a');
    q.enqueue('site_report', 'a-1', 'CREATE', {});
    q.enqueue('issue', 'a-2', 'CREATE', {});
    owner.setOwner('user-b');
    q.enqueue('site_report', 'b-1', 'CREATE', {});

    expect(q.fetchPending().map((i) => i.entity_id)).toEqual(['b-1']);
    expect(q.countPending()).toBe(1);
    expect(q.getQueueDepth().PENDING).toBe(1);

    owner.setOwner('user-a');
    expect(
      q
        .fetchPending()
        .map((i) => i.entity_id)
        .sort(),
    ).toEqual(['a-1', 'a-2']);
    expect(q.countPending()).toBe(2);
  });

  it('sends nothing, and counts nothing, while nobody is signed in', () => {
    const { q, owner } = load();
    q.initSyncQueue();
    owner.setOwner('user-a');
    q.enqueue('site_report', 'a-1', 'CREATE', {});
    owner.setOwner(null);
    expect(q.fetchPending()).toEqual([]);
    expect(q.countPending()).toBe(0);
    expect(q.getQueueDepth()).toEqual({ PENDING: 0, SYNCING: 0, SYNCED: 0, FAILED: 0 });
  });

  it("requeues and un-strands the signed-in user's rows only", () => {
    const { q, owner } = load();
    q.initSyncQueue();
    owner.setOwner('user-a');
    const aFailed = q.enqueue('site_report', 'a-1', 'CREATE', {});
    const aStuck = q.enqueue('site_report', 'a-2', 'CREATE', {});
    owner.setOwner('user-b');
    const bFailed = q.enqueue('site_report', 'b-1', 'CREATE', {});
    const bStuck = q.enqueue('site_report', 'b-2', 'CREATE', {});
    for (const id of [aFailed, bFailed]) q.markFailed(id, 'boom');
    for (const id of [aStuck, bStuck]) q.markSyncing(id);

    q.requeueFailed();
    q.resetStale();

    const status = (id: number): unknown =>
      (
        mockSqlite.prepare('SELECT status FROM sync_queue WHERE id = ?').get(id) as {
          status: unknown;
        }
      ).status;
    expect([status(bFailed), status(bStuck)]).toEqual(['PENDING', 'PENDING']);
    expect([status(aFailed), status(aStuck)]).toEqual(['FAILED', 'SYNCING']); // A's wait for A
  });
});

describe('sync_queue — an existing device', () => {
  it('marks the rows that predate owners, and gives exactly those to the first user to sign in, once', () => {
    mockSqlite.exec(`CREATE TABLE sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
      operation TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING',
      retry_count INTEGER NOT NULL DEFAULT 0, client_submitted_at TEXT NOT NULL,
      last_attempt_at TEXT, error_message TEXT)`);
    mockSqlite.exec(`INSERT INTO sync_queue (entity_type, entity_id, operation, payload, client_submitted_at)
                 VALUES ('site_report', 'old-1', 'CREATE', '{}', '2026-11-01T00:00:00Z')`);
    const { q, owner } = load();
    q.initSyncQueue();
    q.initSyncQueue(); // idempotent
    expect(ownerOf(1)).toBe(owner.LEGACY_OWNER);

    owner.setOwner('user-a');
    q.claimUnownedQueueItems('user-a');
    expect(ownerOf(1)).toBe('user-a');
    expect(q.fetchPending().map((i) => i.entity_id)).toEqual(['old-1']);

    // Claimed once: a later user does not take them.
    q.claimUnownedQueueItems('user-b');
    expect(ownerOf(1)).toBe('user-a');
  });

  // /doubt cycle 2: the ALTER and the legacy marking are one transaction — if the marking fails, the column is not
  // added either, so the next launch tries again instead of leaving the old rows unmarked (never claimed or sent).
  it('adds the column and marks the old rows together, or neither', () => {
    mockSqlite.exec(`CREATE TABLE sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
      operation TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING',
      retry_count INTEGER NOT NULL DEFAULT 0, client_submitted_at TEXT NOT NULL,
      last_attempt_at TEXT, error_message TEXT)`);
    // Fail the marking UPDATE once (a process killed at that point).
    const realPrepare = mockSqlite.prepare.bind(mockSqlite);
    mockSqlite.prepare = (sql: string) => {
      if (/^UPDATE sync_queue SET owner_user_id = \?$/.test(sql.trim())) throw new Error('killed');
      return realPrepare(sql);
    };
    const { q } = load();
    expect(() => q.initSyncQueue()).toThrow('killed');
    mockSqlite.prepare = realPrepare;
    const cols = mockSqlite.prepare('PRAGMA table_info(sync_queue)').all() as Array<{
      name: string;
    }>;
    expect(cols.map((c) => c.name)).not.toContain('owner_user_id');
  });

  // /doubt on this branch: the claim used to take EVERY ownerless row on EVERY sign-in, so a row queued with
  // no owner after its user signed out (a request that failed late) went out as the next user.
  it('never gives a row queued with no owner to anyone, and never sends it', () => {
    const { q, owner } = load();
    q.initSyncQueue();
    owner.setOwner(null);
    const orphan = q.enqueue('site_report', 'late-1', 'CREATE', {}); // signed out by the time it failed
    expect(ownerOf(orphan)).toBeNull();
    owner.setOwner('user-b');
    q.claimUnownedQueueItems('user-b');
    expect(ownerOf(orphan)).toBeNull();
    expect(q.fetchPending()).toEqual([]);
  });

  it('queues under an explicit owner when one is given (the user who made the request)', () => {
    const { q, owner } = load();
    q.initSyncQueue();
    owner.setOwner('user-b');
    const id = q.enqueue('site_report', 'a-late', 'CREATE', {}, 'user-a');
    expect(ownerOf(id)).toBe('user-a');
    expect(q.fetchPending()).toEqual([]);
  });
});
