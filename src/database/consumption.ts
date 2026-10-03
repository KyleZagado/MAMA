import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

export const GLASS_ML = 250;
export const DEFAULT_GOAL_GLASSES = 8;
const GOAL_KEY = 'water_goal_glasses';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export type MealItem = {
  id: string;
  meal_type: MealType;
  name: string;
  notes: string | null;
  photo: string | null;
  eaten_at: number;
};

export type WaterItem = { id: string; amount_ml: number; logged_at: number };

export function listMeals(db: SQLiteDatabase, start: number, end: number) {
  return db.getAllAsync<MealItem>(
    `SELECT id, meal_type, name, notes, photo, eaten_at FROM meals
     WHERE deleted_at IS NULL AND eaten_at >= ? AND eaten_at < ? ORDER BY eaten_at ASC`,
    start,
    end,
  );
}

export function getMeal(db: SQLiteDatabase, id: string) {
  return db.getFirstAsync<MealItem>(
    'SELECT id, meal_type, name, notes, photo, eaten_at FROM meals WHERE id = ? AND deleted_at IS NULL',
    id,
  );
}

type MealInput = {
  id?: string;
  mealType: MealType;
  name: string;
  notes: string;
  photo: string | null;
  eatenAt: number;
};

export async function saveMeal(db: SQLiteDatabase, input: MealInput) {
  const now = Date.now();
  const notes = input.notes || null;
  if (input.id) {
    await db.runAsync(
      'UPDATE meals SET meal_type = ?, name = ?, notes = ?, photo = ?, eaten_at = ?, updated_at = ? WHERE id = ?',
      input.mealType,
      input.name,
      notes,
      input.photo,
      input.eatenAt,
      now,
      input.id,
    );
    return;
  }
  await db.runAsync(
    `INSERT INTO meals (id, meal_type, name, notes, photo, eaten_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    randomUUID(),
    input.mealType,
    input.name,
    notes,
    input.photo,
    input.eatenAt,
    now,
    now,
  );
}

export function deleteMeal(db: SQLiteDatabase, id: string) {
  const now = Date.now();
  return db.runAsync('UPDATE meals SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, id);
}

export function listWater(db: SQLiteDatabase, start: number, end: number) {
  return db.getAllAsync<WaterItem>(
    `SELECT id, amount_ml, logged_at FROM water_entries
     WHERE deleted_at IS NULL AND logged_at >= ? AND logged_at < ? ORDER BY logged_at ASC`,
    start,
    end,
  );
}

export function addWater(db: SQLiteDatabase, amountMl: number, loggedAt: number) {
  const now = Date.now();
  return db.runAsync(
    'INSERT INTO water_entries (id, amount_ml, logged_at, created_at) VALUES (?, ?, ?, ?)',
    randomUUID(),
    amountMl,
    loggedAt,
    now,
  );
}

export function deleteWater(db: SQLiteDatabase, id: string) {
  return db.runAsync('UPDATE water_entries SET deleted_at = ? WHERE id = ?', Date.now(), id);
}

export async function getWaterGoalGlasses(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', GOAL_KEY);
  const value = row ? Number(row.value) : DEFAULT_GOAL_GLASSES;
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_GOAL_GLASSES;
}

export function setWaterGoalGlasses(db: SQLiteDatabase, glasses: number) {
  return db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    GOAL_KEY,
    String(glasses),
  );
}
