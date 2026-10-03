import * as SQLite from 'expo-sqlite';

import { migrate } from './migrations';

const databases = new Map<string, Promise<SQLite.SQLiteDatabase>>();

// One database file per signed-in user so accounts never mix on a shared device.
export function getDatabase(userId: string) {
  let database = databases.get(userId);
  if (!database) {
    database = (async () => {
      const db = await SQLite.openDatabaseAsync(`mama-${userId}.db`);
      await migrate(db);
      return db;
    })();
    database.catch(() => databases.delete(userId));
    databases.set(userId, database);
  }
  return database;
}
