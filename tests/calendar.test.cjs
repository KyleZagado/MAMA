const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadSource, database, removeTaskV11Schema } = require('./helpers/database.cjs');

const { migrate } = loadSource('src/database/migrations.ts');
const {
  saveTodo, getTodo, listTodos, listCalendarTodos, listOverdueCalendarTodos, saveCalendarTodo, setTodoDone,
  changeTodos, undoTaskAction, getTaskUndo,
} = loadSource('src/database/todos.ts');
const {
  taskRepeatDates, decodeTaskRepeat, calendarRange, shiftCalendar,
  movedTaskTimes, resizedTaskEnd, clockAt, minutesOf,
} = loadSource('src/lib/task-calendar.ts');
const { toDateKey, addDaysToKey } = loadSource('src/lib/dates.ts');

const input = { title: 'Gym', priority: 'high', category: 'Health',
  dueDate: '2026-10-03', startTime: '09:00', endTime: '10:00', dueTime: '10:00', allDay: false,
  recurrenceRule: JSON.stringify({ frequency: 'daily', weekdays: [] }),
  subtasks: [{ id: 'warmup', title: 'Warm up', done: false }], photos: ['gym.jpg'], notes: 'Bring water' };

test('all six calendar ranges and swipes use local dates across month/year boundaries', () => {
  assert.deepEqual(calendarRange('2026-10-03', 'month'), { from: '2026-09-27', through: '2026-11-07' });
  assert.deepEqual(calendarRange('2026-10-03', 'week'), { from: '2026-09-27', through: '2026-10-03' });
  assert.deepEqual(calendarRange('2026-10-03', 'day'), { from: '2026-10-03', through: '2026-10-03' });
  assert.deepEqual(calendarRange('2026-10-03', 'timeline'), { from: '2026-10-03', through: '2026-10-03' });
  assert.deepEqual(calendarRange('2026-10-03', 'agenda'), { from: '2026-10-03', through: '2026-11-02' });
  assert.deepEqual(calendarRange('2026-10-03', 'year'), { from: '2026-01-01', through: '2026-12-31' });
  assert.equal(shiftCalendar('2026-01-31', 'month', 1), '2026-02-28');
  assert.equal(shiftCalendar('2024-02-29', 'year', 1), '2025-02-28');
  assert.equal(shiftCalendar('2026-12-31', 'day', 1), '2027-01-01');
  assert.equal(shiftCalendar('2026-12-31', 'week', 1), '2027-01-07');
});

test('daily, selected-weekday and monthly recurrence handle short months and DST', () => {
  assert.deepEqual(taskRepeatDates('2026-10-03', { frequency: 'daily', weekdays: [] },
    '2026-10-01', '2026-10-05'), ['2026-10-03', '2026-10-04', '2026-10-05']);
  assert.deepEqual(taskRepeatDates('2025-03-01', { frequency: 'weekly', weekdays: [0, 2] },
    '2025-03-08', '2025-03-18'), ['2025-03-09', '2025-03-11', '2025-03-16', '2025-03-18']);
  assert.deepEqual(taskRepeatDates('2024-01-31', { frequency: 'monthly', weekdays: [] },
    '2024-01-01', '2024-04-30'), ['2024-01-31', '2024-02-29', '2024-03-31', '2024-04-30']);
  assert.deepEqual(taskRepeatDates('2025-01-31', { frequency: 'monthly', weekdays: [] },
    '2025-02-01', '2025-03-31'), ['2025-02-28', '2025-03-31']);
  for (const rule of [
    { frequency: 'weekly', weekdays: [] }, { frequency: 'daily', weekdays: [7] },
    { frequency: 'yearly', weekdays: [] }, { frequency: 'weekly', weekdays: ['1'] },
  ]) assert.throws(() => decodeTaskRepeat(JSON.stringify(rule)), /valid repeat/);
});

