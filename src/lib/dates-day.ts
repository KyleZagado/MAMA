import { fromDateKey, toDateKey } from './dates';

export function dayBounds(dateKey: string) {
  const start = fromDateKey(dateKey);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.getTime(), end: end.getTime() };
}

// Monday of the week containing the date.
export function weekStartKey(dateKey: string) {
  const date = fromDateKey(dateKey);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return toDateKey(date);
}

export function dayLabel(dateKey: string, todayKey: string) {
  const date = fromDateKey(dateKey);
  const short = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const diff = Math.round((date.getTime() - fromDateKey(todayKey).getTime()) / 86_400_000);
  if (diff === 0) return `Today, ${short}`;
  if (diff === -1) return `Yesterday, ${short}`;
  return `${date.toLocaleDateString('en-US', { weekday: 'short' })}, ${short}`;
}

// Logging for another day keeps the current clock time so entries stay in order.
export function timestampOnDay(dateKey: string) {
  const now = new Date();
  const date = fromDateKey(dateKey);
  date.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), 0);
  return date.getTime();
}

export function waterLabel(timestamp: number) {
  const hour = new Date(timestamp).getHours();
  if (hour < 6) return 'Early hydration';
  if (hour < 10) return 'Morning Hydration';
  if (hour < 12) return 'Mid-morning';
  if (hour < 14) return 'With Lunch';
  if (hour < 17) return 'Afternoon';
  if (hour < 20) return 'Evening Drink';
  return 'Night';
}
