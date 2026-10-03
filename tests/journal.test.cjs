const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadSource, database } = require('./helpers/database.cjs');

const { migrate } = loadSource('src/database/migrations.ts');
const {
  filterJournalEntries,
  getJournalStreak,
  listJournalEntries,
  loadJournalPreferences,
  saveJournalEntry,
  saveJournalPreferences,
} = loadSource('src/database/journal.ts');

const draft = (overrides = {}) => ({
  body: '',
  mood: null,
  tags: [],
  photos: [],
  favorite: false,
  ...overrides,
});

test('journal migration is repeatable and initializes daily reminder preferences', async () => {
  const { native, db } = database();
  try {
    await migrate(db);
    await migrate(db);
    assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 16);
    assert.deepEqual({ ...(await loadJournalPreferences(db)) }, {
      reminder_enabled: 0,
      reminder_time: '20:00',
    });
  } finally {
    native.close();
  }
});

test('journal entries update once per day and preserve their automatic creation time', async () => {
  const { native, db } = database();
  try {
    await migrate(db);
    const first = await saveJournalEntry(
      db,
      '2026-10-04',
      draft({
        body: 'A lovely day with family',
        mood: 'good',
        tags: ['Family', ' family ', 'Sunday'],
        photos: ['memory.jpg'],
        favorite: true,
      }),
      1000,
    );
    assert.deepEqual(first.tags, ['Family', 'Sunday']);
    assert.deepEqual(first.photos, ['memory.jpg']);
    const updated = await saveJournalEntry(
      db,
      '2026-10-04',
      draft({ body: 'A lovely day with family and friends', mood: 'great', favorite: true }),
      2000,
    );
    const photoOnly = await saveJournalEntry(
      db,
      '2026-10-05',
      draft({ photos: ['photo-only.jpg'] }),
      3000,
    );
    const entries = await listJournalEntries(db);

    assert.equal(entries.length, 2);
    assert.equal(updated.id, first.id);
    assert.equal(updated.created_at, 1000);
    assert.equal(updated.updated_at, 2000);
    assert.equal(updated.body, 'A lovely day with family and friends');
    assert.deepEqual(updated.tags, []);
    assert.deepEqual(updated.photos, []);
    assert.equal(photoOnly.body, '');
    assert.deepEqual(photoOnly.photos, ['photo-only.jpg']);
  } finally {
    native.close();
  }
});

test('journal filters search phrases, mood, tag, selected date and favorites together', async () => {
  const { native, db } = database();
  try {
    await migrate(db);
    await saveJournalEntry(
      db,
      '2026-10-03',
      draft({ body: 'A quiet trip to the coast', mood: 'good', tags: ['Travel'], favorite: true }),
      1000,
    );
    await saveJournalEntry(
      db,
      '2026-10-04',
      draft({ body: 'A busy day at work', mood: 'okay', tags: ['Work'] }),
      2000,
    );
    const entries = await listJournalEntries(db);

    assert.equal(filterJournalEntries(entries, { query: 'TRIP to the coast' }).length, 1);
    assert.equal(filterJournalEntries(entries, { mood: 'okay' })[0].entry_date, '2026-10-04');
    assert.equal(filterJournalEntries(entries, { tag: 'travel' })[0].entry_date, '2026-10-03');
    assert.equal(filterJournalEntries(entries, { date: '2026-10-04' }).length, 1);
    assert.equal(
      filterJournalEntries(entries, {
        favoritesOnly: true,
        query: 'coast',
        mood: 'good',
        tag: 'Travel',
        date: '2026-10-03',
      }).length,
      1,
    );
  } finally {
    native.close();
  }
});

test('journal streak uses today or yesterday and stops at the first gap', () => {
  const entries = ['2026-10-04', '2026-10-03', '2026-10-02', '2026-09-30'].map(
    (entry_date) => ({ entry_date }),
  );
  assert.equal(getJournalStreak(entries, '2026-10-04'), 3);
  assert.equal(getJournalStreak(entries, '2026-10-05'), 3);
  assert.equal(getJournalStreak(entries, '2026-10-06'), 0);
});

test('journal validates dates, photo count and reminder time', async () => {
  const { native, db } = database();
  try {
    await migrate(db);
    await assert.rejects(saveJournalEntry(db, '2026-02-30', draft(), 1000), /valid calendar date/);
    await assert.rejects(
      saveJournalEntry(db, '2026-10-04', draft({ photos: ['1', '2', '3', '4', '5', '6'] }), 1000),
      /up to five photos/,
    );
    await assert.rejects(saveJournalPreferences(db, true, '25:00'), /HH:MM/);
    await saveJournalPreferences(db, true, '07:30');
    assert.deepEqual({ ...(await loadJournalPreferences(db)) }, {
      reminder_enabled: 1,
      reminder_time: '07:30',
    });
  } finally {
    native.close();
  }
});

test('version 15 databases receive journal tables without changing existing rows', async () => {
  const { native, db } = database();
  try {
    await migrate(db);
    await db.runAsync(
      `INSERT INTO fasting_sessions
       (id, protocol_id, protocol_name, kind, target_minutes, started_at, created_at, state)
       VALUES ('existing-fast', '16:8', '16:8', 'fast', 960, 1000, 1000, 'active')`,
    );
    native.exec(`
      DROP TABLE journal_preferences;
      DROP TABLE journal_entries;
      PRAGMA user_version = 15;
    `);
    await migrate(db);
    assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 16);
    assert.equal((await db.getFirstAsync('SELECT id FROM fasting_sessions')).id, 'existing-fast');
    assert.deepEqual({ ...(await loadJournalPreferences(db)) }, {
      reminder_enabled: 0,
      reminder_time: '20:00',
    });
  } finally {
    native.close();
  }
});
