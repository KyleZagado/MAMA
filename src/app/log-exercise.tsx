import { useLocalSearchParams } from 'expo-router';
import React from 'react';

import { AuthGate } from '../components/auth-gate';
import { toDateKey } from '../lib/dates';
import { LogExercise } from '../screens/log-exercise';

export default function LogExerciseRoute() {
  const { exercise, date } = useLocalSearchParams<{ exercise?: string; date?: string }>();
  const dateKey = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : toDateKey(new Date());
  return <AuthGate>{(session) => <LogExercise session={session} exerciseId={exercise} dateKey={dateKey} />}</AuthGate>;
}
