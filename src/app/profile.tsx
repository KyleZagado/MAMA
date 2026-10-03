import { Redirect } from 'expo-router';
import React from 'react';

import { useAuth } from '../providers/auth-provider';
import { Profile } from '../screens/profile';

export default function ProfileRoute() {
  const { session, isLoading } = useAuth();

  if (isLoading) return null;
  if (!session) return <Redirect href="/sign-in" />;

  return <Profile session={session} />;
}
