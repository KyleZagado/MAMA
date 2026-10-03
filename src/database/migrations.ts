import type { SQLiteDatabase } from 'expo-sqlite';

const DATABASE_VERSION = 15;

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

  if (version < 7) {
    await db.execAsync(`
    CREATE TABLE IF NOT EXISTS bills (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      amount_minor INTEGER NOT NULL,
      due_date TEXT NOT NULL,
      paid_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_bills_due_date ON bills(due_date);
  `);
  }

  if (version < 8) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
        ALTER TABLE transactions ADD COLUMN subcategory TEXT;
        ALTER TABLE transactions ADD COLUMN merchant TEXT;
        ALTER TABLE transactions ADD COLUMN location TEXT;
        ALTER TABLE transactions ADD COLUMN payment_method TEXT;
        ALTER TABLE transactions ADD COLUMN tags TEXT;
        PRAGMA user_version = 8;
      `);
    });
  }

  if (version < 9) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS income_schedules (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
          account_id TEXT NOT NULL REFERENCES accounts(id),
          category_id TEXT NOT NULL,
          frequency TEXT NOT NULL,
          start_date TEXT NOT NULL,
          month_days TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          deleted_at INTEGER
        );
        CREATE TABLE IF NOT EXISTS income_receipts (
          schedule_id TEXT NOT NULL REFERENCES income_schedules(id),
          due_date TEXT NOT NULL,
          transaction_id TEXT NOT NULL UNIQUE REFERENCES transactions(id),
          PRIMARY KEY (schedule_id, due_date)
        );
        PRAGMA user_version = 9;
      `);
    });
  }

  if (version < 10) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
        ALTER TABLE tasks ADD COLUMN due_time TEXT;
        ALTER TABLE tasks ADD COLUMN end_time TEXT;
        ALTER TABLE tasks ADD COLUMN all_day INTEGER NOT NULL DEFAULT 1;
        ALTER TABLE tasks ADD COLUMN subtasks TEXT NOT NULL DEFAULT '[]';
        ALTER TABLE tasks ADD COLUMN photos TEXT NOT NULL DEFAULT '[]';
        ALTER TABLE tasks ADD COLUMN links TEXT NOT NULL DEFAULT '[]';
        ALTER TABLE tasks ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';
        ALTER TABLE tasks ADD COLUMN color TEXT;
        ALTER TABLE tasks ADD COLUMN location TEXT;
        ALTER TABLE tasks ADD COLUMN estimated_minutes INTEGER;
        ALTER TABLE tasks ADD COLUMN actual_minutes INTEGER;
        ALTER TABLE tasks ADD COLUMN archived_at INTEGER;
        ALTER TABLE tasks ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
        UPDATE tasks SET all_day = 0 WHERE start_time IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_tasks_date ON tasks(due_date, sort_order);
        CREATE TABLE IF NOT EXISTS task_undo (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          label TEXT NOT NULL,
          before_rows TEXT NOT NULL,
          after_rows TEXT NOT NULL
        );
        PRAGMA user_version = 10;
      `);
    });
  }

  if (version < 11) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
        ALTER TABLE tasks ADD COLUMN recurrence_rule TEXT;
        ALTER TABLE tasks ADD COLUMN series_id TEXT;
        ALTER TABLE tasks ADD COLUMN occurrence_date TEXT;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_task_occurrence ON tasks(series_id, occurrence_date);
        UPDATE task_undo SET
          before_rows = (SELECT json_group_array(json_set(value,
            '$.recurrence_rule', NULL, '$.series_id', NULL, '$.occurrence_date', NULL)) FROM json_each(before_rows)),
          after_rows = (SELECT json_group_array(json_set(value,
            '$.recurrence_rule', NULL, '$.series_id', NULL, '$.occurrence_date', NULL)) FROM json_each(after_rows));
        PRAGMA user_version = 11;
      `);
    });
  }

  if (version < 12) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
        ALTER TABLE tasks ADD COLUMN scheduled INTEGER NOT NULL DEFAULT 1;
        ALTER TABLE tasks ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE tasks ADD COLUMN list_name TEXT;
        ALTER TABLE tasks ADD COLUMN project TEXT;
        CREATE TABLE task_lists (name TEXT PRIMARY KEY NOT NULL);
        UPDATE task_undo SET
          before_rows = (SELECT json_group_array(json_set(value,
            '$.scheduled', 1, '$.favorite', 0, '$.list_name', NULL, '$.project', NULL)) FROM json_each(before_rows)),
          after_rows = (SELECT json_group_array(json_set(value,
            '$.scheduled', 1, '$.favorite', 0, '$.list_name', NULL, '$.project', NULL)) FROM json_each(after_rows));
        PRAGMA user_version = 12;
      `);
    });
  }

  if (version < 13) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS task_lists (name TEXT PRIMARY KEY NOT NULL);
        INSERT OR IGNORE INTO task_lists (name)
          SELECT DISTINCT list_name FROM tasks WHERE list_name IS NOT NULL AND trim(list_name) != '';
        PRAGMA user_version = 13;
      `);
    });
  }

  if (version < 14) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS fasting_sessions (
          id TEXT PRIMARY KEY NOT NULL,
          protocol_id TEXT NOT NULL,
          protocol_name TEXT NOT NULL,
          kind TEXT NOT NULL CHECK (kind IN ('fast', 'five_two')),
          target_minutes INTEGER,
          started_at INTEGER NOT NULL,
          ended_at INTEGER,
          created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_fasting_sessions_started
          ON fasting_sessions(started_at DESC);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_fasting_active
          ON fasting_sessions(kind) WHERE ended_at IS NULL;
        PRAGMA user_version = 14;
      `);
    });
  }

  if (version < 15) {
    const fastingColumns = new Set(
      (await db.getAllAsync<{ name: string }>('PRAGMA table_info(fasting_sessions)')).map(
        (column) => column.name,
      ),
    );
    const migration: string[] = [];
    if (!fastingColumns.has('state')) {
      migration.push(`
        ALTER TABLE fasting_sessions ADD COLUMN state TEXT NOT NULL DEFAULT 'active'
          CHECK (state IN ('active', 'paused', 'completed', 'cancelled'))
      `);
      migration.push(`
        UPDATE fasting_sessions
        SET state = CASE WHEN ended_at IS NULL THEN 'active' ELSE 'completed' END
      `);
    }
    if (!fastingColumns.has('paused_at')) {
      migration.push('ALTER TABLE fasting_sessions ADD COLUMN paused_at INTEGER');
    }
    if (!fastingColumns.has('paused_duration_ms')) {
      migration.push(
        'ALTER TABLE fasting_sessions ADD COLUMN paused_duration_ms INTEGER NOT NULL DEFAULT 0',
      );
    }
    if (!fastingColumns.has('planned_end_at')) {
      migration.push('ALTER TABLE fasting_sessions ADD COLUMN planned_end_at INTEGER');
      migration.push(`
        UPDATE fasting_sessions
        SET planned_end_at = CASE
          WHEN target_minutes IS NOT NULL THEN started_at + target_minutes * 60000
          ELSE NULL
        END
      `);
    }
    migration.push('PRAGMA user_version = 15');
    await db.withTransactionAsync(async () => {
      await db.execAsync(migration.join(';'));
    });
  }

  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}
