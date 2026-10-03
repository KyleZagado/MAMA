import { addDaysToKey, fromDateKey, toDateKey } from './dates';

export type TaskRepeat = { frequency: 'daily' | 'weekly' | 'monthly'; weekdays: number[] };
export type CalendarView = 'month' | 'week' | 'day' | 'agenda' | 'timeline' | 'year';

export function decodeTaskRepeat(value: string | null): TaskRepeat | null {
  if (!value) return null;
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || !('frequency' in parsed) ||
      !['daily', 'weekly', 'monthly'].includes(String(parsed.frequency)) ||
      !('weekdays' in parsed) || !Array.isArray(parsed.weekdays) ||
      !parsed.weekdays.every((day) => Number.isInteger(day) && day >= 0 && day <= 6) ||
      (parsed.frequency === 'weekly' && !parsed.weekdays.length)) {
    throw new Error('Choose a valid repeat schedule and at least one weekday for weekly tasks.');
  }
  const frequency = parsed.frequency;
  if (frequency !== 'daily' && frequency !== 'weekly' && frequency !== 'monthly') throw new Error('Invalid repeat schedule.');
  return { frequency, weekdays: [...new Set<number>(parsed.weekdays)] };
}

export function taskRepeatDates(start: string, repeat: TaskRepeat, from: string, through: string) {
  decodeTaskRepeat(JSON.stringify(repeat));
  const lower = from > start ? from : start;
  const result: string[] = [];
  const anchor = fromDateKey(start);
  for (let date = lower; date <= through; date = addDaysToKey(date, 1)) {
    const current = fromDateKey(date);
    if (repeat.frequency === 'daily' ||
        (repeat.frequency === 'weekly' && repeat.weekdays.includes(current.getDay())) ||
        (repeat.frequency === 'monthly' && current.getDate() === Math.min(anchor.getDate(),
          new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate()))) result.push(date);
  }
  return result;
}

export function calendarRange(date: string, view: CalendarView) {
  const selected = fromDateKey(date);
  if (view === 'year') return {
    from: toDateKey(new Date(selected.getFullYear(), 0, 1)),
    through: toDateKey(new Date(selected.getFullYear(), 11, 31)),
  };
  if (view === 'month') {
    const first = new Date(selected.getFullYear(), selected.getMonth(), 1);
    const from = addDaysToKey(toDateKey(first), -first.getDay());
    return { from, through: addDaysToKey(from, 41) };
  }
  if (view === 'week') {
    const from = addDaysToKey(date, -selected.getDay());
    return { from, through: addDaysToKey(from, 6) };
  }
  if (view === 'agenda') return { from: date, through: addDaysToKey(date, 30) };
  return { from: date, through: date };
}

export function shiftCalendar(date: string, view: CalendarView, direction: number) {
  const current = fromDateKey(date);
  if (view === 'month' || view === 'year') {
    const year = current.getFullYear() + (view === 'year' ? direction : 0);
    const month = current.getMonth() + (view === 'month' ? direction : 0);
    const last = new Date(year, month + 1, 0).getDate();
    return toDateKey(new Date(year, month, Math.min(current.getDate(), last)));
  }
  return addDaysToKey(date, direction * (view === 'week' ? 7 : view === 'agenda' ? 30 : 1));
}

export function minutesOf(time: string) {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export function clockAt(minutes: number) {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1439) throw new Error('Task time must be within this day.');
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function movedTaskTimes(start: string | null, end: string | null, due: string | null, next: string) {
  const nextMinute = minutesOf(next);
  const original = start ?? due;
  const duration = start && end ? minutesOf(end) - minutesOf(start) : 30;
  const endMinute = nextMinute + duration;
  if (duration <= 0 || endMinute > 1439) throw new Error('This duration would extend beyond the day. Choose an earlier time.');
  const delta = nextMinute - (original ? minutesOf(original) : nextMinute);
  const dueMinute = due ? minutesOf(due) + delta : endMinute;
  if (dueMinute < 0 || dueMinute > 1439) throw new Error('The shifted due time would leave this day.');
  return { startTime: next, endTime: clockAt(endMinute), dueTime: clockAt(dueMinute), allDay: false };
}

export function resizedTaskEnd(start: string, end: string | null, deltaY: number, pixelsPerMinute: number) {
  const initial = end ? minutesOf(end) : minutesOf(start) + 30;
  const next = Math.round((initial + deltaY / pixelsPerMinute) / 15) * 15;
  const earliestEnd = Math.min(1439, minutesOf(start) + 15);
  return clockAt(Math.max(earliestEnd, Math.min(1439, next)));
}
