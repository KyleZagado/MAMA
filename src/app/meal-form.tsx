import { useLocalSearchParams } from 'expo-router';
import React from 'react';

import { AuthGate } from '../components/auth-gate';
import { MealForm } from '../screens/meal-form';

export default function MealFormRoute() {
  const { id, date } = useLocalSearchParams<{ id?: string; date?: string }>();
  const dateKey = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
  return (
    <AuthGate>
      {(session) => <MealForm key={id ?? 'new'} session={session} mealId={id} dateKey={dateKey} />}
    </AuthGate>
  );
}
