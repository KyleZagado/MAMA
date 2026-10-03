import React from 'react';

import { AuthGate } from '../components/auth-gate';
import { HomePager } from '../screens/home-pager';

export default function DashboardRoute() {
  return <AuthGate>{(session) => <HomePager session={session} />}</AuthGate>;
}
