const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadSource } = require('./helpers/database.cjs');

const { buildTodoLists, collapseRepeats, isInList, taskListName } = loadSource('src/lib/todo-lists.ts');

const task = (overrides) => ({
  id: 'a', status: 'todo', due_date: '2026-10-04', scheduled: 1, list_name: null, category: null, ...overrides,
});

test('a task belongs to its list, falling back to its category', () => {
  assert.equal(taskListName(task({ list_name: 'Errands', category: 'Work' })), 'Errands');
  assert.equal(taskListName(task({ category: 'Work' })), 'Work');
  assert.equal(taskListName(task({})), null);
  assert.equal(isInList(task({ list_name: 'work' }), 'Work'), true);
});

test('lists keep defaults first, merge custom names and count open tasks', () => {
  const lists = buildTodoLists(['Work', 'groceries'], [
    task({ id: '1', category: 'Work' }),
    task({ id: '2', list_name: 'Work', status: 'done' }),
    task({ id: '3', list_name: 'Errands' }),
    task({ id: '4', list_name: 'Groceries' }),
  ]);
  assert.deepEqual(lists.map((item) => item.name), ['Work', 'Personal', 'Household', 'Health', 'Errands', 'groceries']);
  assert.equal(lists[0].open, 1);
  assert.equal(lists[5].open, 1);
  assert.equal(lists[5].isDefault, false);
});

test('repeating tasks show only their next future occurrence', () => {
  const rows = collapseRepeats([
    task({ id: 's/2026-10-03', due_date: '2026-10-03', status: 'done' }),
    task({ id: 's/2026-10-04', due_date: '2026-10-04' }),
    task({ id: 's/2026-10-05', due_date: '2026-10-05' }),
    task({ id: 's/2026-10-06', due_date: '2026-10-06' }),
    task({ id: 'plain', due_date: '2026-10-09' }),
  ], '2026-10-04');
  assert.deepEqual(rows.map((item) => item.id), ['s/2026-10-04', 's/2026-10-05', 'plain']);
});
