const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadSource, database } = require('./helpers/database.cjs');

const { migrate } = loadSource('src/database/migrations.ts');
const { loadOverviewCalendar } = loadSource('src/database/overview.ts');
const { saveJournalEntry } = loadSource('src/database/journal.ts');
const { saveTodo } = loadSource('src/database/todos.ts');
const { addDaysToKey, fromDateKey } = loadSource('src/lib/dates.ts');

test('overview calendar aggregates finance, food, water, tasks, workouts, activities and fasting by local date', async () => {
  const { native, db } = database();
  const date = '2026-10-04';
  const start = fromDateKey(date).getTime();
  const nextDay = fromDateKey(addDaysToKey(date, 1)).getTime();
  const originalNow = Date.now;
  Date.now = () => start + 10 * 60 * 60 * 1000;

  try {
    await migrate(db);
    await db.runAsync(
      `INSERT INTO accounts
       (id, name, type, currency, opening_balance_minor, created_at, updated_at)
       VALUES ('wallet', 'Cash', 'cash', 'PHP', 0, ?, ?)`,
      start,
      start,
    );
    await db.runAsync(
      `INSERT INTO transactions
       (id, type, amount_minor, account_id, occurred_at, description, created_at, updated_at)
       VALUES ('expense', 'expense', 50000, 'wallet', ?, 'Lunch', ?, ?)`,
      start + 9 * 60 * 60 * 1000,
      start,
      start,
    );
    await db.runAsync(
      `INSERT INTO meals (id, meal_type, name, eaten_at, created_at, updated_at)
       VALUES ('meal', 'lunch', 'Salad', ?, ?, ?)`,
      start + 10 * 60 * 60 * 1000,
      start,
      start,
    );
    await db.runAsync(
      'INSERT INTO water_entries (id, amount_ml, logged_at, created_at) VALUES (?, ?, ?, ?)',
      'water',
      250,
      start + 11 * 60 * 60 * 1000,
      start,
    );
    await saveTodo(db, {
      title: 'Plan week',
      priority: 'medium',
      category: 'Personal',
      dueDate: date,
      startTime: null,
      allDay: true,
    });
    await db.runAsync(
      `INSERT INTO workout_logs
       (id, exercise_id, exercise_name, muscle_group, log_date, sets, reps, created_at)
       VALUES ('workout', 'squat', 'Squat', 'Legs', ?, 3, 10, ?)`,
      date,
      start + 8 * 60 * 60 * 1000,
    );
    await db.runAsync(
      `INSERT INTO activities
       (id, type, log_date, started_at, duration_s, distance_m, calories, route, created_at)
       VALUES ('run', 'run', ?, ?, 1800, 5000, 300, '[]', ?)`,
      date,
      start + 7 * 60 * 60 * 1000,
      start,
    );
    await db.runAsync(
      `INSERT INTO fasting_sessions
       (id, protocol_id, protocol_name, kind, target_minutes, started_at, ended_at, created_at, state)
       VALUES ('fast', '16:8', '16:8', 'fast', 960, ?, ?, ?, 'completed')`,
      start + 6 * 60 * 60 * 1000,
      start + 7 * 60 * 60 * 1000,
      start,
    );
    await db.runAsync(
      `INSERT INTO water_entries (id, amount_ml, logged_at, created_at) VALUES ('tomorrow', 250, ?, ?)`,
      nextDay,
      nextDay,
    );
    await saveJournalEntry(
      db,
      date,
      { body: 'A good day', mood: 'good', tags: [], photos: [], favorite: false },
      start + 12 * 60 * 60 * 1000,
    );

    const overview = await loadOverviewCalendar(db, date, date, nextDay);
    assert.equal(overview.activities.length, 8);
    assert.equal(overview.monthCounts[date], 8);
    assert.deepEqual(
      [...new Set(overview.activities.map((item) => item.type))].sort(),
      ['activity', 'expense', 'fast', 'journal', 'meal', 'task', 'water', 'workout'],
    );
    assert.ok(overview.activities.some((item) => item.title === 'Lunch' && item.detail.includes('Cash')));
    assert.ok(overview.activities.some((item) => item.title === 'Plan week'));
    assert.ok(overview.activities.some((item) => item.title === 'Journal entry' && item.detail.includes('Good')));
    assert.equal(overview.monthCounts[addDaysToKey(date, 1)], undefined);
  } finally {
    Date.now = originalNow;
    native.close();
  }
});
