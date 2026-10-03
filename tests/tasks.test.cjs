const assert = require('node:assert/strict');
const { test } = require('node:test');
const { existsSync, mkdtempSync, rmSync, rmdirSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { loadSource, database, removeTaskV10Schema } = require('./helpers/database.cjs');

const { migrate } = loadSource('src/database/migrations.ts');
const {
  addTodo, saveTodo, getTodo, listTodos, changeTodos, setTodoDone,
  deleteTodo, duplicateTodo, reorderTodos, getTaskUndo, undoTaskAction,
} = loadSource('src/database/todos.ts');
const { findTaskDropTarget, taskDropOrder } = loadSource('src/lib/task-drag.ts');

const basic = { title: 'Plan the week', priority: 'medium', category: 'Personal',
  dueDate: '2026-10-03', startTime: null };
const detailed = { ...basic, title: 'Project review', notes: 'Bring the report', status: 'in_progress',
  dueTime: '17:00', startTime: '09:00', endTime: '10:30', allDay: false,
  subtasks: [{ id: 'check-1', title: 'Prepare slides', done: true }, { id: 'check-2', title: 'Send invite', done: false }],
  photos: ['task-photo.jpg'], links: ['https://example.com/report'], tags: ['work', 'review', 'work'],
  color: '#2F6F5B', location: 'Conference room', estimatedMinutes: 90, actualMinutes: 35 };

test('task migration preserves old fields, converts timed tasks and is repeatable', async () => {
  const { native, db } = database();
  try {
    await migrate(db);
    removeTaskV10Schema(native);
    native.exec(`PRAGMA user_version = 9;
      INSERT INTO tasks (id, title, notes, status, priority, due_date, start_time, created_at, updated_at)
      VALUES ('timed', 'Old task', 'Keep notes', 'done', 'high', '2026-10-03', '09:00', 1, 1),
        ('all-day', 'Old all day', NULL, 'todo', 'low', '2026-10-04', NULL, 1, 1)`);
    await migrate(db);
    await migrate(db);
    const timed = await getTodo(db, 'timed');
    assert.equal(timed.title, 'Old task');
    assert.equal(timed.notes, 'Keep notes');
    assert.equal(timed.status, 'done');
    assert.equal(timed.all_day, 0);
    assert.equal(timed.start_time, '09:00');
    assert.deepEqual(timed.subtasks, []);
    assert.deepEqual(timed.photos, []);
    assert.equal((await getTodo(db, 'all-day')).all_day, 1);
    assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 15);
  } finally { native.close(); }
});

test('create, edit, complete/uncomplete and sequential undo preserve every task field', async () => {
  const { native, db } = database();
  try {
    await migrate(db);
    const id = await saveTodo(db, detailed);
    const original = await getTodo(db, id);
    assert.equal(original.notes, detailed.notes);
    assert.equal(original.due_time, '17:00');
    assert.equal(original.start_time, '09:00');
    assert.equal(original.end_time, '10:30');
    assert.equal(original.all_day, 0);
    assert.equal(original.location, 'Conference room');
    assert.equal(original.estimated_minutes, 90);
    assert.equal(original.actual_minutes, 35);
    assert.equal(original.color, '#2F6F5B');
    assert.deepEqual(original.tags, ['work', 'review']);
    assert.deepEqual(original.subtasks, detailed.subtasks);
    assert.deepEqual(original.photos, detailed.photos);
    assert.deepEqual(original.links, detailed.links);
    await saveTodo(db, { ...detailed, title: 'Updated review', notes: 'Updated notes' }, id);
    await setTodoDone(db, id, true);
    assert.equal((await getTodo(db, id)).status, 'done');
    assert.ok((await getTodo(db, id)).completed_at);
    await setTodoDone(db, id, false);
    assert.equal((await getTodo(db, id)).completed_at, null);
    assert.equal((await getTodo(db, id)).status, 'todo');
    await undoTaskAction(db);
    assert.equal((await getTodo(db, id)).status, 'done');
    await undoTaskAction(db);
    assert.equal((await getTodo(db, id)).status, 'in_progress');
    await undoTaskAction(db);
    assert.deepEqual(await getTodo(db, id), original);
    assert.equal((await getTaskUndo(db)).label, 'Create task');
    await undoTaskAction(db);
    assert.equal(await getTodo(db, id), null);
    assert.equal(await getTaskUndo(db), null);
    await assert.rejects(undoTaskAction(db), /no task action/);
  } finally { native.close(); }
});

