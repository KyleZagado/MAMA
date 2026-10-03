import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { addDaysToKey, fromDateKey } from '../lib/dates';

export type WorkoutScheduleStatus = 'scheduled' | 'skipped' | 'completed';
export type WorkoutScheduleKind = 'workout' | 'rest';

export type WorkoutScheduleInstance = {
  id: string;
  occurrenceDate: string;
  scheduledDate: string;
  title: string;
  kind: WorkoutScheduleKind;
  startTime: string | null;
  durationMin: number | null;
  reminderMinutes: number | null;
  status: WorkoutScheduleStatus;
  isRecurring: boolean;
};

type ScheduleRow = {
  id: string;
  title: string;
  kind: WorkoutScheduleKind;
  scheduled_date: string;
  start_time: string | null;
  duration_min: number | null;
  recurrence_days: string | null;
  reminder_minutes: number | null;
  status: WorkoutScheduleStatus;
};

type OccurrenceOverride = {
  schedule_id: string;
  original_date: string;
  scheduled_date: string;
  status: WorkoutScheduleStatus;
};

type ScheduleInput = {
  title: string;
  kind: WorkoutScheduleKind;
  scheduledDate: string;
  startTime: string | null;
  durationMin: number | null;
  recurrenceDays: number[] | null;
  reminderMinutes: number | null;
};

function scheduleInstance(
  row: ScheduleRow,
  occurrenceDate: string,
  scheduledDate: string,
  status: WorkoutScheduleStatus,
  isRecurring: boolean,
): WorkoutScheduleInstance {
  return {
    id: `${row.id}:${occurrenceDate}`,
    occurrenceDate,
    scheduledDate,
    title: row.title,
    kind: row.kind,
    startTime: row.start_time,
    durationMin: row.duration_min,
    reminderMinutes: row.reminder_minutes,
    status,
    isRecurring,
  };
}

function parseWeekdays(value: string) {
  const parsed: unknown = JSON.parse(value);
  if (
    !Array.isArray(parsed) ||
    parsed.length === 0 ||
    parsed.some((day) => !Number.isInteger(day) || day < 0 || day > 6)
  ) {
    throw new Error('A recurring workout has an invalid weekday schedule.');
  }
  return new Set<number>(parsed);
}

export async function listWorkoutScheduleInstances(
  db: SQLiteDatabase,
  fromDate: string,
  toDate: string,
) {
  const [singleSchedules, recurringSchedules] = await Promise.all([
    db.getAllAsync<ScheduleRow>(
      `SELECT id, title, kind, scheduled_date, start_time, duration_min, recurrence_days,
              reminder_minutes, status
       FROM workout_schedules
       WHERE deleted_at IS NULL AND recurrence_days IS NULL
         AND scheduled_date BETWEEN ? AND ?`,
      fromDate,
      toDate,
    ),
    db.getAllAsync<ScheduleRow>(
      `SELECT id, title, kind, scheduled_date, start_time, duration_min, recurrence_days,
              reminder_minutes, status
       FROM workout_schedules
       WHERE deleted_at IS NULL AND recurrence_days IS NOT NULL
         AND scheduled_date <= ?`,
      toDate,
    ),
  ]);

  const instances = singleSchedules.map((row) =>
    scheduleInstance(row, row.scheduled_date, row.scheduled_date, row.status, false),
  );
  if (recurringSchedules.length === 0) {
    return instances.sort(
      (a, b) =>
        a.scheduledDate.localeCompare(b.scheduledDate) ||
        (a.startTime ?? '').localeCompare(b.startTime ?? '') ||
        a.title.localeCompare(b.title),
    );
  }

  const placeholders = recurringSchedules.map(() => '?').join(', ');
  const overrides = await db.getAllAsync<OccurrenceOverride>(
    `SELECT schedule_id, original_date, scheduled_date, status
     FROM workout_schedule_occurrences
     WHERE schedule_id IN (${placeholders})`,
    ...recurringSchedules.map((row) => row.id),
  );
  const overridesByOccurrence = new Map(
    overrides.map((override) => [`${override.schedule_id}:${override.original_date}`, override]),
  );
  const generated = new Set<string>();

  for (const row of recurringSchedules) {
    const weekdays = parseWeekdays(row.recurrence_days!);
    const firstDate = row.scheduled_date < fromDate ? fromDate : row.scheduled_date;
    for (
      let date = firstDate;
      date <= toDate;
      date = addDaysToKey(date, 1)
    ) {
      if (!weekdays.has(fromDateKey(date).getDay())) continue;
      const key = `${row.id}:${date}`;
      generated.add(key);
      const override = overridesByOccurrence.get(key);
      const scheduledDate = override?.scheduled_date ?? date;
      if (scheduledDate < fromDate || scheduledDate > toDate) continue;
      instances.push(
        scheduleInstance(row, date, scheduledDate, override?.status ?? 'scheduled', true),
      );
    }

    for (const override of overrides) {
      if (
        override.schedule_id === row.id &&
        !generated.has(`${row.id}:${override.original_date}`) &&
        override.scheduled_date >= fromDate &&
        override.scheduled_date <= toDate
      ) {
        instances.push(scheduleInstance(row, override.original_date, override.scheduled_date, override.status, true));
      }
    }
  }

  return instances.sort(
    (a, b) =>
      a.scheduledDate.localeCompare(b.scheduledDate) ||
      (a.startTime ?? '').localeCompare(b.startTime ?? '') ||
      a.title.localeCompare(b.title),
  );
}

