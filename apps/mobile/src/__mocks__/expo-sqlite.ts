export const mockDb = {
  execSync: jest.fn(),
  runSync: jest.fn().mockReturnValue({ lastInsertRowId: 1, changes: 1 }),
  getAllSync: jest.fn().mockReturnValue([]),
};

export const openDatabaseSync = jest.fn().mockReturnValue(mockDb);
export const SQLiteDatabase = class {};
