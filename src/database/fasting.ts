import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

export type FastingSession = {
  id: string;
  protocol_id: string;
  protocol_name: string;
  kind: 'fast' | 'five_two';
  target_minutes: number | null;
  started_at: number;
  ended_at: number | null;
  state: 'active' | 'paused' | 'completed' | 'cancelled';
  paused_at: number | null;
  paused_duration_ms: number;
  planned_end_at: number | null;
};

const SESSION_COLUMNS =
  'id, protocol_id, protocol_name, kind, target_minutes, started_at, ended_at, state, paused_at, paused_duration_ms, planned_end_at';

export function getActiveFast(db: SQLiteDatabase) {
  return db.getFirstAsync<FastingSession>(
    `SELECT ${SESSION_COLUMNS} FROM fasting_sessions
     WHERE kind = 'fast' AND state IN ('active', 'paused') LIMIT 1`,
  );
}

export function listFastingSessions(db: SQLiteDatabase, limit = 10) {
  return db.getAllAsync<FastingSession>(
    `SELECT ${SESSION_COLUMNS} FROM fasting_sessions ORDER BY started_at DESC LIMIT ?`,
    limit,
  );
}

export function getLastCompletedFast(db: SQLiteDatabase) {
  return db.getFirstAsync<FastingSession>(
    `SELECT ${SESSION_COLUMNS} FROM fasting_sessions
     WHERE kind = 'fast' AND state = 'completed' ORDER BY ended_at DESC LIMIT 1`,
  );
}

export function startFast(db: SQLiteDatabase, protocolId: string, protocolName: string, targetMinutes: number) {
  const now = Date.now();
  return db.runAsync(
    `INSERT INTO fasting_sessions
       (id, protocol_id, protocol_name, kind, target_minutes, started_at, planned_end_at, created_at)
     VALUES (?, ?, ?, 'fast', ?, ?, ?, ?)`,
    randomUUID(),
    protocolId,
    protocolName,
    targetMinutes,
    now,
    now + targetMinutes * 60_000,
    now,
  );
}

export function finishFast(db: SQLiteDatabase, id: string) {
  const now = Date.now();
  return db.runAsync(
    `UPDATE fasting_sessions SET ended_at = ?,
       paused_duration_ms = paused_duration_ms + CASE WHEN paused_at IS NOT NULL THEN ? - paused_at ELSE 0 END,
       state = 'completed', paused_at = NULL
     WHERE id = ? AND kind = ? AND state IN ('active', 'paused')`,
    now,
    now,
    id,
    'fast',
  );
}

export async function finishFastAt(db: SQLiteDatabase, id: string, endedAt: number) {
  const row = await db.getFirstAsync<{ started_at: number; paused_at: number | null }>(
    `SELECT started_at, paused_at FROM fasting_sessions
     WHERE id = ? AND kind = 'fast' AND state IN ('active', 'paused')`,
    id,
  );
  if (!row || endedAt <= row.started_at || endedAt > Date.now()) {
    throw new Error('End time must be after the start and no later than now.');
  }
  const pausedDuration =
    row.paused_at !== null && endedAt > row.paused_at ? endedAt - row.paused_at : 0;
  return db.runAsync(
    `UPDATE fasting_sessions SET ended_at = ?, state = 'completed', paused_at = NULL,
       paused_duration_ms = paused_duration_ms + ?
     WHERE id = ? AND kind = 'fast' AND state IN ('active', 'paused')`,
    endedAt,
    pausedDuration,
    id,
  );
}

export function cancelFast(db: SQLiteDatabase, id: string) {
  const now = Date.now();
  return db.runAsync(
    `UPDATE fasting_sessions SET ended_at = ?,
       paused_duration_ms = paused_duration_ms + CASE WHEN paused_at IS NOT NULL THEN ? - paused_at ELSE 0 END,
       state = 'cancelled', paused_at = NULL
     WHERE id = ? AND kind = ? AND state IN ('active', 'paused')`,
    now,
    now,
    id,
    'fast',
  );
}

export function pauseFast(db: SQLiteDatabase, id: string) {
  return db.runAsync(
    `UPDATE fasting_sessions SET state = 'paused', paused_at = ?
     WHERE id = ? AND kind = ? AND state = 'active'`,
    Date.now(),
    id,
    'fast',
  );
}

