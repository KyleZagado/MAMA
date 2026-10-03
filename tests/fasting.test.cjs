const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadSource, database } = require('./helpers/database.cjs');

const { migrate } = loadSource('src/database/migrations.ts');
const {
  addFiveTwoCheckin,
  countFiveTwoCheckins,
  finishFast,
  getActiveFast,
  hasFiveTwoCheckin,
  listFastingSessions,
  startFast,
} = loadSource('src/database/fasting.ts');

test('fasting migration is repeatable and persists active sessions, completions and 5:2 days', async () => {
  const { native, db } = database();
  try {
    await migrate(db);
    await migrate(db);
    assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 14);

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
