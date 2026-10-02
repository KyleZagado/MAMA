import { Redirect } from 'expo-router';
import React from 'react';

import { AuthScreen } from '../screens/auth-screen';
import { useAuth } from '../providers/auth-provider';

export default function SignInRoute() {
  const { session, isLoading } = useAuth();

  if (isLoading) return null;
  if (session) return <Redirect href="/dashboard" />;

  return <AuthScreen mode="sign-in" />;
}