test('time dragging preserves duration and shifts deadline; resizing snaps and clamps within day', () => {
  assert.deepEqual(movedTaskTimes('09:00', '10:00', '11:00', '14:00'),
    { startTime: '14:00', endTime: '15:00', dueTime: '16:00', allDay: false });
  assert.deepEqual(movedTaskTimes(null, null, null, '09:00'),
    { startTime: '09:00', endTime: '09:30', dueTime: '09:30', allDay: false });
  assert.equal(resizedTaskEnd('09:00', '10:00', 36, 1.2), '10:30');
  assert.equal(resizedTaskEnd('09:00', '10:00', -300, 1.2), '09:15');
  assert.equal(resizedTaskEnd('23:50', null, 300, 1.2), '23:59');
  assert.equal(minutesOf('14:15'), 855);
  assert.equal(clockAt(855), '14:15');
  assert.throws(() => movedTaskTimes('09:00', '11:00', null, '23:00'), /beyond/);
  assert.throws(() => movedTaskTimes('09:00', '10:00', '23:00', '14:00'), /due time/);
});

test('one recurring occurrence can complete, move date/time and resize without changing its series', async () => {
  const { native, db } = database();
  try {
    await migrate(db);
    const id = await saveTodo(db, input);
    const initial = await listCalendarTodos(db, '2026-10-03', '2026-10-05');
    assert.equal(initial.length, 3);
    const occurrence = initial[1];
    const overrideId = await saveCalendarTodo(db, occurrence, { status: 'done' });
    const afterDone = await listCalendarTodos(db, '2026-10-03', '2026-10-05');
    assert.equal(afterDone.length, 3);
    assert.equal(afterDone[1].status, 'done');
    assert.equal(afterDone[2].status, 'todo');
    const updated = afterDone[1];
    await saveCalendarTodo(db, updated, { dueDate: '2026-10-08',
      ...movedTaskTimes(updated.start_time, updated.end_time, updated.due_time, '14:00') });
    assert.equal((await listCalendarTodos(db, '2026-10-04', '2026-10-04')).length, 0);
    const moved = (await listCalendarTodos(db, '2026-10-08', '2026-10-08')).find((task) => task.id === overrideId);
    assert.equal(moved.start_time, '14:00');
    assert.equal(moved.end_time, '15:00');
    assert.equal(moved.status, 'done');
    assert.deepEqual(moved.photos, ['gym.jpg']);
    await saveCalendarTodo(db, moved, { endTime: '15:30', estimatedMinutes: 90 });
    assert.equal((await getTodo(db, overrideId)).end_time, '15:30');
    assert.equal((await getTodo(db, id)).start_time, '09:00');
    assert.equal((await getTodo(db, id)).due_date, '2026-10-03');
    await undoTaskAction(db);
    assert.equal((await getTodo(db, overrideId)).end_time, '15:00');
    await undoTaskAction(db);
    assert.equal((await listCalendarTodos(db, '2026-10-04', '2026-10-04'))[0].status, 'done');
    await undoTaskAction(db);
    const restored = (await listCalendarTodos(db, '2026-10-04', '2026-10-04'))[0];
    assert.equal(restored.virtual, true);
    assert.equal(restored.status, 'todo');
  } finally { native.close(); }
});

test('occurrence deletion/archive suppress only that date and undo restores it', async () => {
  const { native, db } = database();
  try {
    await migrate(db);
    const id = await saveTodo(db, input);
    const occurrence = (await listCalendarTodos(db, '2026-10-04', '2026-10-04'))[0];
    const overrideId = await saveCalendarTodo(db, occurrence, {});
    await changeTodos(db, [overrideId], { type: 'delete' });
    assert.equal((await listCalendarTodos(db, '2026-10-03', '2026-10-05')).length, 2);
    await undoTaskAction(db);
    assert.equal((await listCalendarTodos(db, '2026-10-03', '2026-10-05')).length, 3);
    await changeTodos(db, [overrideId], { type: 'archive', archived: true });
    assert.equal((await listCalendarTodos(db, '2026-10-03', '2026-10-05')).length, 2);
    await undoTaskAction(db);
    await changeTodos(db, [id], { type: 'archive', archived: true });
    assert.deepEqual(await listCalendarTodos(db, '2026-10-03', '2026-10-05'), []);
    await undoTaskAction(db);
    assert.equal((await listCalendarTodos(db, '2026-10-03', '2026-10-05')).length, 3);
  } finally { native.close(); }
});

