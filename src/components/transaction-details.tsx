import { createThemedStyleSheet } from '../providers/theme-provider';
import React from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { categoryInfo } from '../constants/finance';
import { spacing } from '../constants/theme';
import type { TransactionItem } from '../database/finance';
import { formatMoney } from '../lib/money';
import { receiptPhotoUri } from '../lib/receipt-photos';
import { formStyles } from './form';

export function TransactionDetails({
  item, onClose, onDelete,
}: {
  item: TransactionItem | null;
  onClose: () => void;
  onDelete: (item: TransactionItem) => void;
}) {
  return (
    <Modal visible={item !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        {item && (
          <ScrollView contentContainerStyle={formStyles.content}>
            <View style={styles.header}>
              <Text style={styles.title}>Transaction details</Text>
              <Pressable onPress={onClose} accessibilityRole="button"><Text style={styles.link}>Done</Text></Pressable>
            </View>
            <Text style={styles.amount}>{formatMoney(item.amount_minor, { currency: item.wallet_currency })}</Text>
            <Detail label="Type" value={item.type} />
            <Detail label="Category" value={categoryInfo(item.category_id)?.label} />
            <Detail label="Subcategory" value={item.subcategory} />
            <Detail label="Date / time" value={new Date(item.occurred_at).toLocaleString('en-US')} />
            <Detail label="Account / wallet" value={item.wallet_name} />
            <Detail label="To wallet" value={item.to_wallet_name} />
            <Detail label="Merchant" value={item.merchant} />
            {!item.merchant && <Detail label="Description" value={item.description} />}
            <Detail label="Notes" value={item.notes} />
            <Detail label="Location" value={item.location} />
            <Detail label="Payment method" value={item.payment_method} />
            <Detail label="Tags" value={item.tags ? decodeTags(item.tags) : null} />
            {item.attachment_uri && (
              <View style={styles.group}>
                <Text style={styles.label}>Receipt / photo</Text>
                <ReceiptPreview key={item.attachment_uri} name={item.attachment_uri} />
              </View>
            )}
            <Pressable onPress={() => onDelete(item)} style={styles.delete} accessibilityRole="button">
              <Text style={styles.deleteText}>Delete transaction</Text>
            </Pressable>
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

function ReceiptPreview({ name }: { name: string }) {
  const [error, setError] = React.useState<string | null>(null);
  return (
    <>
      <Image source={{ uri: receiptPhotoUri(name) }}
        style={styles.receipt} resizeMode="contain" accessibilityLabel="Saved receipt"
        onError={() => setError('This receipt photo could not be loaded.')} />
      {error && <Text style={formStyles.error}>{error}</Text>}
    </>
  );
}

function decodeTags(value: string) {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || parsed.some((tag) => typeof tag !== 'string')) {
    throw new Error('Transaction tags are invalid.');
  }
  return parsed.join(', ');
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return <View style={styles.group}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></View>;
}

const styles = createThemedStyleSheet((colors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  title: { color: colors.text, fontSize: 18, fontWeight: '700' },
  link: { color: colors.primary, fontSize: 15, fontWeight: '600', paddingVertical: spacing.sm },
  amount: { color: colors.text, fontSize: 32, fontWeight: '800' },
  group: { gap: spacing.xs },
  label: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  value: { color: colors.text, fontSize: 15 },
  receipt: { width: '100%', height: 400, backgroundColor: colors.surface },
  delete: { minHeight: 48, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.dangerSoft },
  deleteText: { color: colors.danger, fontWeight: '700' },
}));