test('all-day tasks clear clock times while quick creation remains compatible', async () => {
  const { native, db } = database();
  try {
    await migrate(db);
    const quickId = await addTodo(db, basic);
    assert.equal((await getTodo(db, quickId)).all_day, 1);
    const timedId = await addTodo(db, { ...basic, startTime: '09:00' });
    assert.equal((await getTodo(db, timedId)).all_day, 0);
    await saveTodo(db, { ...detailed, allDay: true }, timedId);
    const row = await getTodo(db, timedId);
    assert.equal(row.all_day, 1);
    assert.equal(row.start_time, null);
    assert.equal(row.end_time, null);
    assert.equal(row.due_time, null);
  } finally { native.close(); }
});

test('duplicate resets progress and spent time, preserves metadata and supports undo', async () => {
  const { native, db } = database();
  try {
    await migrate(db);
    const id = await saveTodo(db, { ...detailed, status: 'done' });
    const copyId = await duplicateTodo(db, id);
    const copy = await getTodo(db, copyId);
    assert.equal(copy.title, 'Project review (copy)');
    assert.equal(copy.status, 'todo');
    assert.equal(copy.completed_at, null);
    assert.equal(copy.actual_minutes, null);
    assert.equal(copy.estimated_minutes, 90);
    assert.ok(copy.subtasks.every((item) => !item.done));
    assert.notEqual(copy.subtasks[0].id, 'check-1');
    assert.deepEqual(copy.photos, detailed.photos);
    assert.deepEqual(copy.links, detailed.links);
    assert.equal((await getTodo(db, id)).status, 'done');
    await undoTaskAction(db);
    assert.equal(await getTodo(db, copyId), null);
    assert.equal((await listTodos(db)).length, 1);
  } finally { native.close(); }
});

test('archive, unarchive, reschedule, and delete are undoable without losing details', async () => {
  const { native, db } = database();
  try {
    await migrate(db);
    const id = await saveTodo(db, detailed);
    await changeTodos(db, [id], { type: 'archive', archived: true });
    assert.deepEqual(await listTodos(db), []);
    assert.equal((await listTodos(db, true)).length, 1);
    await changeTodos(db, [id], { type: 'archive', archived: false });
    assert.equal((await listTodos(db)).length, 1);
    await changeTodos(db, [id], { type: 'reschedule', dueDate: '2026-10-30' });
    const moved = await getTodo(db, id);
    assert.equal(moved.due_date, '2026-10-30');
    assert.equal(moved.due_time, '17:00');
    assert.deepEqual(moved.subtasks, detailed.subtasks);
    assert.deepEqual(moved.photos, detailed.photos);
    await deleteTodo(db, id);
    assert.equal(await getTodo(db, id), null);
    await undoTaskAction(db);
    assert.deepEqual(await getTodo(db, id), moved);
    await undoTaskAction(db);
    assert.equal((await getTodo(db, id)).due_date, basic.dueDate);
    await undoTaskAction(db);
    assert.equal((await listTodos(db, true)).length, 1);
    await undoTaskAction(db);
    assert.equal((await listTodos(db)).length, 1);
  } finally { native.close(); }
});

