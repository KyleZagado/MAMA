const assert = require('node:assert/strict');
const test = require('node:test');
const { loadSource, database, removeTaskV12Schema } = require('./helpers/database.cjs');
const { migrate } = loadSource('src/database/migrations.ts');
const { saveTodo, getTodo, listTodos, listCalendarTodos, createTaskList, listTaskLists, setTaskFavorite,
  changeTodos, undoTaskAction, todoInput, setTodoDone } = loadSource('src/database/todos.ts');
const { filterTaskView, groupTasks, TASK_VIEWS, TASK_GROUPS } = loadSource('src/lib/task-organization.ts');
const { toDateKey, addDaysToKey } = loadSource('src/lib/dates.ts');
const input = { title: 'Finish presentation', priority: 'high', category: 'Work', dueDate: '2026-10-03',
  startTime: '09:00', dueTime: '10:00', allDay: false, project: 'Launch', listName: 'Work', favorite: true,
  tags: ['urgent', 'office'], location: 'Office' };

test('every list view uses saved metadata and explicit scheduled state', async () => {
  const { native, db } = database();
  try {
    await migrate(db);
    await saveTodo(db, input);
    await saveTodo(db, { ...input, title: 'Tomorrow', dueDate: '2026-10-04', favorite: false });
    await saveTodo(db, { ...input, title: 'Later', dueDate: '2026-10-09', favorite: false });
    await saveTodo(db, { ...input, title: 'No date', scheduled: false, listName: null, favorite: false });
    await saveTodo(db, { ...input, title: 'Done', status: 'done', favorite: false });
    const tasks = await listTodos(db, false, false, true);
    const count = (view, list = null) => filterTaskView(tasks, view, '2026-10-03', '11:00', list, '').length;
    assert.equal(TASK_VIEWS.length, 9);
    assert.equal(count('all'), 5);
    assert.equal(count('today'), 1);
    assert.equal(count('tomorrow'), 1);
    assert.equal(count('upcoming'), 2);
    assert.equal(count('overdue'), 1);
    assert.equal(count('completed'), 1);
    assert.equal(count('unscheduled'), 1);
    assert.equal(count('favorites'), 1);
    assert.equal(count('lists', 'Work'), 4);
    assert.equal(count('lists'), 1);
    assert.equal(filterTaskView(tasks, 'all', '2026-10-03', '11:00', null, 'launch').length, 5);
    assert.equal(filterTaskView(tasks, 'all', '2026-10-03', '11:00', null, 'missing').length, 0);
    assert.equal((await listCalendarTodos(db, '2026-10-03', '2026-10-03')).length, 2);
    assert.equal((await listTodos(db)).some((task) => task.title === 'No date'), false);
    const noDate = tasks.find((task) => !task.scheduled);
    assert.equal(noDate.start_time, null);
    await changeTodos(db, [noDate.id], { type: 'reschedule', dueDate: '2026-10-04' });
    assert.equal((await getTodo(db, noDate.id)).scheduled, 1);
    await undoTaskAction(db);
    assert.equal((await getTodo(db, noDate.id)).scheduled, 0);
    await assert.rejects(saveTodo(db, { ...input, scheduled: false, recurrenceRule: '{"frequency":"daily","weekdays":[]}' }), /need a scheduled/);
  } finally { native.close(); }
});

test('all eight groupings use deterministic order, missing-field labels and multiple tags', async () => {
  const { native, db } = database();
  try {
    await migrate(db);
    await saveTodo(db, input);
    await saveTodo(db, { ...input, title: 'Buy groceries', priority: 'medium', project: null, category: null,
      location: null, tags: [], allDay: true, status: 'in_progress' });
    await saveTodo(db, { ...input, title: 'Evening', priority: 'low', startTime: '20:00', dueTime: '21:00', status: 'done' });
    const tasks = await listTodos(db, false, false, true);
    assert.equal(TASK_GROUPS.length, 8);
    for (const grouping of TASK_GROUPS) {
      const sections = groupTasks(tasks, grouping, '2026-10-03');
      assert.ok(sections.every((section) => section.title && section.data.length));
      assert.equal(new Set(sections.flatMap((section) => section.data.map((task) => task.id))).size, 3);
    }
    assert.deepEqual(groupTasks(tasks, 'Priority', '2026-10-03').map((section) => section.title),
      ['High Priority', 'Medium Priority', 'Low Priority']);
    assert.deepEqual(groupTasks(tasks, 'Status', '2026-10-03').map((section) => section.title),
      ['To Do', 'In Progress', 'Done']);
    assert.equal(groupTasks(tasks, 'Tag', '2026-10-03').find((section) => section.title === '#urgent').data.length, 2);
    assert.ok(groupTasks(tasks, 'Project', '2026-10-03').some((section) => section.title === 'No project'));
    assert.equal(groupTasks(tasks, 'Date', '2026-10-03')[0].title, 'Today');
  } finally { native.close(); }
});

