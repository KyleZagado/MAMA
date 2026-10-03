import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { getDatabase } from '../database';
import { listWorkoutLogs, type WorkoutLog } from '../database/workouts';

// monthKey is 'YYYY-MM'; ISO date strings sort correctly, so a month is the range -01 to -31.
export function useWorkouts(userId: string, monthKey: string) {
  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const db = await getDatabase(userId);
      setLogs(await listWorkoutLogs(db, `${monthKey}-01`, `${monthKey}-31`));
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load your workouts.');
    }
  }, [userId, monthKey]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  return { logs, error, reload };
}
