import { createThemedStyleSheet } from '../providers/theme-provider';
import type { Session } from '@supabase/supabase-js';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chip, ChipRow, FieldLabel, formStyles, PrimaryButton } from '../components/form';
import { ScreenHeader } from '../components/screen-header';
import { TransactionDetails } from '../components/transaction-details';
import { TransactionRow } from '../components/transaction-row';
import { accountTypeInfo } from '../constants/finance';
import { lightColors as colors, spacing } from '../constants/theme';
import { getDatabase } from '../database';
import {
  deleteTransaction, getWallet, getWalletSummary, listWalletTransactions,
  type TransactionItem, type Wallet, type WalletHistoryFilter, type WalletSummary,
} from '../database/finance';
import type { Transaction } from '../types/models';
import { formatMoney } from '../lib/money';

const filters: { id: WalletHistoryFilter; label: string }[] = [
  { id: 'all', label: 'Transactions' }, { id: 'income', label: 'Income' },
  { id: 'expense', label: 'Expenses' }, { id: 'transfer', label: 'Transfers' },
];

export function WalletDetail({ session, walletId }: { session: Session; walletId?: string }) {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [filter, setFilter] = useState<WalletHistoryFilter>('all');
  const [history, setHistory] = useState<TransactionItem[]>([]);
  const [selected, setSelected] = useState<TransactionItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const morePending = useRef(false);

  const reload = useCallback(async () => {
    const request = ++generation.current;
    setIsLoading(true);
    setError(null);
    setLoadingMore(false);
    try {
      if (!walletId) throw new Error('No wallet was selected.');
      const db = await getDatabase(session.user.id);
      const nextWallet = await getWallet(db, walletId);
      if (!nextWallet) throw new Error('This wallet has been deleted or is no longer available.');
      const [totals, rows] = await Promise.all([
        getWalletSummary(db, walletId), listWalletTransactions(db, walletId, filter),
      ]);
      if (request !== generation.current) return;
      setWallet(nextWallet);
      setSummary(totals);
      setHistory(rows);
      setHasMore(rows.length === 50);
    } catch (e: unknown) {
      if (request === generation.current) setError(e instanceof Error ? e.message : 'Could not load this wallet.');
    } finally {
      if (request === generation.current) setIsLoading(false);
    }
  }, [session.user.id, walletId, filter]);

  useFocusEffect(useCallback(() => {
    void reload();
    return () => { generation.current++; };
  }, [reload]));

  async function loadMore() {
    if (!walletId || isLoading || morePending.current || !hasMore) return;
    morePending.current = true;
    const request = generation.current;
    setLoadingMore(true);
    setError(null);
    try {
      const rows = await listWalletTransactions(await getDatabase(session.user.id), walletId, filter, history.length);
      if (request !== generation.current) return;
      setHistory((current) => [...current, ...rows]);
      setHasMore(rows.length === 50);
    } catch (e: unknown) {
      if (request === generation.current) setError(e instanceof Error ? e.message : 'Could not load more transactions.');
    } finally {
      morePending.current = false;
      if (request === generation.current) setLoadingMore(false);
    }
  }

  function add(type: Transaction['type']) {
    if (wallet) router.push({ pathname: '/add-transaction', params: { type, accountId: wallet.id } });
  }

  function confirmDelete(item: TransactionItem) {
    Alert.alert('Delete transaction?', item.type === 'transfer'
      ? 'This reverses the transfer in both wallets.'
      : 'This updates this wallet balance and totals.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await deleteTransaction(await getDatabase(session.user.id), item.id);
          setSelected(null);
          await reload();
        } catch (e: unknown) {
          Alert.alert('Could not delete transaction', e instanceof Error ? e.message : 'Please try again.');
        }
      } },
    ]);
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <FlatList
        data={isLoading || error ? [] : history}
        keyExtractor={(item) => item.id}
        contentContainerStyle={formStyles.content}
        ListHeaderComponent={
          <View style={styles.stack}>
            <ScreenHeader title={wallet?.name ?? 'Wallet'} />
            {isLoading ? <ActivityIndicator color={colors.primary} /> : error ? (
              <>
                <Text style={formStyles.error}>{error}</Text>
                <PrimaryButton label="Retry" onPress={() => void reload()} />
                <PrimaryButton label="Manage wallets" onPress={() => router.replace('/wallets')} />
              </>
            ) : wallet && summary && (
              <>
                <View style={formStyles.card}>
                  <Text style={styles.hint}>{accountTypeInfo(wallet.type).label} · {wallet.currency}</Text>
                  <FieldLabel>CURRENT BALANCE</FieldLabel>
                  <Text style={styles.balance}>{formatMoney(wallet.balance_minor, { currency: wallet.currency })}</Text>
                  {wallet.details && <Text style={styles.hint}>{wallet.details}</Text>}
                  <Chip label="Edit wallet" selected={false} onPress={() => router.push({ pathname: '/wallet-form', params: { id: wallet.id } })} />
                </View>
                <View style={formStyles.card}>
                  <Text style={styles.heading}>All-time activity</Text>
                  <Amount label="Income" amount={summary.income_minor} currency={wallet.currency} />
                  <Amount label="Expenses" amount={summary.expenses_minor} currency={wallet.currency} />
                  <Amount label="Transfers in" amount={summary.transfers_in_minor} currency={wallet.currency} />
                  <Amount label="Transfers out" amount={summary.transfers_out_minor} currency={wallet.currency} />
                  <Text style={styles.hint}>Transfers move money between wallets; they do not count as income or expenses. Opening balance is separate from activity totals.</Text>
                </View>
                <PrimaryButton label="+ Add Expense" onPress={() => add('expense')} />
                <PrimaryButton label="+ Add Income" onPress={() => add('income')} />
                <PrimaryButton label="Transfer to another wallet" onPress={() => add('transfer')} />
                <ChipRow>{filters.map((item) => (
                  <Chip key={item.id} label={item.label} selected={filter === item.id} onPress={() => setFilter(item.id)} />
                ))}</ChipRow>
                <Text style={styles.hint}>Tap an entry for details. Transfer history includes incoming and outgoing transfers.</Text>
                {!history.length && <Text style={styles.hint}>No {filters.find((item) => item.id === filter)?.label.toLowerCase()} in this wallet yet.</Text>}
              </>
            )}
          </View>
        }
        renderItem={({ item }) => <TransactionRow item={item} showDivider perspectiveAccountId={walletId} onPress={() => setSelected(item)} />}
        ListFooterComponent={!isLoading && !error && hasMore
          ? <PrimaryButton label={loadingMore ? 'Loading...' : 'Load more'} disabled={loadingMore} onPress={() => void loadMore()} />
          : null}
      />
      <TransactionDetails item={selected} onClose={() => setSelected(null)} onDelete={confirmDelete} />
    </SafeAreaView>
  );
}

function Amount({ label, amount, currency }: { label: string; amount: number; currency: string }) {
  return <View style={styles.row}><Text style={styles.hint}>{label}</Text><Text style={styles.heading}>{formatMoney(amount, { currency })}</Text></View>;
}

const styles = createThemedStyleSheet((colors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  stack: { gap: spacing.lg },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  balance: { color: colors.primary, fontSize: 32, fontWeight: '800' },
  heading: { color: colors.text, fontSize: 16, fontWeight: '700' },
  hint: { color: colors.textMuted, fontSize: 14, lineHeight: 21 },
}));
