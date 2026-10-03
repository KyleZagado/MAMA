import React from 'react';
import { useLocalSearchParams } from 'expo-router';

import { AuthGate } from '../components/auth-gate';
import { AddTransaction } from '../screens/add-transaction';

export default function AddTransactionRoute() {
  const { type, accountId } = useLocalSearchParams<{ type?: string; accountId?: string }>();
  const initialType = type === 'income' ? 'income' : type === 'transfer' ? 'transfer' : 'expense';
  return <AuthGate>{(session) => <AddTransaction session={session} initialType={initialType} initialAccountId={accountId} />}</AuthGate>;
}
