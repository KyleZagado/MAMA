import type { SQLiteDatabase } from 'expo-sqlite';

export type WorkoutReminderSyncResult = {
  permissionGranted: boolean;
  omitted: number;
};

export async function requestWorkoutReminderPermission() {
  return false;
}

export async function syncWorkoutReminders(_db: SQLiteDatabase) {
  return { permissionGranted: false, omitted: 0 } satisfies WorkoutReminderSyncResult;
}