test('bulk complete, delete and reschedule are atomic and each undo restores the whole batch', async () => {
  const { native, db } = database();
  try {
    await migrate(db);
    const ids = [await addTodo(db, basic), await saveTodo(db, detailed)];
    const original = await listTodos(db);
    for (const action of [{ type: 'status', status: 'done' }, { type: 'delete' },
      { type: 'reschedule', dueDate: '2026-11-15' }]) {
      await changeTodos(db, ids, action);
      await undoTaskAction(db);
      assert.deepEqual(await listTodos(db), original);
    }
    await assert.rejects(changeTodos(db, [ids[0], 'missing'], { type: 'delete' }), /no longer available/);
    assert.deepEqual(await listTodos(db), original);
    native.exec(`CREATE TRIGGER fail_task_update BEFORE UPDATE ON tasks
      WHEN OLD.id = '${ids[1]}' BEGIN SELECT RAISE(ABORT, 'update failure'); END`);
    await assert.rejects(changeTodos(db, ids, { type: 'status', status: 'done' }), /update failure/);
    assert.deepEqual(await listTodos(db), original);
    assert.equal((await getTaskUndo(db)).label, 'Create task');
  } finally { native.close(); }
});

test('task reordering persists and undo restores the original date ordering', async () => {
  const { native, db } = database();
  try {
    await migrate(db);
    const ids = [];
    for (const title of ['First', 'Second', 'Third']) ids.push(await addTodo(db, { ...basic, title }));
    const original = (await listTodos(db)).map((row) => row.id);
    await reorderTodos(db, [...original].reverse());
    assert.deepEqual((await listTodos(db)).map((row) => row.id), [...original].reverse());
    await undoTaskAction(db);
    assert.deepEqual((await listTodos(db)).map((row) => row.id), original);
    await changeTodos(db, [ids[1]], { type: 'reschedule', dueDate: '2026-10-04' });
    await assert.rejects(reorderTodos(db, ids), /same date/);
    await assert.rejects(reorderTodos(db, [ids[0], ids[0]]), /valid task order/);
  } finally { native.close(); }
});

test('invalid fields are rejected before writes and newer changes block unsafe undo', async () => {
  const { native, db } = database();
  try {
    await migrate(db);
    for (const input of [
      { title: '' }, { dueDate: '2026-02-30' }, { dueTime: '25:00' },
      { allDay: false, startTime: '10:00', endTime: '09:00' },
      { actualMinutes: -1 }, { estimatedMinutes: 1.5 }, { links: ['javascript:alert(1)'] },
      { links: ['not a URL'] }, { color: 'red' },
      { subtasks: [{ id: 'x', title: '', done: false }] },
    ]) {
      await assert.rejects(saveTodo(db, { ...basic, ...input }));
      assert.deepEqual(await listTodos(db), []);
      assert.equal(await getTaskUndo(db), null);
    }
    const id = await addTodo(db, basic);
    await db.runAsync("UPDATE tasks SET title = 'Newer external edit' WHERE id = ?", id);
    await assert.rejects(undoTaskAction(db), /overwrite newer changes/);
    assert.equal((await getTodo(db, id)).title, 'Newer external edit');
  } finally { native.close(); }
});

test('stale task edits cannot overwrite management actions', async () => {
  const { native, db } = database();
  try {
    await migrate(db);
    const id = await saveTodo(db, detailed);
    const original = await getTodo(db, id);
    await changeTodos(db, [id], { type: 'reschedule', dueDate: '2026-10-30' });
    await assert.rejects(saveTodo(db, { ...detailed, title: 'Stale edit' }, id, original.updated_at), /changed while you were editing/);
    assert.equal((await getTodo(db, id)).due_date, '2026-10-30');
  } finally { native.close(); }
});

