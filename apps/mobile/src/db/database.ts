// WatermelonDB database singleton — Priority 0 Section F
// Uses SQLiteAdapter (backed by expo-sqlite ~15.x, WAL mode via JSI)
// Import this single instance wherever WatermelonDB access is needed.

import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { schema } from './schema';
import SiteReport from './models/SiteReport';
import Issue from './models/Issue';
import Photo from './models/Photo';

const adapter = new SQLiteAdapter({
  schema,
  dbName: 'cos_offline',
  jsi: true, // JSI enables WAL mode + synchronous reads
  onSetUpError: (error) => {
    // Database setup failed — DB may be corrupted; handled by caller
    console.error('[database] setup error', error);
  },
});

export const database = new Database({
  adapter,
  modelClasses: [SiteReport, Issue, Photo],
});

export { SiteReport, Issue, Photo };
