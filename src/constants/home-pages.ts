export const HOME_PAGES = [
  { id: 'overview', label: 'Overview Tracker' },
  { id: 'todos', label: 'To-do list' },
  { id: 'finance', label: 'Wallets & finance' },
  { id: 'consumption', label: 'Food and water' },
  { id: 'fitness', label: 'Fitness' },
  { id: 'fasting', label: 'Fasting Tracker' },
  { id: 'journal', label: 'Daily Journal' },
] as const;

export type HomePageId = (typeof HOME_PAGES)[number]['id'];

export const DEFAULT_HOME_PAGE_ORDER: HomePageId[] = HOME_PAGES.map((page) => page.id);

export function normalizeHomePageOrder(value: unknown): HomePageId[] {
  const requested = Array.isArray(value) ? value : [];
  const known = new Set<string>(HOME_PAGES.map((page) => page.id));
  const normalized: HomePageId[] = [];
  for (const id of requested) {
    if (typeof id !== 'string' || !known.has(id)) continue;
    const page = HOME_PAGES.find((item) => item.id === id);
    if (page && !normalized.includes(page.id)) {
      normalized.push(page.id);
    }
  }
  for (const page of HOME_PAGES) {
    if (!normalized.includes(page.id)) normalized.push(page.id);
  }
  return normalized;
}

export function moveHomePage(order: HomePageId[], pageId: HomePageId, targetIndex: number) {
  const fromIndex = order.indexOf(pageId);
  if (fromIndex < 0 || !Number.isInteger(targetIndex)) return order;
  const boundedTarget = Math.max(0, Math.min(targetIndex, order.length - 1));
  if (fromIndex === boundedTarget) return order;
  const next = [...order];
  next.splice(fromIndex, 1);
  next.splice(boundedTarget, 0, pageId);
  return next;
}

/** Keeps valid, unique hidden page ids and always leaves at least one page visible. */
export function normalizeHiddenHomePages(value: unknown): HomePageId[] {
  const requested = Array.isArray(value) ? value : [];
  const hidden = HOME_PAGES.map((page) => page.id).filter((id) => requested.includes(id));
  return hidden.length >= HOME_PAGES.length ? hidden.slice(1) : hidden;
}

export function toggleHiddenHomePage(hidden: HomePageId[], pageId: HomePageId) {
  const next = hidden.includes(pageId)
    ? hidden.filter((id) => id !== pageId)
    : [...hidden, pageId];
  if (next.length >= HOME_PAGES.length) return hidden;
  return normalizeHiddenHomePages(next);
}
