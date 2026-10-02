import { Redirect } from 'expo-router';
import React from 'react';

import { Dashboard } from '../screens/dashboard';
import { useAuth } from '../providers/auth-provider';

export default function DashboardRoute() {
  const { session, isLoading } = useAuth();

  if (isLoading) return null;
  if (!session) return <Redirect href="/sign-in" />;

  return <Dashboard session={session} />;
}
