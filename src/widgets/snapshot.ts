import type { Session } from '@supabase/supabase-js';

import { DEFAULT_CURRENCY, isCurrencyCode } from '../constants/currencies';
import { getDatabase } from '../database';
import { GLASS_ML, getWaterGoalGlasses, listWater } from '../database/consumption';
import { getSavingsGoal, listWallets } from '../database/finance';
import { listTodos } from '../database/todos';
import { toDateKey, formatTimeKey } from '../lib/dates';
import { dayBounds } from '../lib/dates-day';
import { formatMoney } from '../lib/money';

// Everything a home screen widget shows, already formatted. Widgets run outside the app,
// so they only render this plain data.
export type WidgetSnapshot = {
  signedIn: boolean;
  balance: string;
  goalPercent: number | null;
  tasksLeft: number;
  tasksTotal: number;
  nextTasks: { title: string; time: string | null }[];
  waterGlasses: number;
  waterGoal: number;
};

export const SIGNED_OUT_SNAPSHOT: WidgetSnapshot = {
  signedIn: false,
  balance: '',
  goalPercent: null,
  tasksLeft: 0,
  tasksTotal: 0,
  nextTasks: [],
  waterGlasses: 0,
  waterGoal: 8,
};

const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

export async function buildSnapshot(session: Session): Promise<WidgetSnapshot> {
  const db = await getDatabase(session.user.id);
  const todayKey = toDateKey(new Date());
  const day = dayBounds(todayKey);
  const currencyValue = session.user.user_metadata?.currency;
  const currency =
    typeof currencyValue === 'string' && isCurrencyCode(currencyValue) ? currencyValue : DEFAULT_CURRENCY;

  const [wallets, goalMinor, todos, water, goalGlasses] = await Promise.all([
    listWallets(db),
    getSavingsGoal(db),
    listTodos(db),
    listWater(db, day.start, day.end),
    getWaterGoalGlasses(db),
  ]);

  const totalMinor = wallets.reduce((sum, wallet) => sum + wallet.balance_minor, 0);
  const today = todos.filter(
    (todo) => todo.due_date === todayKey || (todo.due_date < todayKey && todo.status !== 'done'),
  );
  const pending = today
    .filter((todo) => todo.status !== 'done')
    .sort(
      (a, b) =>
        (a.due_time ?? a.start_time ?? '99:99').localeCompare(b.due_time ?? b.start_time ?? '99:99') ||
        (PRIORITY_RANK[a.priority] ?? 3) - (PRIORITY_RANK[b.priority] ?? 3),
    );
  const waterMl = water.reduce((sum, entry) => sum + entry.amount_ml, 0);

  return {
    signedIn: true,
    balance: formatMoney(totalMinor, { currency, compact: true }),
    goalPercent: goalMinor ? Math.max(0, Math.min(100, Math.round((totalMinor / goalMinor) * 100))) : null,
    tasksLeft: pending.length,
    tasksTotal: today.length,
    nextTasks: pending.slice(0, 2).map((todo) => {
      const time = todo.due_time ?? todo.start_time;
      return { title: todo.title, time: time ? formatTimeKey(time) : null };
    }),
    waterGlasses: Math.round((waterMl / GLASS_ML) * 10) / 10,
    waterGoal: goalGlasses,
  };
}
