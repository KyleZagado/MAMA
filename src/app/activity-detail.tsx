import { useLocalSearchParams } from 'expo-router';
import React from 'react';

import { AuthGate } from '../components/auth-gate';
import { ActivityDetail } from '../screens/activity-detail';

export default function ActivityDetailRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <AuthGate>{(session) => <ActivityDetail session={session} activityId={id} />}</AuthGate>;
}