export async function resumeFast(db: SQLiteDatabase, id: string) {
  const row = await db.getFirstAsync<{ paused_at: number | null; planned_end_at: number | null }>(
    'SELECT paused_at, planned_end_at FROM fasting_sessions WHERE id = ? AND state = ?',
    id,
    'paused',
  );
  if (!row?.paused_at) throw new Error('This fast is not paused.');
  const now = Date.now();
  const pauseDuration = now - row.paused_at;
  return db.runAsync(
    `UPDATE fasting_sessions
     SET state = 'active', paused_duration_ms = paused_duration_ms + ?, paused_at = NULL,
         planned_end_at = planned_end_at + ?
     WHERE id = ? AND state = 'paused'`,
    pauseDuration,
    pauseDuration,
    id,
  );
}

export function adjustFastTarget(db: SQLiteDatabase, id: string, deltaMinutes: number) {
  if (!Number.isInteger(deltaMinutes) || deltaMinutes === 0) {
    throw new Error('Choose a valid duration adjustment.');
  }
  return db.runAsync(
    `UPDATE fasting_sessions
     SET target_minutes = target_minutes + ?, planned_end_at = planned_end_at + ? * 60000
     WHERE id = ? AND state = 'active'
       AND target_minutes + ? BETWEEN 1 AND 4320`,
    deltaMinutes,
    deltaMinutes,
    id,
    deltaMinutes,
  );
}

export async function editFastStart(db: SQLiteDatabase, id: string, startedAt: number) {
  const row = await db.getFirstAsync<{ planned_end_at: number | null }>(
    'SELECT planned_end_at FROM fasting_sessions WHERE id = ? AND kind = ?',
    id,
    'fast',
  );
  if (!row?.planned_end_at || startedAt >= row.planned_end_at) {
    throw new Error('Start time must be before the planned end time.');
  }
  return db.runAsync(
    `UPDATE fasting_sessions
     SET started_at = ?, target_minutes = MAX(1,
       CAST((planned_end_at - ? - paused_duration_ms) / 60000 AS INTEGER))
     WHERE id = ? AND kind = 'fast'`,
    startedAt,
    startedAt,
    id,
  );
}

export async function editFastPlannedEnd(db: SQLiteDatabase, id: string, plannedEndAt: number) {
  const row = await db.getFirstAsync<{ started_at: number }>(
    `SELECT started_at FROM fasting_sessions
     WHERE id = ? AND kind = 'fast' AND state IN ('active', 'paused')`,
    id,
  );
  if (!row || plannedEndAt <= row.started_at) {
    throw new Error('End time must be after the start time.');
  }
  return db.runAsync(
    `UPDATE fasting_sessions
     SET planned_end_at = ?, target_minutes = MAX(1,
       CAST((? - started_at - paused_duration_ms) / 60000 AS INTEGER))
     WHERE id = ? AND kind = 'fast' AND state IN ('active', 'paused')
       AND ? > started_at`,
    plannedEndAt,
    plannedEndAt,
    id,
    plannedEndAt,
  );
}

export function editCompletedFast(
  db: SQLiteDatabase,
  id: string,
  startedAt: number,
  endedAt: number,
) {
  if (endedAt <= startedAt) throw new Error('End time must be after start time.');
  return db.runAsync(
    `UPDATE fasting_sessions SET started_at = ?, ended_at = ?,
       target_minutes = CAST((? - ?) / 60000 AS INTEGER)
     WHERE id = ? AND kind = 'fast' AND state = 'completed'`,
    startedAt,
    endedAt,
    endedAt,
    startedAt,
    id,
  );
}

export function addFiveTwoCheckin(db: SQLiteDatabase) {
  const now = Date.now();
  return db.runAsync(
    `INSERT INTO fasting_sessions
       (id, protocol_id, protocol_name, kind, target_minutes, started_at, ended_at, created_at)
     VALUES (?, '5:2', '5:2', 'five_two', NULL, ?, ?, ?)`,
    randomUUID(),
    now,
    now,
    now,
  );
}

export function countFiveTwoCheckins(db: SQLiteDatabase, from: number, to: number) {
  return db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count FROM fasting_sessions
     WHERE kind = 'five_two' AND created_at >= ? AND created_at < ?`,
    from,
    to,
  );
}

export function hasFiveTwoCheckin(db: SQLiteDatabase, from: number, to: number) {
  return db.getFirstAsync<{ id: string }>(
    `SELECT id FROM fasting_sessions
     WHERE kind = 'five_two' AND created_at >= ? AND created_at < ? LIMIT 1`,
    from,
    to,
  );
}
