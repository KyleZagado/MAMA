import type { Session } from '@supabase/supabase-js';
import { Redirect } from 'expo-router';
import React from 'react';

import { useAuth } from '../providers/auth-provider';

export function AuthGate({ children }: { children: (session: Session) => React.ReactNode }) {
  const { session, isLoading } = useAuth();

  if (isLoading) return null;
  if (!session) return <Redirect href="/sign-in" />;

  return <>{children(session)}</>;
}
