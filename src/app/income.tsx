import React from 'react';

import { AuthGate } from '../components/auth-gate';
import { Income } from '../screens/income';

export default function IncomeRoute() {
  return <AuthGate>{(session) => <Income session={session} />}</AuthGate>;
}
