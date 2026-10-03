import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { ActivityType, RoutePoint } from '../lib/activity';

export type ActivityRow = {
  id: string;
  type: ActivityType;
  log_date: string;
  started_at: number;
  duration_s: number;
  distance_m: number;
  steps: number | null;
  calories: number;
  route: string | null;
};

const COLUMNS = 'id, type, log_date, started_at, duration_s, distance_m, steps, calories, route';

export function listActivities(db: SQLiteDatabase, fromDate: string, toDate: string) {
  return db.getAllAsync<ActivityRow>(
    `SELECT ${COLUMNS} FROM activities
     WHERE deleted_at IS NULL AND log_date >= ? AND log_date <= ? ORDER BY started_at ASC`,
    fromDate,
    toDate,
  );
}

export function getActivity(db: SQLiteDatabase, id: string) {
  return db.getFirstAsync<ActivityRow>(
    `SELECT ${COLUMNS} FROM activities WHERE id = ? AND deleted_at IS NULL`,
    id,
  );
}

type ActivityInput = {
  type: ActivityType;
  logDate: string;
  startedAt: number;
  durationS: number;
  distanceM: number;
  steps: number | null;
  calories: number;
  route: RoutePoint[];
};

export function saveActivity(db: SQLiteDatabase, input: ActivityInput) {
  const route = JSON.stringify(
    input.route.map((p) => [Number(p.latitude.toFixed(5)), Number(p.longitude.toFixed(5))]),
  );
  return db.runAsync(
    `INSERT INTO activities
       (id, type, log_date, started_at, duration_s, distance_m, steps, calories, route, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    randomUUID(),
    input.type,
    input.logDate,
    input.startedAt,
    Math.round(input.durationS),
    input.distanceM,
    input.steps,
    input.calories,
    route,
    Date.now(),
  );
}

export function deleteActivity(db: SQLiteDatabase, id: string) {
  return db.runAsync('UPDATE activities SET deleted_at = ? WHERE id = ?', Date.now(), id);
}

export function parseRoute(route: string | null): RoutePoint[] {
  if (!route) return [];
  try {
    const raw: unknown = JSON.parse(route);
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((p): p is [number, number] => Array.isArray(p) && typeof p[0] === 'number' && typeof p[1] === 'number')
      .map(([latitude, longitude]) => ({ latitude, longitude }));
  } catch {
    return [];
  }
}
