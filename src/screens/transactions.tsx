import type { Session } from '@supabase/supabase-js';
import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formStyles } from '../components/form';
import { ScreenHeader } from '../components/screen-header';
import { TransactionRow } from '../components/transaction-row';
import { lightColors as colors } from '../constants/theme';
import { getDatabase } from '../database';
import { deleteTransaction, type TransactionItem } from '../database/finance';
import { useFinance } from '../hooks/use-finance';

const LIMIT = 200;

export function Transactions({ session }: { session: Session }) {
  const { transactions, isLoading, error } = useFinance(session.user.id, LIMIT);
  const [removedIds, setRemovedIds] = React.useState<string[]>([]);
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
                onPress={() => confirmDelete(item)}
              />
            ))}
          </View>
        ) : (
          !isLoading && <Text style={styles.empty}>No transactions yet.</Text>
        )}
        {visible.length > 0 && <Text style={styles.hint}>Tap a transaction to delete it.</Text>}
        {error && <Text style={formStyles.error}>{error}</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  empty: { color: colors.textMuted, fontSize: 14 },
  hint: { color: colors.textSubtle, fontSize: 12, textAlign: 'center' },
});
