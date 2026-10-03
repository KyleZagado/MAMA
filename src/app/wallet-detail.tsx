import { useLocalSearchParams } from 'expo-router';
import React from 'react';

import { AuthGate } from '../components/auth-gate';
import { WalletDetail } from '../screens/wallet-detail';

export default function WalletDetailRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <AuthGate>{(session) => <WalletDetail session={session} walletId={id} />}</AuthGate>;
}