test('drag drop hit testing and above/below reordering use exact measured bounds', () => {
  const date = { kind: 'date', key: '2026-10-04', rect: { x: 50, y: 200, width: 50, height: 50 } };
  const task = { kind: 'task', key: 'second', rect: { x: 20, y: 400, width: 300, height: 100 } };
  assert.equal(findTaskDropTarget([date, task], 75, 225), date);
  assert.equal(findTaskDropTarget([date, task], 100, 250), date);
  assert.equal(findTaskDropTarget([date, task], 101, 250), null);
  assert.equal(findTaskDropTarget([date, task], 80, 450), task);
  const ids = ['first', 'second', 'third'];
  assert.deepEqual(taskDropOrder(ids, 'first', task, 480), ['second', 'first', 'third']);
  assert.deepEqual(taskDropOrder(ids, 'third', task, 420), ['first', 'third', 'second']);
  assert.equal(taskDropOrder(ids, 'second', task, 420), null);
  assert.equal(taskDropOrder(ids, 'missing', task, 420), null);
  assert.equal(taskDropOrder(ids, 'first', date, 225), null);
  assert.deepEqual(ids, ['first', 'second', 'third']);
});

test('undo persists across reloads, keeps twenty actions and task lists are not truncated', async () => {
  const { native, db } = database();
  try {
    await migrate(db);
    for (let i = 0; i < 22; i++) await addTodo(db, { ...basic, title: `Task ${i}` });
    assert.equal((await db.getFirstAsync('SELECT COUNT(*) AS count FROM task_undo')).count, 20);
    assert.equal((await getTaskUndo(db)).label, 'Create task');
    for (let i = 0; i < 20; i++) await undoTaskAction(db);
    assert.equal((await listTodos(db)).length, 2);
    const existing = (await listTodos(db))[0];
    for (let i = 0; i < 1001; i++) {
      await db.runAsync(`INSERT INTO tasks (id, title, status, priority, due_date, created_at, updated_at)
        VALUES (?, 'Extra task', 'todo', 'low', '2026-10-03', 1, 1)`, `extra-${i}`);
    }
    const rows = await listTodos(db);
    assert.equal(rows.length, 1003);
    assert.ok(rows.some((row) => row.id === existing.id));
  } finally { native.close(); }
});

test('saved task actions and undo survive closing and reopening the database', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'mama-task-test-'));
  const filename = path.join(directory, 'tasks.db');
  let first = database(filename);
  let reopened;
  try {
    await migrate(first.db);
    const id = await saveTodo(first.db, detailed);
    await deleteTodo(first.db, id);
    first.native.close();
    first = null;
    reopened = database(filename);
    await migrate(reopened.db);
    assert.equal((await getTaskUndo(reopened.db)).label, 'Delete task');
    assert.equal(await getTodo(reopened.db, id), null);
    await undoTaskAction(reopened.db);
    const task = await getTodo(reopened.db, id);
    assert.equal(task.title, detailed.title);
    assert.deepEqual(task.photos, detailed.photos);
    assert.deepEqual(task.subtasks, detailed.subtasks);
  } finally {
    first?.native.close();
    reopened?.native.close();
    for (const suffix of ['', '-wal', '-shm']) {
      const file = `${filename}${suffix}`;
      if (existsSync(file)) rmSync(file);
    }
    rmdirSync(directory);
  }
});

test('undo journal failure never leaves an untracked task write', async () => {
  const { native, db } = database();
  try {
    await migrate(db);
    const id = await saveTodo(db, detailed);
    const original = await getTodo(db, id);
    native.exec(`CREATE TRIGGER fail_task_journal BEFORE INSERT ON task_undo
      BEGIN SELECT RAISE(ABORT, 'journal failure'); END`);
    await assert.rejects(saveTodo(db, { ...detailed, title: 'Unsaved update' }, id), /journal failure/);
    assert.deepEqual(await getTodo(db, id), original);
    await assert.rejects(addTodo(db, basic), /journal failure/);
    assert.equal((await listTodos(db)).length, 1);
    assert.equal((await getTaskUndo(db)).label, 'Create task');
  } finally { native.close(); }
});
