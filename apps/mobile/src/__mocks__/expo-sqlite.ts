export const mockDb = {
  execSync: jest.fn(),
  runSync: jest.fn().mockReturnValue({ lastInsertRowId: 1, changes: 1 }),
  getAllSync: jest.fn().mockReturnValue([]),
  // db/database.ts reads `PRAGMA user_version` through getFirstSync at import time to decide whether
  // to run its DDL. Returning 0 lets that run against the no-op execSync above, which is what the
  // render suites need — without it, importing any screen that reaches PhotoCapture throws.
  getFirstSync: jest.fn().mockReturnValue({ user_version: 0 }),
};

export const openDatabaseSync = jest.fn().mockReturnValue(mockDb);

// drizzle-orm/expo-sqlite's useLiveQuery subscribes to this on mount to re-run its query when the
// database changes. Returning an inert subscription keeps the hook (and every screen that renders a
// PhotoCapture gallery) mountable under test; nothing in these suites writes to SQLite, so there is
// no change to deliver.
export const addDatabaseChangeListener = jest.fn(() => ({ remove: jest.fn() }));
export const SQLiteDatabase = class {};
