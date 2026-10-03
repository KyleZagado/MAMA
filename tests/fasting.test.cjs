const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadSource, database } = require('./helpers/database.cjs');

const { migrate } = loadSource('src/database/migrations.ts');
const {
  addFiveTwoCheckin,
  adjustFastTarget,
  cancelFast,
  countFiveTwoCheckins,
  editCompletedFast,
  editFastPlannedEnd,
  editFastStart,
  finishFast,
  finishFastAt,
  getActiveFast,
  hasFiveTwoCheckin,
  listFastingSessions,
  pauseFast,
  resumeFast,
  startFast,
} = loadSource('src/database/fasting.ts');

test('fasting migration is repeatable and persists active sessions, completions and 5:2 days', async () => {
  const { native, db } = database();
  try {
    await migrate(db);
    await migrate(db);
    assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 15);

    const originalNow = Date.now;
    let now = new Date(2026, 9, 5, 8).getTime();
    Date.now = () => now;
    try {
      await startFast(db, '16:8', '16:8', 16 * 60);
      const active = await getActiveFast(db);
      assert.equal(active.protocol_id, '16:8');
      assert.equal(active.target_minutes, 960);
      assert.equal(active.ended_at, null);

      now += 16 * 60 * 60 * 1000;
      await finishFast(db, active.id);
      assert.equal(await getActiveFast(db), null);
      const completed = await listFastingSessions(db, 1);
      assert.equal(completed[0].ended_at, now);

      await addFiveTwoCheckin(db);
      const weekStart = new Date(2026, 9, 5).getTime();
      const weekEnd = new Date(2026, 9, 12).getTime();
      const dayStart = new Date(2026, 9, 6).getTime();
      const dayEnd = new Date(2026, 9, 7).getTime();
      assert.equal((await countFiveTwoCheckins(db, weekStart, weekEnd)).count, 1);
      assert.ok(await hasFiveTwoCheckin(db, dayStart, dayEnd));
    } finally {
      Date.now = originalNow;
    }
  } finally {
    native.close();
  }
});

test('database prevents starting a second fast before ending the first', async () => {
  const { native, db } = database();
  try {
    await migrate(db);
    await startFast(db, '14:10', '14:10', 14 * 60);
    await assert.rejects(startFast(db, '16:8', '16:8', 16 * 60));
  } finally {
    native.close();
  }
});

test('version 14 migration preserves fast history and derives its planned end time', async () => {
  const { native, db } = database();
  try {
    native.exec(`
      CREATE TABLE fasting_sessions (
        id TEXT PRIMARY KEY NOT NULL,
        protocol_id TEXT NOT NULL,
        protocol_name TEXT NOT NULL,
        kind TEXT NOT NULL,
        target_minutes INTEGER,
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        created_at INTEGER NOT NULL
      );
      INSERT INTO fasting_sessions VALUES
        ('previous', '16:8', '16:8', 'fast', 960, 1000, 2000, 1000);
      PRAGMA user_version = 14;
    `);
    await migrate(db);
    const [upgraded] = await listFastingSessions(db);
    assert.equal(upgraded.id, 'previous');
    assert.equal(upgraded.state, 'completed');
    assert.equal(upgraded.paused_duration_ms, 0);
    assert.equal(upgraded.planned_end_at, 1000 + 960 * 60_000);
    assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 15);
  } finally {
    native.close();
  }
});

test('pause, resume, extend, shorten and edit fast times persist accurate timer state', async () => {
  const { native, db } = database();
  const originalNow = Date.now;
  let now = new Date(2026, 9, 5, 8).getTime();
  Date.now = () => now;
  try {
    await migrate(db);
    await startFast(db, '16:8', '16:8', 16 * 60);
    const initial = await getActiveFast(db);
    assert.equal(initial.planned_end_at, now + 16 * 60 * 60_000);

    now += 30 * 60_000;
    await pauseFast(db, initial.id);
    assert.equal((await getActiveFast(db)).state, 'paused');
    now += 15 * 60_000;
    await resumeFast(db, initial.id);
    let active = await getActiveFast(db);
    assert.equal(active.paused_duration_ms, 15 * 60_000);
    assert.equal(active.planned_end_at, initial.planned_end_at + 15 * 60_000);

    await adjustFastTarget(db, initial.id, 30);
    active = await getActiveFast(db);
    assert.equal(active.target_minutes, 990);
    assert.equal(active.planned_end_at, initial.planned_end_at + 45 * 60_000);
    await adjustFastTarget(db, initial.id, -30);
    active = await getActiveFast(db);
    assert.equal(active.target_minutes, 960);
    assert.equal(active.planned_end_at, initial.planned_end_at + 15 * 60_000);
    await adjustFastTarget(db, initial.id, 30);
    active = await getActiveFast(db);
    assert.equal(active.target_minutes, 990);
    await editFastPlannedEnd(db, initial.id, active.planned_end_at + 15 * 60_000);
    active = await getActiveFast(db);
    assert.equal(active.target_minutes, 1005);

    await editFastStart(db, initial.id, initial.started_at - 60 * 60_000);
    active = await getActiveFast(db);
    assert.equal(active.started_at, initial.started_at - 60 * 60_000);
    assert.equal(active.planned_end_at, initial.planned_end_at + 60 * 60_000);
    await finishFastAt(db, initial.id, now);
    const completed = await listFastingSessions(db, 1);
    assert.equal(completed[0].state, 'completed');
    await editCompletedFast(db, initial.id, now - 90 * 60_000, now - 30 * 60_000);
    const edited = await listFastingSessions(db, 1);
    assert.equal(edited[0].started_at, now - 90 * 60_000);
    assert.equal(edited[0].ended_at, now - 30 * 60_000);
  } finally {
    Date.now = originalNow;
    native.close();
  }
});

test('a paused fast can be cancelled and is not treated as active', async () => {
  const { native, db } = database();
  const originalNow = Date.now;
  let now = new Date(2026, 9, 5, 8).getTime();
  Date.now = () => now;
  try {
    await migrate(db);
    await startFast(db, '14:10', '14:10', 14 * 60);
    const active = await getActiveFast(db);
    await pauseFast(db, active.id);
    now += 5 * 60_000;
    await cancelFast(db, active.id);
    assert.equal(await getActiveFast(db), null);
    const [cancelled] = await listFastingSessions(db);
    assert.equal(cancelled.state, 'cancelled');
    assert.equal(cancelled.paused_duration_ms, 5 * 60_000);
  } finally {
    Date.now = originalNow;
    native.close();
  }
});
