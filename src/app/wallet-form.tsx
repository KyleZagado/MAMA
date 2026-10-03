import { useLocalSearchParams } from 'expo-router';
import React from 'react';

import { AuthGate } from '../components/auth-gate';
import { WalletForm } from '../screens/wallet-form';

export default function WalletFormRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return (
    <AuthGate>{(session) => <WalletForm key={id ?? 'new'} session={session} walletId={id} />}</AuthGate>
  );
}