test('named lists persist even when empty; metadata and favorite updates are undoable and stale-safe', async () => {
  const { native, db } = database();
  try {
    await migrate(db);
    await createTaskList(db, 'Personal');
    await assert.rejects(createTaskList(db, ' Personal '), /already exists/);
    await assert.rejects(createTaskList(db, ' '), /list name/);
    const id = await saveTodo(db, input);
    assert.deepEqual(await listTaskLists(db), ['Personal', 'Work']);
    const task = await getTodo(db, id);
    assert.equal(task.project, 'Launch');
    await setTaskFavorite(db, task, false);
    assert.equal((await getTodo(db, id)).favorite, 0);
    await assert.rejects(setTaskFavorite(db, task, true), /changed/);
    await undoTaskAction(db);
    assert.equal((await getTodo(db, id)).favorite, 1);
    await saveTodo(db, { ...todoInput(task), listName: 'Personal', project: 'Home' }, id, task.updated_at);
    await undoTaskAction(db);
    assert.equal((await getTodo(db, id)).list_name, 'Work');
    assert.equal((await getTodo(db, id)).project, 'Launch');
  } finally { native.close(); }
});

test('recurring list entries favorite and complete just one date while preserving list and project', async () => {
  const { native, db } = database();
  try {
    await migrate(db);
    const today = toDateKey(new Date());
    const id = await saveTodo(db, { ...input, dueDate: today, recurrenceRule: '{"frequency":"daily","weekdays":[]}' });
    const tomorrow = addDaysToKey(today, 1);
    const task = (await listTodos(db)).find((task) => task.id === `${id}/${tomorrow}`);
    await setTaskFavorite(db, task, false);
    await assert.rejects(setTaskFavorite(db, task, true), /no longer available/);
    const changed = (await listTodos(db)).find((task) => task.due_date === tomorrow);
    assert.equal(changed.favorite, 0);
    assert.equal(changed.list_name, 'Work');
    assert.equal(changed.project, 'Launch');
    await setTodoDone(db, changed.id, true);
    assert.equal((await getTodo(db, id)).status, 'todo');
    assert.equal((await getTodo(db, id)).favorite, 1);
    await undoTaskAction(db);
    await undoTaskAction(db);
    assert.equal((await listTodos(db)).find((task) => task.id === `${id}/${tomorrow}`).favorite, 1);
  } finally { native.close(); }
});

test('version 11 migration preserves existing tasks and persistent undo snapshots', async () => {
  const { native, db } = database();
  try {
    await migrate(db);
    const id = await saveTodo(db, input);
    await changeTodos(db, [id], { type: 'status', status: 'done' });
    native.exec(`UPDATE task_undo SET
      before_rows = (SELECT json_group_array(json_remove(value, '$.scheduled', '$.favorite', '$.list_name', '$.project')) FROM json_each(before_rows)),
      after_rows = (SELECT json_group_array(json_remove(value, '$.scheduled', '$.favorite', '$.list_name', '$.project')) FROM json_each(after_rows))`);
    removeTaskV12Schema(native);
    native.exec('PRAGMA user_version = 11');
    await migrate(db);
    await migrate(db);
    assert.equal((await getTodo(db, id)).scheduled, 1);
    assert.equal((await getTodo(db, id)).favorite, 0);
    await undoTaskAction(db);
    assert.equal((await getTodo(db, id)).status, 'todo');
    await undoTaskAction(db);
    assert.equal(await getTodo(db, id), null);
  } finally { native.close(); }
});

test('version 12 databases without the list catalog upgrade without losing organization or undo', async () => {
  const { native, db } = database();
  try {
    await migrate(db);
    const id = await saveTodo(db, input);
    native.exec('DROP TABLE task_lists; PRAGMA user_version = 12');
    await migrate(db);
    assert.deepEqual(await listTaskLists(db), ['Work']);
    assert.equal((await getTodo(db, id)).favorite, 1);
    assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 14);
    await undoTaskAction(db);
    assert.equal(await getTodo(db, id), null);
  } finally { native.close(); }
});