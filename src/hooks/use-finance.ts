import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { getDatabase } from '../database';
import {
  getRecentNetChange,
  getSavingsGoal,
  listTransactions,
  listWallets,
  type TransactionItem,
  type Wallet,
} from '../database/finance';

export type FinanceData = {
  wallets: Wallet[];
  transactions: TransactionItem[];
  totalMinor: number;
  goalMinor: number | null;
  changePercent: number | null;
};

const EMPTY: FinanceData = {
  wallets: [],
  transactions: [],
  totalMinor: 0,
  goalMinor: null,
  changePercent: null,
};

// Reloads whenever the screen regains focus, so edits made on other screens show up.
export function useFinance(userId: string, transactionLimit: number) {
  const [data, setData] = useState<FinanceData>(EMPTY);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        try {
          const db = await getDatabase(userId);
          const [wallets, transactions, goalMinor, net] = await Promise.all([
            listWallets(db),
            listTransactions(db, transactionLimit),
            getSavingsGoal(db),
            getRecentNetChange(db),
          ]);
          if (!active) return;
          const totalMinor = wallets.reduce((sum, wallet) => sum + wallet.balance_minor, 0);
          const before = totalMinor - net;
          setData({
            wallets,
            transactions,
            totalMinor,
            goalMinor,
            changePercent: net !== 0 && before > 0 ? (net / before) * 100 : null,
          });
          setError(null);
        } catch (e: unknown) {
          if (active) setError(e instanceof Error ? e.message : 'Could not load your data.');
        } finally {
          if (active) setIsLoading(false);
        }
      })();
      return () => {
        active = false;
      };
    }, [userId, transactionLimit]),
  );

  return { ...data, isLoading, error };
}