export async function addWorkoutSchedule(db: SQLiteDatabase, input: ScheduleInput) {
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO workout_schedules
       (id, title, kind, scheduled_date, start_time, duration_min, recurrence_days,
        reminder_minutes, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?)`,
    randomUUID(),
    input.title,
    input.kind,
    input.scheduledDate,
    input.startTime,
    input.durationMin,
    input.recurrenceDays ? JSON.stringify(input.recurrenceDays) : null,
    input.reminderMinutes,
    now,
    now,
  );
}

export async function updateWorkoutScheduleOccurrence(
  db: SQLiteDatabase,
  instance: WorkoutScheduleInstance,
  patch: { scheduledDate?: string; status?: WorkoutScheduleStatus },
) {
  const [scheduleId] = instance.id.split(':');
  if (!scheduleId) throw new Error('The scheduled workout could not be identified.');

  if (!instance.isRecurring) {
    const updates: string[] = [];
    const values: (string | number)[] = [];
    if (patch.scheduledDate !== undefined) {
      updates.push('scheduled_date = ?');
      values.push(patch.scheduledDate);
    }
    if (patch.status !== undefined) {
      updates.push('status = ?');
      values.push(patch.status);
    }
    if (updates.length === 0) return;
    updates.push('updated_at = ?');
    values.push(Date.now(), scheduleId);
    await db.runAsync(
      `UPDATE workout_schedules SET ${updates.join(', ')} WHERE id = ? AND deleted_at IS NULL`,
      ...values,
    );
    return;
  }

  const scheduledDate = patch.scheduledDate ?? instance.scheduledDate;
  const status = patch.status ?? instance.status;
  await db.runAsync(
    `INSERT INTO workout_schedule_occurrences (schedule_id, original_date, scheduled_date, status)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(schedule_id, original_date) DO UPDATE SET
       scheduled_date = excluded.scheduled_date,
       status = excluded.status`,
    scheduleId,
    instance.occurrenceDate,
    scheduledDate,
    status,
  );
}

export function deleteWorkoutSchedule(db: SQLiteDatabase, scheduleId: string) {
  const now = Date.now();
  return db.runAsync(
    'UPDATE workout_schedules SET deleted_at = ?, updated_at = ? WHERE id = ?',
    now,
    now,
    scheduleId,
  );
}
