import React from 'react';

import { AuthGate } from '../components/auth-gate';
import { Journal } from '../screens/journal';

export default function JournalRoute() {
  return <AuthGate>{(session) => <Journal session={session} />}</AuthGate>;
}
