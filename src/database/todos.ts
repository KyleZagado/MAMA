import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { Task } from '../types/models';

export type Todo = Pick<
  Task,
  | 'id'
  | 'title'
  | 'notes'
  | 'status'
  | 'priority'
  | 'category'
  | 'start_time'
  | 'completed_at'
  | 'created_at'
> & { due_date: string };

export function listTodos(db: SQLiteDatabase) {
  return db.getAllAsync<Todo>(
    `SELECT id, title, notes, status, priority, category, due_date, start_time, completed_at, created_at
     FROM tasks WHERE deleted_at IS NULL ORDER BY due_date ASC, created_at ASC LIMIT 1000`,
  );
}

type TodoInput = {
  title: string;
  priority: 'low' | 'medium' | 'high';
  category: string | null;
  dueDate: string;
  startTime: string | null;
};

export async function addTodo(db: SQLiteDatabase, input: TodoInput) {
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO tasks (id, title, status, priority, category, due_date, start_time, created_at, updated_at)
     VALUES (?, ?, 'todo', ?, ?, ?, ?, ?, ?)`,
    randomUUID(),
    input.title,
    input.priority,
    input.category,
    input.dueDate,
    input.startTime,
    now,
    now,
  );
}

export function setTodoDone(db: SQLiteDatabase, id: string, done: boolean) {
  const now = Date.now();
  return db.runAsync(
    'UPDATE tasks SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?',
    done ? 'done' : 'todo',
    done ? now : null,
    now,
    id,
  );
}

export function deleteTodo(db: SQLiteDatabase, id: string) {
  const now = Date.now();
  return db.runAsync('UPDATE tasks SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, id);
}
