import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { addDaysToKey, fromDateKey, toDateKey, toTimeKey } from '../lib/dates';
import { decodeTaskRepeat, taskRepeatDates } from '../lib/task-calendar';

export type TodoStatus = 'todo' | 'in_progress' | 'done';
export type TodoPriority = 'low' | 'medium' | 'high';
export type ChecklistItem = { id: string; title: string; done: boolean };

type TodoRow = {
  id: string; title: string; notes: string | null; status: TodoStatus; priority: TodoPriority;
  category: string | null; due_date: string; due_time: string | null;
  start_time: string | null; end_time: string | null; all_day: number;
  subtasks: string; photos: string; links: string; tags: string; color: string | null;
  location: string | null; estimated_minutes: number | null; actual_minutes: number | null;
  archived_at: number | null; sort_order: number; completed_at: number | null;
  created_at: number; updated_at: number; deleted_at: number | null;
  recurrence_rule: string | null; series_id: string | null; occurrence_date: string | null;
};
export type Todo = Omit<TodoRow, 'subtasks' | 'photos' | 'links' | 'tags'> & {
  subtasks: ChecklistItem[]; photos: string[]; links: string[]; tags: string[];
};
export type TodoInput = {
  title: string; priority: TodoPriority; category: string | null; dueDate: string;
  startTime: string | null; notes?: string | null; status?: TodoStatus;
  dueTime?: string | null; endTime?: string | null; allDay?: boolean;
  subtasks?: ChecklistItem[]; photos?: string[]; links?: string[]; tags?: string[];
  color?: string | null; location?: string | null;
  estimatedMinutes?: number | null; actualMinutes?: number | null;
  recurrenceRule?: string | null;
};

const columns = [
  'id', 'title', 'notes', 'status', 'priority', 'category', 'due_date', 'due_time', 'start_time',
  'end_time', 'all_day', 'subtasks', 'photos', 'links', 'tags', 'color', 'location',
  'estimated_minutes', 'actual_minutes', 'archived_at', 'sort_order', 'completed_at',
  'created_at', 'updated_at', 'deleted_at',
  'recurrence_rule', 'series_id', 'occurrence_date',
] as const;
const select = columns.join(', ');

function stringList(value: string, field: string): string[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || !parsed.every((item): item is string => typeof item === 'string')) {
    throw new Error(`Invalid task ${field}.`);
  }
  return parsed;
}

function decode(row: TodoRow): Todo {
  const subtasks: unknown = JSON.parse(row.subtasks);
  if (!Array.isArray(subtasks) || !subtasks.every((item): item is ChecklistItem =>
    item !== null && typeof item === 'object' && typeof item.id === 'string' &&
    typeof item.title === 'string' && typeof item.done === 'boolean')) {
    throw new Error(`Invalid checklist for ${row.title}.`);
  }
  return { ...row, subtasks, photos: stringList(row.photos, 'photos'),
    links: stringList(row.links, 'links'), tags: stringList(row.tags, 'tags') };
}

export async function listTodos(db: SQLiteDatabase, archived = false, expandRecurring = true) {
  const rows = await db.getAllAsync<TodoRow>(
    `SELECT ${select} FROM tasks WHERE deleted_at IS NULL AND archived_at IS ${archived ? 'NOT NULL' : 'NULL'}
     ORDER BY due_date ASC, sort_order ASC, created_at ASC, id ASC`,
  );
  const decoded = rows.map(decode);
  if (archived || !expandRecurring) return decoded;
  const today = toDateKey(new Date());
  const repeating = (await listCalendarTodos(db, addDaysToKey(today, -30), addDaysToKey(today, 365)))
    .filter((item) => item.repeating);
  const replacedAnchors = new Set((await db.getAllAsync<{ series_id: string; occurrence_date: string }>(
    'SELECT series_id, occurrence_date FROM tasks WHERE series_id IS NOT NULL',
  )).map((item) => `${item.series_id}/${item.occurrence_date}`));
  // Virtual IDs remain actionable through existing home completion controls.
  return [...decoded.filter((item) => !item.recurrence_rule && !item.series_id &&
      !replacedAnchors.has(`${item.id}/${item.due_date}`)),
    ...repeating.map((item) => ({ ...item, id: item.virtual ? item.calendarKey : item.id }))];
}

