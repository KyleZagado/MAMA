import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { categoryInfo, type IconName } from '../constants/finance';
import { lightColors as colors, radius, spacing } from '../constants/theme';
import type { TransactionItem } from '../database/finance';
import { formatMoney, formatWhen } from '../lib/money';

function describe(item: TransactionItem): { title: string; icon: IconName } {
  if (item.type === 'transfer') {
    return {
      title: item.description || `Transfer to ${item.to_wallet_name ?? 'wallet'}`,
      icon: 'paper-plane-outline',
    };
  }
  const category = categoryInfo(item.category_id);
  return {
    title: item.merchant || item.description || category?.label || (item.type === 'income' ? 'Income' : 'Expense'),
    icon: category?.icon ?? 'swap-horizontal-outline',
  };
}

type Props = {
  item: TransactionItem;
  showDivider: boolean;
  onPress?: () => void;
  perspectiveAccountId?: string;
};

export function TransactionRow({ item, showDivider, onPress, perspectiveAccountId }: Props) {
  const currency = item.wallet_currency;
  const { title, icon } = describe(item);
  const scopedTransfer = item.type === 'transfer' && Boolean(perspectiveAccountId);
  const incomingTransfer = scopedTransfer && item.to_account_id === perspectiveAccountId;
  const isIncome = item.type === 'income' || incomingTransfer;
  const amount =
    item.type === 'expense' || (scopedTransfer && !incomingTransfer)
      ? formatMoney(-item.amount_minor, { currency })
      : formatMoney(item.amount_minor, { currency, sign: isIncome });

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.row, showDivider && styles.divider, pressed && styles.pressed]}
      accessibilityRole={onPress ? 'button' : undefined}
    >
      <View style={styles.icon}>
        <Ionicons name={icon} size={22} color={colors.text} />
      </View>
      <View style={styles.details}>
        <Text style={styles.title} numberOfLines={1}>
          {scopedTransfer
            ? `${incomingTransfer ? 'Transfer from' : 'Transfer to'} ${incomingTransfer ? item.wallet_name : item.to_wallet_name ?? 'wallet'}`
            : title}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {formatWhen(item.occurred_at)} · {item.wallet_name}
          {item.type !== 'transfer' && item.category_id ? ` · ${categoryInfo(item.category_id)?.label ?? 'Other'}` : ''}
          {scopedTransfer && item.description ? ` · ${item.description}` : ''}
        </Text>
      </View>
      <Text style={[styles.amount, isIncome && styles.income]}>{amount}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, paddingVertical: 14 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  pressed: { opacity: 0.7 },
  icon: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  details: { flex: 1 },
  title: { color: colors.text, fontSize: 16, fontWeight: '600' },
  meta: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  amount: { color: colors.text, fontSize: 16, fontWeight: '700' },
  income: { color: colors.accent },
});
