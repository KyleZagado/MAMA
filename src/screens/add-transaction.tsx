import type { Session } from '@supabase/supabase-js';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chip, ChipRow, FieldLabel, formStyles, PrimaryButton } from '../components/form';
import { goBack, ScreenHeader } from '../components/screen-header';
import { CATEGORIES, TRANSACTION_TYPES } from '../constants/finance';
import { lightColors as colors } from '../constants/theme';
import { getDatabase } from '../database';
import { addTransaction } from '../database/finance';
import { useFinance } from '../hooks/use-finance';
import { parseMoney } from '../lib/money';
import type { Transaction } from '../types/models';

export function AddTransaction({ session }: { session: Session }) {
  const { wallets, isLoading } = useFinance(session.user.id, 1);
  const [type, setType] = useState<Transaction['type']>('expense');
  const [amount, setAmount] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [toAccountId, setToAccountId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accountId =
    wallets.find((w) => w.id === selectedAccountId)?.id ?? wallets[0]?.id ?? null;

  const isTransfer = type === 'transfer';
  const categories = CATEGORIES.filter((c) => c.kind === type);
  const amountMinor = parseMoney(amount);
  const amountInvalid = amount.trim().length > 0 && (amountMinor === null || amountMinor === 0);
  const destinations = wallets.filter((w) => w.id !== accountId);
  const destinationId =
    isTransfer && toAccountId && toAccountId !== accountId ? toAccountId : null;
  const canSave =
    Boolean(accountId) &&
    Boolean(amountMinor) &&
    !amountInvalid &&
    (!isTransfer || destinationId !== null);

  async function handleSave() {
    if (!canSave || !accountId || !amountMinor) return;
    setIsSaving(true);
    setError(null);
    try {
      const db = await getDatabase(session.user.id);
      await addTransaction(db, {
        type,
        amountMinor,
        accountId,
        toAccountId: destinationId,
        categoryId,
        description: description.trim(),
      });
      goBack();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not save this transaction.');
      setIsSaving(false);
    }
  }

  const noWallets = !isLoading && wallets.length === 0;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={formStyles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <ScreenHeader title="New Transaction" />

          {noWallets ? (
            <>
              <Text style={styles.hint}>You need a wallet before you can add a transaction.</Text>
              <PrimaryButton label="Create a wallet" onPress={() => router.replace('/wallet-form')} />
            </>
          ) : (
            <>
              <ChipRow>
                {TRANSACTION_TYPES.map((option) => (
                  <Chip
                    key={option.id}
                    label={option.label}
                    selected={type === option.id}
                    onPress={() => {
                      setType(option.id);
                      setCategoryId(null);
                    }}
                  />
                ))}
              </ChipRow>

              <FieldLabel>AMOUNT</FieldLabel>
              <TextInput
                value={amount}
                onChangeText={setAmount}
                placeholder="0.00"
                placeholderTextColor={colors.textSubtle}
                keyboardType="decimal-pad"
                maxLength={14}
                style={formStyles.input}
                accessibilityLabel="Amount"
              />
              {amountInvalid && <Text style={formStyles.error}>Enter an amount like 12.50.</Text>}

              <FieldLabel>{isTransfer ? 'FROM WALLET' : 'WALLET'}</FieldLabel>
              <ChipRow>
                {wallets.map((wallet) => (
                  <Chip
                    key={wallet.id}
                    label={wallet.name}
                    selected={accountId === wallet.id}
                    onPress={() => setSelectedAccountId(wallet.id)}
                  />
                ))}
              </ChipRow>

              {isTransfer ? (
                <>
                  <FieldLabel>TO WALLET</FieldLabel>
                  {destinations.length ? (
                    <ChipRow>
                      {destinations.map((wallet) => (
                        <Chip
                          key={wallet.id}
                          label={wallet.name}
                          selected={destinationId === wallet.id}
                          onPress={() => setToAccountId(wallet.id)}
                        />
                      ))}
                    </ChipRow>
                  ) : (
                    <Text style={styles.hint}>Create a second wallet to transfer between them.</Text>
                  )}
                </>
              ) : (
                <>
                  <FieldLabel>CATEGORY</FieldLabel>
                  <ChipRow>
                    {categories.map((category) => (
                      <Chip
                        key={category.id}
                        label={category.label}
                        selected={categoryId === category.id}
                        onPress={() => setCategoryId(categoryId === category.id ? null : category.id)}
                      />
                    ))}
                  </ChipRow>
                </>
              )}

              <FieldLabel>DESCRIPTION (OPTIONAL)</FieldLabel>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="e.g. Whole Foods Market"
                placeholderTextColor={colors.textSubtle}
                maxLength={80}
                style={formStyles.input}
                accessibilityLabel="Description"
              />

              {error && <Text style={formStyles.error}>{error}</Text>}
              <PrimaryButton
                label="Add transaction"
                onPress={handleSave}
                disabled={!canSave}
                loading={isSaving}
              />
            </>
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
});
