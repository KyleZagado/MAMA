import { useLocalSearchParams } from 'expo-router';
import React from 'react';

import { AuthGate } from '../components/auth-gate';
import { Water } from '../screens/water';
import { toDateKey } from '../lib/dates';

export default function WaterRoute() {
  const { date } = useLocalSearchParams<{ date?: string }>();
  const dateKey = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : toDateKey(new Date());
  return <AuthGate>{(session) => <Water session={session} dateKey={dateKey} />}</AuthGate>;
}
