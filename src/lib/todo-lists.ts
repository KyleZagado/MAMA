type ListableTask = {
  id: string;
  status: string;
  due_date: string;
  scheduled: boolean | number;
  list_name: string | null;
  category: string | null;
};

export const DEFAULT_TODO_LISTS = [
  { name: 'Work', color: '#2F6F5B', icon: 'briefcase-outline' },
  { name: 'Personal', color: '#B5763A', icon: 'person-outline' },
  { name: 'Household', color: '#C79B6F', icon: 'home-outline' },
  { name: 'Health', color: '#8A6FB3', icon: 'heart-outline' },
] as const;

const CUSTOM_COLORS = ['#3F7CAC', '#C0566B', '#4E9A8F', '#9A7B3F', '#6E6AB8', '#5F8A4A'];

export type TodoListSummary = { name: string; color: string; icon: string; open: number; isDefault: boolean };

/** A task belongs to its explicit list, falling back to its category. */
export function taskListName(task: Pick<ListableTask, 'list_name' | 'category'>) {
  return task.list_name?.trim() || task.category?.trim() || null;
}

function sameName(a: string, b: string) {
  return a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0;
}

export function isInList(task: Pick<ListableTask, 'list_name' | 'category'>, name: string) {
  const own = taskListName(task);
  return own !== null && sameName(own, name);
}

function customColor(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return CUSTOM_COLORS[hash % CUSTOM_COLORS.length];
}

export function listColor(name: string | null) {
  if (!name) return null;
  return DEFAULT_TODO_LISTS.find((item) => sameName(item.name, name))?.color ?? customColor(name);
}

/** Default lists first, then saved/used custom lists alphabetically, each with its unfinished count. */
export function buildTodoLists(savedNames: string[], tasks: ListableTask[]): TodoListSummary[] {
  const custom: string[] = [];
  const add = (name: string | null) => {
    const trimmed = name?.trim();
    if (!trimmed) return;
    if (DEFAULT_TODO_LISTS.some((item) => sameName(item.name, trimmed))) return;
    if (custom.some((item) => sameName(item, trimmed))) return;
    custom.push(trimmed);
  };
  savedNames.forEach(add);
  tasks.forEach((task) => add(taskListName(task)));
  custom.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  const open = (name: string) => tasks.filter((task) => task.status !== 'done' && isInList(task, name)).length;
  return [
    ...DEFAULT_TODO_LISTS.map((item) => ({ ...item, open: open(item.name), isDefault: true })),
    ...custom.map((name) => ({ name, color: customColor(name), icon: 'list-outline', open: open(name), isDefault: false })),
  ];
}

/** Keeps only the next unfinished occurrence of each repeating task (virtual ids are `series/date`). */
export function collapseRepeats<T extends ListableTask>(tasks: T[], today: string) {
  const seen = new Set<string>();
  return tasks.filter((task) => {
    const separator = task.id.lastIndexOf('/');
    if (separator < 0) return true;
    if (task.due_date < today && task.status === 'done') return false;
    const series = task.id.slice(0, separator);
    if (task.due_date > today) {
      if (seen.has(series)) return false;
      seen.add(series);
    }
    return true;
  });
}
