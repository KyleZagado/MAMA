import type { SQLiteDatabase } from 'expo-sqlite';

export type WorkoutReminderSyncResult = {
  permissionGranted: boolean;
  omitted: number;
  unavailableInExpoGo: boolean;
};

export async function requestWorkoutReminderPermission() {
  return { granted: false, unavailableInExpoGo: false };
}

export async function syncWorkoutReminders(_db: SQLiteDatabase) {
  return {
    permissionGranted: false,
    omitted: 0,
    unavailableInExpoGo: false,
  } satisfies WorkoutReminderSyncResult;
}
