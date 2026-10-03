import React from 'react';

import { AuthGate } from '../components/auth-gate';
import { AddTransaction } from '../screens/add-transaction';

export default function AddTransactionRoute() {
  return <AuthGate>{(session) => <AddTransaction session={session} />}</AuthGate>;
}
