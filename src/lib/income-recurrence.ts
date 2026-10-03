import { addDaysToKey, fromDateKey, toDateKey } from './dates';

export const INCOME_FREQUENCIES = [
  { id: 'weekly', label: 'Weekly' },
  { id: 'biweekly', label: 'Every 2 weeks' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'semimonthly', label: 'Twice a month' },
  { id: 'annual', label: 'Annually' },
] as const;

export type IncomeFrequency = (typeof INCOME_FREQUENCIES)[number]['id'];
export type IncomeRecurrence = {
  frequency: IncomeFrequency;
  startDate: string;
  monthDays: number[];
};

export function validateIncomeRecurrence(input: IncomeRecurrence) {
  const date = fromDateKey(input.startDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate) ||
      !Number.isFinite(date.getTime()) || toDateKey(date) !== input.startDate) {
    throw new Error('Choose a valid start date.');
  }
  if (!INCOME_FREQUENCIES.some((item) => item.id === input.frequency)) {
    throw new Error('Choose a supported pay schedule.');
  }
  const count = input.frequency === 'semimonthly' ? 2 : input.frequency === 'monthly' ? 1 : 0;
  if (input.monthDays.length !== count ||
      input.monthDays.some((day) => !Number.isInteger(day) || day < 1 || day > 31) ||
      new Set(input.monthDays).size !== count) {
    throw new Error('Choose distinct pay days from 1 to 31.');
  }
  if (input.frequency === 'semimonthly' && input.monthDays.every((day) => day >= 28)) {
    throw new Error('These pay days overlap in February. Use two monthly schedules to keep both payments.');
  }
}

function clampedDate(year: number, month: number, day: number) {
  return toDateKey(new Date(year, month, Math.min(day, new Date(year, month + 1, 0).getDate())));
}

export function incomeDates(input: IncomeRecurrence, from: string, through: string): string[] {
  validateIncomeRecurrence(input);
  const lower = from > input.startDate ? from : input.startDate;
  if (lower > through) return [];
  const dates = new Set<string>();
  const start = fromDateKey(input.startDate);
  if (input.frequency === 'weekly' || input.frequency === 'biweekly') {
    const interval = input.frequency === 'weekly' ? 7 : 14;
    // UTC calendar-day arithmetic avoids DST shifting the weekly anchor.
    const ordinal = (key: string) => {
      const date = fromDateKey(key);
      return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
    };
    let next = addDaysToKey(input.startDate,
      Math.max(0, Math.ceil((ordinal(lower) - ordinal(input.startDate)) / interval)) * interval);
    while (next <= through) {
      dates.add(next);
      next = addDaysToKey(next, interval);
    }
  } else if (input.frequency === 'annual') {
    for (let year = fromDateKey(lower).getFullYear(); year <= fromDateKey(through).getFullYear(); year++) {
      dates.add(clampedDate(year, start.getMonth(), start.getDate()));
    }
  } else {
    const month = fromDateKey(lower);
    month.setDate(1);
    while (toDateKey(month) <= through) {
      for (const day of input.monthDays) {
        dates.add(clampedDate(month.getFullYear(), month.getMonth(), day));
      }
      month.setMonth(month.getMonth() + 1);
    }
  }
  return [...dates].filter((date) => date >= lower && date <= through).sort();
}

export function incomePeriod(month: Date, annual = false) {
  const start = new Date(month.getFullYear(), annual ? 0 : month.getMonth(), 1);
  const end = annual
    ? new Date(month.getFullYear() + 1, 0, 1)
    : new Date(month.getFullYear(), month.getMonth() + 1, 1);
  return { startAt: start.getTime(), endAt: end.getTime(), from: toDateKey(start), through: addDaysToKey(toDateKey(end), -1) };
}
