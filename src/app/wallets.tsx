import React from 'react';

import { AuthGate } from '../components/auth-gate';
import { Wallets } from '../screens/wallets';

export default function WalletsRoute() {
  return <AuthGate>{(session) => <Wallets session={session} />}</AuthGate>;
}
