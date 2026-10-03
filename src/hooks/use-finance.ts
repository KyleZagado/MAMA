import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { getDatabase } from '../database';
import {
  getMonthlyFinanceSummary,
  getRecentNetChange,
  getSavingsGoal,
  listTransactions,
  listWallets,
  type MonthlyFinanceSummary,
  type TransactionItem,
  type Wallet,
} from '../database/finance';

export type FinanceData = {
  wallets: Wallet[];
  transactions: TransactionItem[];
  totalMinor: number;
  goalMinor: number | null;
  changePercent: number | null;
  monthly: MonthlyFinanceSummary;
};

const EMPTY_MONTHLY: MonthlyFinanceSummary = {
  incomeMinor: 0,
  expensesMinor: 0,
  savingsMinor: 0,
  budgetMinor: null,
  spendingStreak: 0,
  bills: [],
};

const EMPTY: FinanceData = {
  wallets: [],
  transactions: [],
  totalMinor: 0,
  goalMinor: null,
  changePercent: null,
  monthly: EMPTY_MONTHLY,
};

// Reloads whenever the screen regains focus, so edits made on other screens show up.
export function useFinance(userId: string, transactionLimit: number) {
  const [data, setData] = useState<FinanceData>(EMPTY);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true);
    try {
      const db = await getDatabase(userId);
      const [wallets, transactions, goalMinor, net, monthly] = await Promise.all([
        listWallets(db),
        listTransactions(db, transactionLimit),
        getSavingsGoal(db),
        getRecentNetChange(db),
        getMonthlyFinanceSummary(db),
      ]);
      const totalMinor = wallets.reduce((sum, wallet) => sum + wallet.balance_minor, 0);
      const before = totalMinor - net;
      setData({
        wallets,
        transactions,
        totalMinor,
        goalMinor,
        changePercent: net !== 0 && before > 0 ? (net / before) * 100 : null,
        monthly,
      });
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load your data.');
    } finally {
      setIsLoading(false);
    }
  }, [transactionLimit, userId]);

  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  return { ...data, isLoading, error, reload };
}
