import React from 'react';

import { AuthGate } from '../components/auth-gate';
import { Activity } from '../screens/activity';

export default function ActivityRoute() {
  return <AuthGate>{(session) => <Activity session={session} />}</AuthGate>;
}
