import type { Session } from '@supabase/supabase-js';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chip, ChipRow, FieldLabel, formStyles, PrimaryButton } from '../components/form';
import { goBack, ScreenHeader } from '../components/screen-header';
import { ACCOUNT_TYPES } from '../constants/finance';
import { lightColors as colors, radius, spacing } from '../constants/theme';
import { getDatabase } from '../database';
import { deleteWallet, getWallet, saveWallet } from '../database/finance';
import { useCurrency } from '../hooks/use-currency';
import { minorToInput, parseMoney } from '../lib/money';
import type { Account } from '../types/models';

export function WalletForm({ session, walletId }: { session: Session; walletId?: string }) {
  const isEditing = Boolean(walletId);
  const currency = useCurrency();
  const [name, setName] = useState('');
  const [type, setType] = useState<Account['type']>('bank');
  const [details, setDetails] = useState('');
  const [balance, setBalance] = useState('');
  const [isLoading, setIsLoading] = useState(isEditing);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!walletId) return;
    let active = true;
    (async () => {
      try {
        const db = await getDatabase(session.user.id);
        const wallet = await getWallet(db, walletId);
        if (!active) return;
        if (!wallet) {
          goBack();
          return;
        }
        setName(wallet.name);
        setType(wallet.type);
        setDetails(wallet.details ?? '');
        setBalance(minorToInput(wallet.balance_minor));
      } catch (e: unknown) {
        if (active) setError(e instanceof Error ? e.message : 'Could not load this wallet.');
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [session.user.id, walletId]);

  const trimmedName = name.trim();
  const balanceMinor = balance.trim() ? parseMoney(balance, { allowNegative: true }) : 0;
  const balanceInvalid = balanceMinor === null;
  const canSave = !isLoading && trimmedName.length > 0 && !balanceInvalid;

  async function handleSave() {
    if (!canSave || balanceMinor === null) return;
    setIsSaving(true);
    setError(null);
    try {
      const db = await getDatabase(session.user.id);
      await saveWallet(db, {
        id: walletId,
        name: trimmedName,
        type,
        currency,
        details: details.trim(),
        balanceMinor,
      });
      goBack();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not save this wallet.');
      setIsSaving(false);
    }
  }

  function confirmDelete() {
    if (!walletId) return;
    Alert.alert(
      'Delete wallet?',
      'This also removes all transactions in this wallet. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const db = await getDatabase(session.user.id);
              await deleteWallet(db, walletId);
              goBack();
            } catch (e: unknown) {
              setError(e instanceof Error ? e.message : 'Could not delete this wallet.');
            }
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={formStyles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <ScreenHeader title={isEditing ? 'Edit Wallet' : 'New Wallet'} />

          <Text style={styles.hint}>
            {isEditing ? '' : 'Create a wallet for each place you keep money.'}
          </Text>

          <FieldLabel>NAME</FieldLabel>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Bank Account"
            placeholderTextColor={colors.textSubtle}
            autoCapitalize="words"
            maxLength={40}
            style={formStyles.input}
            accessibilityLabel="Wallet name"
          />

          <FieldLabel>TYPE</FieldLabel>
          <ChipRow>
            {ACCOUNT_TYPES.map((option) => (
              <Chip
                key={option.id}
                label={option.label}
                selected={type === option.id}
                onPress={() => setType(option.id)}
              />
            ))}
          </ChipRow>

          <FieldLabel>{isEditing ? 'BALANCE' : 'STARTING BALANCE'}</FieldLabel>
          <TextInput
            value={balance}
            onChangeText={setBalance}
            placeholder="0.00"
            placeholderTextColor={colors.textSubtle}
            keyboardType="numbers-and-punctuation"
            maxLength={15}
            style={formStyles.input}
            accessibilityLabel="Balance"
          />
          {balanceInvalid && <Text style={formStyles.error}>Enter an amount like 1250.50.</Text>}

          <FieldLabel>DETAILS (OPTIONAL)</FieldLabel>
          <TextInput
            value={details}
            onChangeText={setDetails}
            placeholder="Bank name, account number, notes…"
            placeholderTextColor={colors.textSubtle}
            maxLength={120}
            multiline
            style={[formStyles.input, styles.multiline]}
            accessibilityLabel="Wallet details"
          />

          {error && <Text style={formStyles.error}>{error}</Text>}

          <PrimaryButton
            label={isEditing ? 'Save changes' : 'Create wallet'}
            onPress={handleSave}
            disabled={!canSave}
            loading={isSaving}
          />
          {isEditing && (
            <Pressable
              onPress={confirmDelete}
              style={({ pressed }) => [styles.delete, pressed && styles.pressed]}
              accessibilityRole="button"
            >
              <Text style={styles.deleteText}>Delete wallet</Text>
            </Pressable>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: colors.background },
  hint: { color: colors.textMuted, fontSize: 14 },
  multiline: { minHeight: 72, paddingTop: spacing.md, textAlignVertical: 'top' },
  delete: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.dangerSoft,
  },
  deleteText: { color: colors.danger, fontSize: 15, fontWeight: '700' },
  pressed: { opacity: 0.75 },
});
