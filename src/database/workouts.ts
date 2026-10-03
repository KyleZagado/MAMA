import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

export type WorkoutLog = {
  id: string;
  exercise_id: string;
  exercise_name: string;
  muscle_group: string;
  log_date: string;
  sets: number | null;
  reps: number | null;
  weight_kg: number | null;
  duration_min: number | null;
  created_at: number;
};

export function listWorkoutLogs(db: SQLiteDatabase, fromDate: string, toDate: string) {
  return db.getAllAsync<WorkoutLog>(
    `SELECT id, exercise_id, exercise_name, muscle_group, log_date, sets, reps, weight_kg, duration_min, created_at
     FROM workout_logs WHERE deleted_at IS NULL AND log_date >= ? AND log_date <= ?
     ORDER BY log_date ASC, created_at ASC`,
    fromDate,
    toDate,
  );
}

export function getLastLog(db: SQLiteDatabase, exerciseId: string) {
  return db.getFirstAsync<WorkoutLog>(
    `SELECT id, exercise_id, exercise_name, muscle_group, log_date, sets, reps, weight_kg, duration_min, created_at
     FROM workout_logs WHERE deleted_at IS NULL AND exercise_id = ?
     ORDER BY log_date DESC, created_at DESC LIMIT 1`,
    exerciseId,
  );
}

type LogInput = {
  exerciseId: string;
  exerciseName: string;
  muscleGroup: string;
  date: string;
  sets: number | null;
  reps: number | null;
  weightKg: number | null;
  durationMin: number | null;
};

export function addWorkoutLog(db: SQLiteDatabase, input: LogInput) {
  return db.runAsync(
    `INSERT INTO workout_logs
       (id, exercise_id, exercise_name, muscle_group, log_date, sets, reps, weight_kg, duration_min, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    randomUUID(),
    input.exerciseId,
    input.exerciseName,
    input.muscleGroup,
    input.date,
    input.sets,
    input.reps,
    input.weightKg,
    input.durationMin,
    Date.now(),
  );
}

export function deleteWorkoutLog(db: SQLiteDatabase, id: string) {
  return db.runAsync('UPDATE workout_logs SET deleted_at = ? WHERE id = ?', Date.now(), id);
}
