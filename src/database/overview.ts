import type { SQLiteDatabase } from 'expo-sqlite';

import { listActivities } from './activities';
import { listMeals, listWater } from './consumption';
import { listWorkoutLogs } from './workouts';
import { listCalendarTodos } from './todos';
import { addDaysToKey, fromDateKey, toDateKey } from '../lib/dates';

export type OverviewActivityType =
  | 'income'
  | 'expense'
  | 'transfer'
  | 'meal'
  | 'water'
  | 'task'
  | 'workout'
  | 'activity'
  | 'fast'
  | 'five_two'
  | 'journal';

export type OverviewActivity = {
  id: string;
  type: OverviewActivityType;
  date: string;
  timestamp: number;
  title: string;
  detail: string;
};

export type OverviewCalendarData = {
  activities: OverviewActivity[];
  monthCounts: Record<string, number>;
};

type TransactionRow = {
  id: string;
  type: 'income' | 'expense' | 'transfer';
  amount_minor: number;
  occurred_at: number;
  description: string | null;
  merchant: string | null;
  wallet_name: string;
  wallet_currency: string;
};

type FastingRow = {
  id: string;
  kind: 'fast' | 'five_two';
  protocol_name: string;
  started_at: number;
  ended_at: number | null;
  state: 'active' | 'paused' | 'completed' | 'cancelled';
  paused_at: number | null;
  target_minutes: number | null;
};

type JournalRow = {
  id: string;
  entry_date: string;
  mood: string | null;
  created_at: number;
};

function localBounds(from: string, through: string) {
  return {
    start: fromDateKey(from).getTime(),
    end: fromDateKey(addDaysToKey(through, 1)).getTime(),
  };
}

function moneyDetail(row: TransactionRow) {
  const amount = (row.amount_minor / 100).toLocaleString(undefined, {
    style: 'currency',
    currency: row.wallet_currency,
  });
  const label = row.type === 'income' ? 'Income' : row.type === 'expense' ? 'Expense' : 'Transfer';
  return `${label} · ${amount} · ${row.wallet_name}`;
}

