import type { TodoPriority, TodoStatus } from '../database/todos';

export const TASK_PRIORITIES: { id: TodoPriority; label: string }[] = [
  { id: 'low', label: 'Low' }, { id: 'medium', label: 'Medium' }, { id: 'high', label: 'High' },
];
export const TASK_STATUSES: { id: TodoStatus; label: string }[] = [
  { id: 'todo', label: 'To Do' }, { id: 'in_progress', label: 'In Progress' }, { id: 'done', label: 'Done' },
];
export const TASK_CATEGORIES = ['Work', 'Personal', 'Household', 'Health'];
export const TASK_COLORS = [
  { label: 'Green', value: '#2F6F5B' }, { label: 'Blue', value: '#2D5BD0' },
  { label: 'Orange', value: '#B5763A' }, { label: 'Purple', value: '#8A6FB3' },
  { label: 'Red', value: '#B3443A' },
];
