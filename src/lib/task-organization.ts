import type { Todo } from '../database/todos';
import { addDaysToKey } from './dates';

export const TASK_VIEWS = [
  { id: 'all', label: 'All tasks' }, { id: 'today', label: 'Today' },
  { id: 'tomorrow', label: 'Tomorrow' }, { id: 'upcoming', label: 'Upcoming' },
  { id: 'overdue', label: 'Overdue' }, { id: 'completed', label: 'Completed' },
  { id: 'unscheduled', label: 'Unscheduled' }, { id: 'favorites', label: 'Favorites' },
  { id: 'lists', label: 'My Lists' },
] as const;
export type TaskView = typeof TASK_VIEWS[number]['id'];
export const TASK_GROUPS = ['Date', 'Priority', 'Category', 'Project', 'Tag', 'Status', 'Time', 'Location'] as const;
export type TaskGroup = typeof TASK_GROUPS[number];
export const PRIORITY_COLORS = { high: '#B3443A', medium: '#A86A2A', low: '#2D5BD0' };

export function isTaskOverdue(task: Todo, today: string, nowTime: string) {
  const deadline = task.due_time ?? task.end_time ?? task.start_time;
  return Boolean(task.scheduled) && task.status !== 'done' &&
    (task.due_date < today || (task.due_date === today && !task.all_day && deadline !== null && deadline < nowTime));
}

export function filterTaskView(tasks: Todo[], view: TaskView, today: string, nowTime: string, list: string | null, query: string) {
  const text = query.trim().toLowerCase();
  return tasks.filter((task) => {
    if (task.deleted_at != null || task.archived_at != null) return false;
    if (text && ![task.title, task.notes, task.category, task.project, task.list_name, task.location, ...task.tags]
      .join(' ').toLowerCase().includes(text)) return false;
    switch (view) {
      case 'today': return Boolean(task.scheduled) && task.due_date === today && task.status !== 'done';
      case 'tomorrow': return Boolean(task.scheduled) && task.due_date === addDaysToKey(today, 1) && task.status !== 'done';
      case 'upcoming': return Boolean(task.scheduled) && task.due_date > today && task.status !== 'done';
      case 'overdue': return isTaskOverdue(task, today, nowTime);
      case 'completed': return task.status === 'done';
      case 'unscheduled': return !task.scheduled;
      case 'favorites': return Boolean(task.favorite);
      case 'lists': return list === null ? task.list_name === null : task.list_name === list;
      default: return true;
    }
  });
}

export function groupTasks(tasks: Todo[], group: TaskGroup, today: string) {
  const buckets = new Map<string, Todo[]>();
  const dateLabel = (task: Todo) => !task.scheduled ? 'Unscheduled' : task.due_date === today ? 'Today'
    : task.due_date === addDaysToKey(today, 1) ? 'Tomorrow' : task.due_date;
  const labels = (task: Todo): string[] => {
    switch (group) {
      case 'Date': return [dateLabel(task)];
      case 'Priority': return [`${task.priority[0].toUpperCase()}${task.priority.slice(1)} Priority`];
      case 'Category': return [task.category ?? 'No category'];
      case 'Project': return [task.project ?? 'No project'];
      case 'Tag': return task.tags.length ? [...new Set(task.tags)].map((tag) => `#${tag}`) : ['No tags'];
      case 'Status': return [{ todo: 'To Do', in_progress: 'In Progress', done: 'Done' }[task.status]];
      case 'Time': {
        const time = task.scheduled && !task.all_day ? task.start_time ?? task.due_time ?? task.end_time : null;
        if (!time) return [task.scheduled ? 'All day / No time' : 'Unscheduled'];
        const hour = Number(time.slice(0, 2));
        return [hour < 12 ? 'Morning (00:00-11:59)' : hour < 18 ? 'Afternoon (12:00-17:59)' : 'Evening (18:00-23:59)'];
      }
      case 'Location': return [task.location ?? 'No location'];
    }
  };
  const ordered = [...tasks].sort((a, b) => b.scheduled - a.scheduled ||
    a.due_date.localeCompare(b.due_date) || (a.start_time ?? a.due_time ?? '99:99').localeCompare(b.start_time ?? b.due_time ?? '99:99') ||
    a.sort_order - b.sort_order || a.id.localeCompare(b.id));
  for (const task of ordered) for (const label of labels(task)) {
    const bucket = buckets.get(label) ?? [];
    bucket.push(task);
    buckets.set(label, bucket);
  }
  const rank = group === 'Priority' ? ['High Priority', 'Medium Priority', 'Low Priority']
    : group === 'Status' ? ['To Do', 'In Progress', 'Done']
      : group === 'Time' ? ['Morning (00:00-11:59)', 'Afternoon (12:00-17:59)', 'Evening (18:00-23:59)', 'All day / No time', 'Unscheduled'] : null;
  return [...buckets].sort(([a, aa], [b, bb]) => rank ? rank.indexOf(a) - rank.indexOf(b)
    : group === 'Date' ? bb[0].scheduled - aa[0].scheduled || aa[0].due_date.localeCompare(bb[0].due_date)
      : a.localeCompare(b)).map(([title, data]) => ({ title, data }));
}