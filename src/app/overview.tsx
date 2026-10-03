import React from 'react';

import { AuthGate } from '../components/auth-gate';
import { Overview } from '../screens/overview';

export default function OverviewRoute() {
  return <AuthGate>{(session) => <Overview session={session} />}</AuthGate>;
}
