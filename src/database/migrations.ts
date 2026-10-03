import type { SQLiteDatabase } from 'expo-sqlite';

const DATABASE_VERSION = 3;

export async function migrate(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = row?.user_version ?? 0;
  if (version >= DATABASE_VERSION) return;

  if (version < 1) {
    await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      currency TEXT NOT NULL,
      opening_balance_minor INTEGER NOT NULL DEFAULT 0,
      details TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY NOT NULL,
      type TEXT NOT NULL,
      amount_minor INTEGER NOT NULL,
      account_id TEXT NOT NULL REFERENCES accounts(id),
      to_account_id TEXT REFERENCES accounts(id),
      category_id TEXT,
      occurred_at INTEGER NOT NULL,
      description TEXT,
      notes TEXT,
      attachment_uri TEXT,
      recurrence_rule TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_transactions_occurred ON transactions(occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `);
  }

  if (version < 2) {
    await db.execAsync(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'todo',
      priority TEXT NOT NULL DEFAULT 'medium',
      category TEXT,
      due_date TEXT NOT NULL,
      start_time TEXT,
      completed_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);
  `);
  }

  if (version < 3) {
    await db.execAsync(`
    CREATE TABLE IF NOT EXISTS meals (
      id TEXT PRIMARY KEY NOT NULL,
      meal_type TEXT NOT NULL,
      name TEXT NOT NULL,
      notes TEXT,
      photo TEXT,
      eaten_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_meals_eaten ON meals(eaten_at);
    CREATE TABLE IF NOT EXISTS water_entries (
      id TEXT PRIMARY KEY NOT NULL,
      amount_ml INTEGER NOT NULL,
      logged_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      deleted_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_water_logged ON water_entries(logged_at);
  `);
  }

  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}
