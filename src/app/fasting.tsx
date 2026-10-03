import React from 'react';

import { AuthGate } from '../components/auth-gate';
import { Fasting } from '../screens/fasting';

export default function FastingRoute() {
  return <AuthGate>{(session) => <Fasting session={session} />}</AuthGate>;
}
