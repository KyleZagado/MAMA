import React from 'react';

import { AuthGate } from '../components/auth-gate';
import { Transactions } from '../screens/transactions';

export default function TransactionsRoute() {
  return <AuthGate>{(session) => <Transactions session={session} />}</AuthGate>;
}