export async function loadOverviewCalendar(
  db: SQLiteDatabase,
  from: string,
  through: string,
  now = Date.now(),
): Promise<OverviewCalendarData> {
  const bounds = localBounds(from, through);
  const [transactions, meals, water, workouts, activities, tasks, fasting, journal] = await Promise.all([
    db.getAllAsync<TransactionRow>(
      `SELECT t.id, t.type, t.amount_minor, t.occurred_at, t.description, t.merchant,
              a.name AS wallet_name, a.currency AS wallet_currency
       FROM transactions t
       JOIN accounts a ON a.id = t.account_id AND a.deleted_at IS NULL
       WHERE t.deleted_at IS NULL AND t.occurred_at >= ? AND t.occurred_at < ?
       ORDER BY t.occurred_at DESC`,
      bounds.start,
      bounds.end,
    ),
    listMeals(db, bounds.start, bounds.end),
    listWater(db, bounds.start, bounds.end),
    listWorkoutLogs(db, from, through),
    listActivities(db, from, through),
    listCalendarTodos(db, from, through),
    db.getAllAsync<FastingRow>(
      `SELECT id, kind, protocol_name, started_at, ended_at, state, paused_at, target_minutes
       FROM fasting_sessions
       WHERE (kind = 'five_two' AND started_at >= ? AND started_at < ?)
          OR (kind = 'fast' AND started_at < ? AND COALESCE(ended_at, paused_at, ?) > ?)
       ORDER BY started_at DESC`,
      bounds.start,
      bounds.end,
      bounds.end,
      now,
      bounds.start,
    ),
    db.getAllAsync<JournalRow>(
      `SELECT id, entry_date, mood, created_at
       FROM journal_entries WHERE entry_date >= ? AND entry_date <= ?
       ORDER BY entry_date`,
      from,
      through,
    ),
  ]);

  const entries: OverviewActivity[] = [
    ...transactions.map((row) => ({
      id: `transaction:${row.id}`,
      type: row.type,
      date: toDateKey(new Date(row.occurred_at)),
      timestamp: row.occurred_at,
      title: row.merchant || row.description || (row.type === 'income' ? 'Income' : row.type === 'expense' ? 'Expense' : 'Transfer'),
      detail: moneyDetail(row),
    })),
    ...meals.map((meal) => ({
      id: `meal:${meal.id}`,
      type: 'meal' as const,
      date: toDateKey(new Date(meal.eaten_at)),
      timestamp: meal.eaten_at,
      title: meal.name,
      detail: `${meal.meal_type[0].toUpperCase()}${meal.meal_type.slice(1)}${meal.notes ? ` · ${meal.notes}` : ''}`,
    })),
    ...water.map((item) => ({
      id: `water:${item.id}`,
      type: 'water' as const,
      date: toDateKey(new Date(item.logged_at)),
      timestamp: item.logged_at,
      title: 'Water',
      detail: `${item.amount_ml} ml`,
    })),
    ...workouts.map((workout) => ({
      id: `workout:${workout.id}`,
      type: 'workout' as const,
      date: workout.log_date,
      timestamp: workout.created_at,
      title: workout.exercise_name,
      detail: workout.duration_min
        ? `${workout.muscle_group} · ${workout.duration_min} min`
        : `${workout.muscle_group} · ${workout.sets ?? 1} × ${workout.reps ?? 1}${workout.weight_kg ? ` · ${workout.weight_kg} kg` : ''}`,
    })),
    ...activities.map((activity) => ({
      id: `activity:${activity.id}`,
      type: 'activity' as const,
      date: activity.log_date,
      timestamp: activity.started_at,
      title: `${activity.type[0].toUpperCase()}${activity.type.slice(1)}`,
      detail: `${(activity.distance_m / 1000).toFixed(2)} km · ${Math.round(activity.duration_s / 60)} min · ${activity.calories} kcal`,
    })),
    ...tasks.map((task) => ({
      id: `task:${task.calendarKey}`,
      type: 'task' as const,
      date: task.due_date,
      timestamp: task.start_time
        ? new Date(`${task.due_date}T${task.start_time}:00`).getTime()
        : task.completed_at ?? fromDateKey(task.due_date).getTime(),
      title: task.title,
      detail: `${task.status === 'done' ? 'Completed' : task.status === 'in_progress' ? 'In progress' : 'To do'}${task.category ? ` · ${task.category}` : ''}${task.repeating ? ' · Repeating' : ''}`,
    })),
    ...fasting.flatMap((entry) => {
      if (entry.kind === 'five_two') {
        return [{
          id: `fasting:${entry.id}`,
          type: 'five_two' as const,
          date: toDateKey(new Date(entry.started_at)),
          timestamp: entry.started_at,
          title: '5:2 reduced-intake day',
          detail: 'Fasting tracker',
        }];
      }
      const fastEnd = entry.ended_at ?? (entry.state === 'paused' ? entry.paused_at : now) ?? now;
      const days: OverviewActivity[] = [];
      const firstDay = toDateKey(new Date(Math.max(entry.started_at, bounds.start)));
      const lastDay = toDateKey(new Date(Math.min(fastEnd, bounds.end - 1)));
      for (let date = firstDay; date <= lastDay; date = addDaysToKey(date, 1)) {
        const dayStart = fromDateKey(date).getTime();
        const dayEnd = fromDateKey(addDaysToKey(date, 1)).getTime();
        const segmentStart = Math.max(entry.started_at, dayStart);
        const segmentEnd = Math.min(fastEnd, dayEnd);
        const duration = Math.max(0, Math.floor((segmentEnd - segmentStart) / 60_000));
        days.push({
          id: `fasting:${entry.id}:${date}`,
          type: 'fast',
          date,
          timestamp: segmentStart,
          title: entry.state === 'cancelled' ? `${entry.protocol_name} fast · cancelled` : `${entry.protocol_name} fast`,
          detail: `${duration >= 60 ? `${Math.floor(duration / 60)} hr ` : ''}${duration % 60} min${entry.target_minutes ? ` · ${Math.round((duration / entry.target_minutes) * 100)}% of goal` : ''}`,
        });
      }
      return days;
    }),
    ...journal.map((entry) => {
      const mood = entry.mood ? ` · ${entry.mood[0].toUpperCase()}${entry.mood.slice(1)}` : '';
      return {
        id: `journal:${entry.id}`,
        type: 'journal' as const,
        date: entry.entry_date,
        timestamp: entry.created_at,
        title: 'Journal entry',
        detail: `Daily Journal${mood}`,
      };
    }),
  ];

  entries.sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
  const monthCounts: Record<string, number> = {};
  for (const entry of entries) {
    monthCounts[entry.date] = (monthCounts[entry.date] ?? 0) + 1;
  }
  return { activities: entries, monthCounts };
}
