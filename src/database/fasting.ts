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
};

export function getActiveFast(db: SQLiteDatabase) {
  return db.getFirstAsync<FastingSession>(
    `SELECT id, protocol_id, protocol_name, kind, target_minutes, started_at, ended_at
     FROM fasting_sessions WHERE kind = 'fast' AND ended_at IS NULL LIMIT 1`,
  );
}

export function listFastingSessions(db: SQLiteDatabase, limit = 10) {
  return db.getAllAsync<FastingSession>(
    `SELECT id, protocol_id, protocol_name, kind, target_minutes, started_at, ended_at
     FROM fasting_sessions ORDER BY started_at DESC LIMIT ?`,
    limit,
  );
}

export function startFast(db: SQLiteDatabase, protocolId: string, protocolName: string, targetMinutes: number) {
  const now = Date.now();
  return db.runAsync(
    `INSERT INTO fasting_sessions
       (id, protocol_id, protocol_name, kind, target_minutes, started_at, created_at)
     VALUES (?, ?, ?, 'fast', ?, ?, ?)`,
    randomUUID(),
    protocolId,
    protocolName,
    targetMinutes,
    now,
    now,
  );
}

export function finishFast(db: SQLiteDatabase, id: string) {
  return db.runAsync(
    'UPDATE fasting_sessions SET ended_at = ? WHERE id = ? AND kind = ? AND ended_at IS NULL',
    Date.now(),
    id,
    'fast',
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