test('home recurring completion uses occurrence IDs and duplicate/stale writes are rejected', async () => {
  const { native, db } = database();
  try {
    await migrate(db);
    const today = toDateKey(new Date());
    const id = await saveTodo(db, { ...input, dueDate: today });
    const home = (await listTodos(db)).find((task) => task.due_date === today);
    assert.equal(home.id, `${id}/${today}`);
    await setTodoDone(db, home.id, true);
    assert.equal((await listTodos(db)).find((task) => task.due_date === today).status, 'done');
    assert.equal((await listCalendarTodos(db, addDaysToKey(today, 1), addDaysToKey(today, 1)))[0].status, 'todo');
    const virtual = (await listCalendarTodos(db, addDaysToKey(today, 1), addDaysToKey(today, 1)))[0];
    await saveCalendarTodo(db, virtual, { title: 'First edit' });
    await assert.rejects(saveCalendarTodo(db, virtual, { title: 'Duplicate edit' }), /already edited/);
    const next = (await listCalendarTodos(db, addDaysToKey(today, 2), addDaysToKey(today, 2)))[0];
    await saveTodo(db, { ...input, dueDate: today, title: 'New series title' }, id);
    await assert.rejects(saveCalendarTodo(db, next, { title: 'Stale edit' }), /changed/);
  } finally { native.close(); }
});

test('one-off overdue tasks are not cut off while historical recurring expansion is bounded', async () => {
  const { native, db } = database();
  try {
    await migrate(db);
    await saveTodo(db, { ...input, title: 'Old one-off', dueDate: '2020-01-01', recurrenceRule: null });
    await saveTodo(db, { ...input, dueDate: '2020-01-01' });
    const past = await listOverdueCalendarTodos(db, '2026-10-03', '08:00');
    assert.equal(past.filter((task) => !task.repeating).length, 1);
    assert.equal(past.filter((task) => task.repeating).length, 30);
  } finally { native.close(); }
});

test('overdue includes passed deadlines today but excludes future times, done and all-day today', async () => {
  const { native, db } = database();
  try {
    await migrate(db);
    await saveTodo(db, { ...input, recurrenceRule: null, title: 'Passed deadline', dueTime: '10:00' });
    await saveTodo(db, { ...input, recurrenceRule: null, title: 'Later today', dueTime: '16:00' });
    await saveTodo(db, { ...input, recurrenceRule: null, title: 'All day', allDay: true });
    await saveTodo(db, { ...input, recurrenceRule: null, title: 'Done', status: 'done' });
    const tasks = await listOverdueCalendarTodos(db, '2026-10-03', '11:00');
    assert.deepEqual(tasks.map((task) => task.title), ['Passed deadline']);
  } finally { native.close(); }
});

test('version 10 upgrade preserves tasks and existing persistent undo history', async () => {
  const { native, db } = database();
  try {
    await migrate(db);
    const id = await saveTodo(db, { ...input, recurrenceRule: null });
    await changeTodos(db, [id], { type: 'status', status: 'done' });
    native.exec(`UPDATE task_undo SET
      before_rows = (SELECT json_group_array(json_remove(value, '$.recurrence_rule', '$.series_id', '$.occurrence_date')) FROM json_each(before_rows)),
      after_rows = (SELECT json_group_array(json_remove(value, '$.recurrence_rule', '$.series_id', '$.occurrence_date')) FROM json_each(after_rows))`);
    removeTaskV11Schema(native);
    native.exec('PRAGMA user_version = 10');
    await migrate(db);
    assert.equal((await getTodo(db, id)).status, 'done');
    assert.equal((await getTaskUndo(db)).label, 'Complete task');
    await undoTaskAction(db);
    assert.equal((await getTodo(db, id)).status, 'todo');
    await undoTaskAction(db);
    assert.equal(await getTodo(db, id), null);
  } finally { native.close(); }
});

test('stopping recurrence keeps saved exceptions without duplicating the anchor task', async () => {
  const { native, db } = database();
  try {
    await migrate(db);
    const today = toDateKey(new Date());
    const id = await saveTodo(db, { ...input, dueDate: today });
    const first = (await listCalendarTodos(db, today, today))[0];
    await saveCalendarTodo(db, first, { status: 'done' });
    await saveTodo(db, { ...input, dueDate: today, recurrenceRule: null }, id);
    const visible = await listCalendarTodos(db, today, addDaysToKey(today, 3));
    assert.equal(visible.length, 1);
    assert.equal(visible[0].status, 'done');
    assert.equal((await listTodos(db)).filter((task) => task.due_date === today).length, 1);
    await undoTaskAction(db);
    assert.equal((await listCalendarTodos(db, today, addDaysToKey(today, 3))).length, 4);
  } finally { native.close(); }
});
