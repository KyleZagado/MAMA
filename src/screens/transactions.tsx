import type { Session } from '@supabase/supabase-js';
import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formStyles } from '../components/form';
import { ScreenHeader } from '../components/screen-header';
import { TransactionRow } from '../components/transaction-row';
import { TransactionDetails } from '../components/transaction-details';
import { lightColors as colors } from '../constants/theme';
import { getDatabase } from '../database';
import { deleteTransaction, type TransactionItem } from '../database/finance';
import { useFinance } from '../hooks/use-finance';

const LIMIT = 200;

export function Transactions({ session }: { session: Session }) {
  const { transactions, isLoading, error } = useFinance(session.user.id, LIMIT);
  const [removedIds, setRemovedIds] = React.useState<string[]>([]);
  const [selected, setSelected] = React.useState<TransactionItem | null>(null);
  const visible = transactions.filter((item) => !removedIds.includes(item.id));

  function confirmDelete(item: TransactionItem) {
    Alert.alert('Delete transaction?', 'This will update your wallet balance.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const db = await getDatabase(session.user.id);
            await deleteTransaction(db, item.id);
            setRemovedIds((ids) => [...ids, item.id]);
            setSelected(null);
          } catch (e: unknown) {
            Alert.alert('Could not delete', e instanceof Error ? e.message : 'Please try again.');
          }
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={formStyles.content} showsVerticalScrollIndicator={false}>
        <ScreenHeader title="Transactions" />
        {visible.length ? (
          <View>
            {visible.map((item, index) => (
              <TransactionRow
                key={item.id}
                item={item}
                showDivider={index < visible.length - 1}
                onPress={() => setSelected(item)}
              />
            ))}
          </View>
        ) : (
          !isLoading && <Text style={styles.empty}>No transactions yet.</Text>
        )}
        {visible.length > 0 && <Text style={styles.hint}>Tap a transaction to view its details and receipt.</Text>}
        {error && <Text style={formStyles.error}>{error}</Text>}
      </ScrollView>
      <TransactionDetails item={selected} onClose={() => setSelected(null)} onDelete={confirmDelete} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  empty: { color: colors.textMuted, fontSize: 14 },
  hint: { color: colors.textSubtle, fontSize: 12, textAlign: 'center' },
});