export async function getTodo(db: SQLiteDatabase, id: string) {
  const row = await db.getFirstAsync<TodoRow>(`SELECT ${select} FROM tasks WHERE id = ? AND deleted_at IS NULL`, id);
  return row ? decode(row) : null;
}

function validateDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || toDateKey(fromDateKey(date)) !== date) {
    throw new Error('Choose a valid due date.');
  }
}

export function validateTodo(input: TodoInput) {
  if (!input.title.trim()) throw new Error('Enter a task title.');
  validateDate(input.dueDate);
  decodeTaskRepeat(input.recurrenceRule ?? null);
  if (!['low', 'medium', 'high'].includes(input.priority) ||
      !['todo', 'in_progress', 'done'].includes(input.status ?? 'todo')) {
    throw new Error('Choose a valid priority and status.');
  }
  for (const time of [input.startTime, input.endTime, input.dueTime]) {
    if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Choose a valid task time.');
  }
  if (!input.allDay && input.startTime && input.endTime && input.endTime <= input.startTime) {
    throw new Error('End time must be after start time on the same day.');
  }
  for (const minutes of [input.estimatedMinutes, input.actualMinutes]) {
    if (minutes != null && (!Number.isSafeInteger(minutes) || minutes < 0)) {
      throw new Error('Duration must be a whole number of minutes, zero or greater.');
    }
  }
  for (const link of input.links ?? []) {
    let url: URL;
    try { url = new URL(link); } catch { throw new Error('Links must be valid http:// or https:// URLs.'); }
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Only http:// and https:// links are supported.');
  }
  const checklist = input.subtasks ?? [];
  if (checklist.some((item) => !item.title.trim()) || new Set(checklist.map((item) => item.id)).size !== checklist.length) {
    throw new Error('Checklist items must have a title and unique IDs.');
  }
  if (input.color && !/^#[0-9a-f]{6}$/i.test(input.color)) throw new Error('Choose a valid color label.');
}

async function writeRow(db: SQLiteDatabase, row: TodoRow) {
  await db.runAsync(
    `INSERT INTO tasks (${select}) VALUES (${columns.map(() => '?').join(', ')})
     ON CONFLICT(id) DO UPDATE SET ${columns.filter((column) => column !== 'id').map((column) => `${column} = excluded.${column}`).join(', ')}`,
    ...columns.map((column) => row[column]),
  );
}

type UndoEntry = { id: number; label: string; before_rows: string; after_rows: string };

async function journal(db: SQLiteDatabase, label: string, before: TodoRow[], after: TodoRow[]) {
  await db.runAsync('INSERT INTO task_undo (label, before_rows, after_rows) VALUES (?, ?, ?)',
    label, JSON.stringify(before), JSON.stringify(after));
  await db.runAsync('DELETE FROM task_undo WHERE id NOT IN (SELECT id FROM task_undo ORDER BY id DESC LIMIT 20)');
}

export async function saveTodo(
  db: SQLiteDatabase, input: TodoInput, id?: string, expectedUpdatedAt?: number,
  occurrence?: { seriesId: string; date: string },
) {
  validateTodo(input);
  const taskId = id ?? randomUUID();
  await db.withExclusiveTransactionAsync(async (tx) => {
    const existing = id ? await tx.getFirstAsync<TodoRow>(
      `SELECT ${select} FROM tasks WHERE id = ? AND deleted_at IS NULL`, id,
    ) : null;
    if (id && !existing) throw new Error('This task is no longer available.');
    if (existing && expectedUpdatedAt != null && existing.updated_at !== expectedUpdatedAt) {
      throw new Error('This task changed while you were editing. Reopen it to load the latest version.');
    }
    if (occurrence) {
      const template = await tx.getFirstAsync<TodoRow>(`SELECT ${select} FROM tasks WHERE id = ? AND deleted_at IS NULL AND archived_at IS NULL`, occurrence.seriesId);
      const repeat = template ? decodeTaskRepeat(template.recurrence_rule) : null;
      if (!template || !repeat || !taskRepeatDates(template.due_date, repeat, occurrence.date, occurrence.date).length) {
        throw new Error('This recurring task occurrence is no longer available.');
      }
      if (expectedUpdatedAt != null && template.updated_at !== expectedUpdatedAt) {
        throw new Error('The recurring task changed. Reload the calendar before editing.');
      }
      const edited = await tx.getFirstAsync<{ id: string }>(
        'SELECT id FROM tasks WHERE series_id = ? AND occurrence_date = ?', occurrence.seriesId, occurrence.date,
      );
      if (edited) throw new Error('This occurrence was already edited. Reload the calendar to use its latest version.');
    }
    const now = Math.max(Date.now(), (existing?.updated_at ?? 0) + 1);
    const allDay = input.allDay ?? !input.startTime;
    const status = input.status ?? 'todo';
    const row: TodoRow = {
      id: taskId, title: input.title.trim(), notes: input.notes?.trim() || null,
      priority: input.priority, category: input.category?.trim() || null, due_date: input.dueDate,
      status, start_time: allDay ? null : input.startTime, due_time: allDay ? null : input.dueTime ?? null,
      end_time: allDay ? null : input.endTime ?? null, all_day: Number(allDay),
      subtasks: JSON.stringify(input.subtasks ?? []), photos: JSON.stringify(input.photos ?? []),
      links: JSON.stringify(input.links ?? []), tags: JSON.stringify([...new Set(input.tags ?? [])]),
      color: input.color ?? null, location: input.location?.trim() || null,
      estimated_minutes: input.estimatedMinutes ?? null, actual_minutes: input.actualMinutes ?? null,
      archived_at: existing?.archived_at ?? null, sort_order: existing?.sort_order ?? now,
      completed_at: status === 'done' ? existing?.completed_at ?? now : null,
      created_at: existing?.created_at ?? now, updated_at: now, deleted_at: null,
      recurrence_rule: input.recurrenceRule === undefined ? existing?.recurrence_rule ?? null : input.recurrenceRule,
      series_id: existing?.series_id ?? occurrence?.seriesId ?? null,
      occurrence_date: existing?.occurrence_date ?? occurrence?.date ?? null,
    };
    await writeRow(tx, row);
    await journal(tx, id ? 'Edit task' : 'Create task', existing ? [existing] : [], [row]);
  });
  return taskId;
}

export const addTodo = (db: SQLiteDatabase, input: TodoInput) => saveTodo(db, input);

export type TaskAction =
  | { type: 'status'; status: TodoStatus }
  | { type: 'delete' }
  | { type: 'archive'; archived: boolean }
  | { type: 'reschedule'; dueDate: string };

export async function changeTodos(db: SQLiteDatabase, ids: string[], action: TaskAction) {
  const unique = [...new Set(ids)];
  if (!unique.length) throw new Error('Select at least one task.');
  if (action.type === 'reschedule') validateDate(action.dueDate);
  if (action.type === 'status' && !['todo', 'in_progress', 'done'].includes(action.status)) {
    throw new Error('Choose a valid task status.');
  }
  await db.withExclusiveTransactionAsync(async (tx) => {
    const before: TodoRow[] = [];
    for (const id of unique) {
      const row = await tx.getFirstAsync<TodoRow>(`SELECT ${select} FROM tasks WHERE id = ? AND deleted_at IS NULL`, id);
      if (!row) throw new Error('A selected task is no longer available. Refresh and try again.');
      before.push(row);
    }
    const after = before.map((row) => {
      const now = Math.max(Date.now(), row.updated_at + 1);
      const next = { ...row, updated_at: now };
      if (action.type === 'status') {
        next.status = action.status;
        next.completed_at = action.status === 'done' ? row.completed_at ?? now : null;
      } else if (action.type === 'delete') next.deleted_at = now;
      else if (action.type === 'archive') next.archived_at = action.archived ? now : null;
      else {
        next.due_date = action.dueDate;
        next.sort_order = now;
      }
      return next;
    });
    for (const row of after) await writeRow(tx, row);
    const label = action.type === 'status' ? (action.status === 'done' ? 'Complete' : 'Change status')
      : action.type === 'archive' ? (action.archived ? 'Archive' : 'Unarchive')
      : action.type === 'delete' ? 'Delete' : 'Reschedule';
    await journal(tx, `${label} ${unique.length === 1 ? 'task' : `${unique.length} tasks`}`, before, after);
  });
}

export const setTodoDone = (db: SQLiteDatabase, id: string, done: boolean) =>
  setCalendarAwareDone(db, id, done);
export const deleteTodo = (db: SQLiteDatabase, id: string) => changeTodos(db, [id], { type: 'delete' });

export async function duplicateTodo(db: SQLiteDatabase, id: string) {
  const copyId = randomUUID();
  await db.withExclusiveTransactionAsync(async (tx) => {
    const original = await tx.getFirstAsync<TodoRow>(`SELECT ${select} FROM tasks WHERE id = ? AND deleted_at IS NULL`, id);
    if (!original) throw new Error('This task is no longer available.');
    const todo = decode(original);
    const now = Date.now();
    const copy: TodoRow = {
      ...original, id: copyId, title: `${original.title} (copy)`, status: 'todo', completed_at: null,
      actual_minutes: null, archived_at: null, created_at: now, updated_at: now, sort_order: now,
      series_id: null, occurrence_date: null,
      subtasks: JSON.stringify(todo.subtasks.map((item) => ({ ...item, id: randomUUID(), done: false }))),
    };
    await writeRow(tx, copy);
    await journal(tx, 'Duplicate task', [], [copy]);
  });
  return copyId;
}

export async function reorderTodos(db: SQLiteDatabase, ids: string[]) {
  if (!ids.length || new Set(ids).size !== ids.length) throw new Error('Choose a valid task order.');
  await db.withExclusiveTransactionAsync(async (tx) => {
    const before: TodoRow[] = [];
    for (const id of ids) {
      const row = await tx.getFirstAsync<TodoRow>(
        `SELECT ${select} FROM tasks WHERE id = ? AND deleted_at IS NULL AND archived_at IS NULL`, id,
      );
      if (!row) throw new Error('A dragged task is no longer available.');
      before.push(row);
    }
    if (new Set(before.map((row) => row.due_date)).size !== 1) throw new Error('Reorder tasks within the same date.');
    const after = before.map((row, index) => ({
      ...row, sort_order: index, updated_at: Math.max(Date.now(), row.updated_at + 1),
    }));
    for (const row of after) await writeRow(tx, row);
    await journal(tx, 'Reorder tasks', before, after);
  });
}

export async function getTaskUndo(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<UndoEntry>('SELECT * FROM task_undo ORDER BY id DESC LIMIT 1');
  return row ? { label: row.label } : null;
}

export async function undoTaskAction(db: SQLiteDatabase) {
  await db.withExclusiveTransactionAsync(async (tx) => {
    const entry = await tx.getFirstAsync<UndoEntry>('SELECT * FROM task_undo ORDER BY id DESC LIMIT 1');
    if (!entry) throw new Error('There is no task action to undo.');
    const before: TodoRow[] = JSON.parse(entry.before_rows);
    const after: TodoRow[] = JSON.parse(entry.after_rows);
    for (const row of after) {
      const current = await tx.getFirstAsync<TodoRow>(`SELECT ${select} FROM tasks WHERE id = ?`, row.id);
      if (!current || columns.some((column) => current[column] !== row[column])) {
        throw new Error('Tasks changed since this action. Undo would overwrite newer changes.');
      }
    }
    for (const row of before) await writeRow(tx, row);
    for (const row of after) {
      if (!before.some((previous) => previous.id === row.id)) await tx.runAsync('DELETE FROM tasks WHERE id = ?', row.id);
    }
    await tx.runAsync('DELETE FROM task_undo WHERE id = ?', entry.id);
  });
}

export function todoInput(todo: Todo): TodoInput {
  return {
    title: todo.title, priority: todo.priority, category: todo.category, dueDate: todo.due_date,
    startTime: todo.start_time, dueTime: todo.due_time, endTime: todo.end_time, allDay: Boolean(todo.all_day),
    notes: todo.notes, status: todo.status, subtasks: todo.subtasks, photos: todo.photos,
    links: todo.links, tags: todo.tags, color: todo.color, location: todo.location,
    estimatedMinutes: todo.estimated_minutes, actualMinutes: todo.actual_minutes, recurrenceRule: todo.recurrence_rule,
  };
}

export type CalendarTodo = Todo & { calendarKey: string; virtual: boolean; repeating: boolean };

export async function listCalendarTodos(
  db: SQLiteDatabase, from: string, through: string, repeatFrom = from,
): Promise<CalendarTodo[]> {
  validateDate(from);
  validateDate(through);
  const rows = (await db.getAllAsync<TodoRow>(`SELECT ${select} FROM tasks ORDER BY due_date, sort_order, id`)).map(decode);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const overrides = new Map(rows.filter((row) => row.series_id).map((row) => [`${row.series_id}/${row.occurrence_date}`, row]));
  const result: CalendarTodo[] = [];
  for (const row of rows) {
    if (row.deleted_at != null || row.archived_at != null) continue;
    if (row.series_id) {
      const template = byId.get(row.series_id);
      if (!template || template.deleted_at != null || template.archived_at != null) continue;
      if (row.due_date >= from && row.due_date <= through) result.push({ ...row, calendarKey: row.id, virtual: false, repeating: true });
      continue;
    }
    const repeat = decodeTaskRepeat(row.recurrence_rule);
    if (!repeat) {
      if (!overrides.has(`${row.id}/${row.due_date}`) && row.due_date >= from && row.due_date <= through) {
        result.push({ ...row, calendarKey: row.id, virtual: false, repeating: false });
      }
      continue;
    }
    for (const date of taskRepeatDates(row.due_date, repeat, repeatFrom > from ? repeatFrom : from, through)) {
      const key = `${row.id}/${date}`;
      if (overrides.has(key)) continue;
      result.push({ ...row, due_date: date, series_id: row.id, occurrence_date: date,
        recurrence_rule: null, status: date === row.due_date ? row.status : 'todo',
        completed_at: date === row.due_date ? row.completed_at : null,
        actual_minutes: date === row.due_date ? row.actual_minutes : null,
        subtasks: date === row.due_date ? row.subtasks : row.subtasks.map((item) => ({ ...item, done: false })),
        calendarKey: key, virtual: true, repeating: true });
    }
  }
  return result.sort((a, b) => a.due_date.localeCompare(b.due_date) ||
    (a.start_time ?? a.due_time ?? '00:00').localeCompare(b.start_time ?? b.due_time ?? '00:00') ||
    a.sort_order - b.sort_order || a.calendarKey.localeCompare(b.calendarKey));
}

export async function saveCalendarTodo(db: SQLiteDatabase, todo: CalendarTodo, patch: Partial<TodoInput>) {
  return saveTodo(db, { ...todoInput(todo), ...patch }, todo.virtual ? undefined : todo.id, todo.updated_at,
    todo.virtual && todo.series_id && todo.occurrence_date ? { seriesId: todo.series_id, date: todo.occurrence_date } : undefined);
}

export async function listOverdueCalendarTodos(db: SQLiteDatabase, today: string, nowTime = toTimeKey(new Date())) {
  const oldest = await db.getFirstAsync<{ due_date: string | null }>(
    'SELECT MIN(due_date) AS due_date FROM tasks WHERE deleted_at IS NULL AND archived_at IS NULL',
  );
  if (!oldest?.due_date || oldest.due_date > today) return [];
  return (await listCalendarTodos(db, oldest.due_date, today, addDaysToKey(today, -30)))
    .filter((task) => {
      const deadline = task.due_time ?? task.end_time ?? task.start_time;
      return task.status !== 'done' && (task.due_date < today ||
        (!task.all_day && deadline !== null && deadline < nowTime));
    });
}

async function setCalendarAwareDone(db: SQLiteDatabase, id: string, done: boolean) {
  const separator = id.lastIndexOf('/');
  if (separator < 0) return changeTodos(db, [id], { type: 'status', status: done ? 'done' : 'todo' });
  const date = id.slice(separator + 1);
  const occurrence = (await listCalendarTodos(db, date, date)).find((item) => item.calendarKey === id);
  if (!occurrence) throw new Error('This recurring task occurrence is no longer available.');
  return saveCalendarTodo(db, occurrence, { status: done ? 'done' : 'todo' });
}
