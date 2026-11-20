// photoRepo's owner filter against a real SQLite: drizzle's sqlite-proxy driver runs the queries it builds on
// node:sqlite in memory, standing in for expo-sqlite (fix/mobile-queue-per-user).

interface MiniStatement {
  all(...params: unknown[]): unknown[];
  run(...params: unknown[]): unknown;
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

jest.mock('../database', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { drizzle } = require('drizzle-orm/sqlite-proxy');
  return {
    db: drizzle(async (sql: string, params: unknown[], method: string) => {
      const stmt = mockSqlite.prepare(sql);
      if (method === 'run') {
        stmt.run(...params);
        return { rows: [] };
      }
      // The proxy maps rows from arrays of column values.
      const rows = stmt.all(...params).map((r) => Object.values(r as Record<string, unknown>));
      return { rows: method === 'get' ? rows[0] : rows };
    }),
  };
});

import { photoRepo, claimUnownedPhotos } from '../photoRepo';
import { setOwner, LEGACY_OWNER } from '../owner';

const insert = (id: string, owner: string | null, status = 'PENDING'): void => {
  mockSqlite
    .prepare(
      `INSERT INTO local_photos (id, photo_id, entity_type, entity_id, local_path, upload_status, owner_user_id)
       VALUES (?, '', 'issue', 'e-1', ?, ?, ?)`,
    )
    .run(id, `file:///${id}.jpg`, status, owner);
};

beforeEach(() => {
  mockSqlite = new DatabaseSync(':memory:');
  mockSqlite.exec(`CREATE TABLE local_photos (
    id TEXT PRIMARY KEY NOT NULL, photo_id TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
    local_path TEXT NOT NULL, upload_status TEXT NOT NULL, server_file_id TEXT, upload_retry_count INTEGER,
    owner_user_id TEXT)`);
});

describe("photoRepo — a user's pending photos are uploaded only while that user is signed in", () => {
  it("returns the signed-in user's pending photos only", async () => {
    insert('a-1', 'user-a');
    insert('a-2', 'user-a', 'UPLOADED');
    insert('b-1', 'user-b');
    setOwner('user-a');
    expect((await photoRepo.getPendingPhotos()).map((p) => p.localId)).toEqual(['a-1']);
    setOwner('user-b');
    expect((await photoRepo.getPendingPhotos()).map((p) => p.localId)).toEqual(['b-1']);
  });

  it('returns nothing while nobody is signed in', async () => {
    insert('a-1', 'user-a');
    setOwner(null);
    expect(await photoRepo.getPendingPhotos()).toEqual([]);
  });

  it('gives photos marked at migration to the first user to sign in, once — and never an ownerless one', async () => {
    insert('old-1', LEGACY_OWNER);
    insert('orphan-1', null);
    await claimUnownedPhotos('user-a');
    await claimUnownedPhotos('user-b');
    setOwner('user-a');
    expect((await photoRepo.getPendingPhotos()).map((p) => p.localId)).toEqual(['old-1']);
    setOwner('user-b');
    expect(await photoRepo.getPendingPhotos()).toEqual([]);
  });

  it("carries each photo's owner, for the annotation its upload queues", async () => {
    insert('a-1', 'user-a');
    setOwner('user-a');
    expect((await photoRepo.getPendingPhotos())[0]!.ownerUserId).toBe('user-a');
  });
});
