import type { SQLiteDatabase } from 'expo-sqlite';

const DATABASE_VERSION = 6;

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

  if (version < 4) {
    await db.execAsync(`
    CREATE TABLE IF NOT EXISTS workout_logs (
      id TEXT PRIMARY KEY NOT NULL,
      exercise_id TEXT NOT NULL,
      exercise_name TEXT NOT NULL,
      muscle_group TEXT NOT NULL,
      log_date TEXT NOT NULL,
      sets INTEGER,
      reps INTEGER,
      weight_kg REAL,
      duration_min INTEGER,
      created_at INTEGER NOT NULL,
      deleted_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_workout_logs_date ON workout_logs(log_date);
  `);
  }

  if (version < 5) {
    await db.execAsync(`
    CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY NOT NULL,
      type TEXT NOT NULL,
      log_date TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      duration_s INTEGER NOT NULL,
      distance_m REAL NOT NULL,
      steps INTEGER,
      calories INTEGER NOT NULL,
      route TEXT,
      created_at INTEGER NOT NULL,
      deleted_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_activities_date ON activities(log_date);
  `);
  }

  if (version < 6) {
    await db.execAsync(`
    CREATE TABLE IF NOT EXISTS workout_schedules (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'workout',
      scheduled_date TEXT NOT NULL,
      start_time TEXT,
      duration_min INTEGER,
      recurrence_days TEXT,
      reminder_minutes INTEGER,
      status TEXT NOT NULL DEFAULT 'scheduled',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_workout_schedules_date ON workout_schedules(scheduled_date);
    CREATE TABLE IF NOT EXISTS workout_schedule_occurrences (
      schedule_id TEXT NOT NULL REFERENCES workout_schedules(id),
      original_date TEXT NOT NULL,
      scheduled_date TEXT NOT NULL,
      status TEXT NOT NULL,
      PRIMARY KEY (schedule_id, original_date)
    );
    CREATE INDEX IF NOT EXISTS idx_workout_schedule_occurrences_date
      ON workout_schedule_occurrences(scheduled_date);
  `);
  }

  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}
