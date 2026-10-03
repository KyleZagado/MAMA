import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { getDatabase } from '../database';
import {
  getWaterGoalGlasses,
  listMeals,
  listWater,
  DEFAULT_GOAL_GLASSES,
  type MealItem,
  type WaterItem,
} from '../database/consumption';
import { addDaysToKey, fromDateKey, toDateKey } from '../lib/dates';
import { dayBounds, weekStartKey } from '../lib/dates-day';

export type Consumption = {
  meals: MealItem[];
  water: WaterItem[];
  weekMl: number[];
  goalGlasses: number;
};

const EMPTY: Consumption = {
  meals: [],
  water: [],
  weekMl: [0, 0, 0, 0, 0, 0, 0],
  goalGlasses: DEFAULT_GOAL_GLASSES,
};

// Loads the meals and water for one day, plus the Monday-to-Sunday totals for its week.
export function useConsumption(userId: string, dateKey: string) {
  const [data, setData] = useState<Consumption>(EMPTY);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const db = await getDatabase(userId);
      const weekStart = weekStartKey(dateKey);
      const day = dayBounds(dateKey);
      const weekRange = { start: dayBounds(weekStart).start, end: dayBounds(addDaysToKey(weekStart, 6)).end };
      const [meals, weekWater, goalGlasses] = await Promise.all([
        listMeals(db, day.start, day.end),
        listWater(db, weekRange.start, weekRange.end),
        getWaterGoalGlasses(db),
      ]);
      const weekMl = [0, 0, 0, 0, 0, 0, 0];
      for (const entry of weekWater) {
        const index = Math.round(
          (fromDateKey(toDateKey(new Date(entry.logged_at))).getTime() - fromDateKey(weekStart).getTime()) /
            86_400_000,
        );
        if (index >= 0 && index < 7) weekMl[index] += entry.amount_ml;
      }
      setData({
        meals,
        water: weekWater.filter((w) => w.logged_at >= day.start && w.logged_at < day.end),
        weekMl,
        goalGlasses,
      });
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load your data.');
    } finally {
      setIsLoading(false);
    }
  }, [userId, dateKey]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  return { ...data, isLoading, error, reload };
}
