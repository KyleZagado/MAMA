import { Ionicons } from '@expo/vector-icons';
import type { Session } from '@supabase/supabase-js';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet,
  Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chip, ChipRow, FieldLabel, formStyles, PrimaryButton } from '../components/form';
import { PickerField } from '../components/picker-field';
import { goBack, ScreenHeader } from '../components/screen-header';
import { CATEGORIES, PAYMENT_METHODS, SUBCATEGORIES, TRANSACTION_TYPES, categoryInfo } from '../constants/finance';
import { lightColors as colors, spacing, radius } from '../constants/theme';
import { getDatabase } from '../database';
import { addTransaction } from '../database/finance';
import { useCurrency } from '../hooks/use-currency';
import { useFinance } from '../hooks/use-finance';
import { formatMoney, parseMoney } from '../lib/money';
import { deleteReceiptPhoto, saveReceiptPhoto } from '../lib/receipt-photos';
import type { Transaction } from '../types/models';

export function AddTransaction({
  session,
  initialType = 'expense',
  initialAccountId,
}: {
  session: Session;
  initialType?: Transaction['type'];
  initialAccountId?: string;
}) {
  const { wallets, isLoading, error: loadError } = useFinance(session.user.id, 1);
  const currency = useCurrency();
  const [type, setType] = useState<Transaction['type']>(initialType);
  const [amount, setAmount] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(initialAccountId ?? null);
  const [toAccountId, setToAccountId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [subcategory, setSubcategory] = useState<string | null>(null);
  const [merchant, setMerchant] = useState('');
  const [description, setDescription] = useState('');
  const [occurredAt, setOccurredAt] = useState(() => new Date());
  const [notes, setNotes] = useState('');
  const [location, setLocation] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null);
  const [tags, setTags] = useState('');
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [isPicking, setIsPicking] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const account = selectedAccountId
    ? wallets.find((wallet) => wallet.id === selectedAccountId)
    : wallets[0];
  const unavailableWallet = !isLoading && !loadError && Boolean(selectedAccountId) && !account;
  const accountId = account?.id ?? null;
  const isTransfer = type === 'transfer';
  const isExpense = type === 'expense';
  const categories = CATEGORIES.filter((category) => category.kind === type);
  const amountMinor = parseMoney(amount);
  const amountInvalid = amount.trim().length > 0 && (amountMinor === null || amountMinor === 0);
  const destinations = wallets.filter((wallet) => wallet.id !== accountId);
  const destinationId = destinations.find((wallet) => wallet.id === toAccountId)?.id ?? null;
  const canSave = !isLoading && !loadError && Boolean(accountId) && Boolean(amountMinor) &&
    !amountInvalid && (!isTransfer || destinationId !== null);
  const noWallets = !isLoading && !loadError && wallets.length === 0;
  const title = isExpense ? 'Add Expense' : isTransfer ? 'Transfer' : 'Add Income';

  async function pickReceipt(source: 'camera' | 'library') {
    setIsPicking(true);
    setError(null);
    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setError('Allow camera access in Settings to photograph your receipt.');
          return;
        }
      }
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'], quality: 0.8, allowsEditing: false,
      };
      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
      if (!result.canceled) setReceiptUri(result.assets[0].uri);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not select a receipt photo.');
    } finally {
      setIsPicking(false);
    }
  }

  async function handleSave() {
    if (!canSave || !accountId || !amountMinor || isSaving || isPicking) return;
    setIsSaving(true);
    setError(null);
    let receiptName: string | null = null;
    let saved = false;
    try {
      const db = await getDatabase(session.user.id);
      if (isExpense && receiptUri) receiptName = saveReceiptPhoto(receiptUri);
      await addTransaction(db, {
        type, amountMinor, accountId, toAccountId: destinationId,
        categoryId: isExpense ? categoryId ?? 'other_expense' : type === 'income' ? categoryId ?? 'other_income' : null,
        description: isExpense ? merchant.trim() : description.trim(),
        occurredAt: occurredAt.getTime(),
        subcategory: isExpense ? subcategory : null,
        merchant: isExpense ? merchant.trim() || null : null,
        notes: isExpense ? notes.trim() || null : null,
        location: isExpense ? location.trim() || null : null,
        paymentMethod: isExpense ? paymentMethod : null,
        receiptPhoto: receiptName,
        tags: isExpense ? [...new Set(tags.split(',').map((tag) => tag.trim()).filter(Boolean))] : [],
      });
      saved = true;
    } catch (e: unknown) {
      let message = e instanceof Error ? e.message : 'Could not save this transaction.';
      if (receiptName) {
        try {
          deleteReceiptPhoto(receiptName);
        } catch (cleanupError: unknown) {
          console.error('Could not remove unsaved receipt', cleanupError);
          message += ' The unsaved receipt could not be cleaned up.';
        }
      }
      setError(message);
    } finally {
      setIsSaving(false);
    }
    if (saved) goBack();
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={formStyles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <ScreenHeader title={title} />
          {loadError && <Text style={formStyles.error}>{loadError}</Text>}
          {unavailableWallet && <Text style={formStyles.error}>This wallet is no longer available. Choose another wallet below.</Text>}
          {noWallets ? (
            <>
              <Text style={styles.hint}>Create a wallet once, then log expenses in just a few taps.</Text>
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
                      setSubcategory(null);
                    }}
                  />
                ))}
              </ChipRow>
              {type === 'income' && (
                <Pressable onPress={() => router.push('/income')} accessibilityRole="button">
                  <Text style={styles.hint}>Recurring income, pay schedules &amp; history →</Text>
                </Pressable>
              )}
              <View style={styles.amountCard}>
                <FieldLabel>{`AMOUNT (${account?.currency ?? currency})`}</FieldLabel>
                <TextInput
                  value={amount} onChangeText={setAmount} placeholder="0.00"
                  placeholderTextColor={colors.textSubtle} keyboardType="decimal-pad"
                  maxLength={14} style={styles.amountInput} accessibilityLabel="Amount"
                />
                {amountInvalid && <Text style={formStyles.error}>Enter an amount greater than zero, like 350 or 12.50.</Text>}
              </View>

              {!isTransfer && (
                <View style={styles.group}>
                  <FieldLabel>CATEGORY</FieldLabel>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceRow}>
                    {categories.map((category) => (
                      <Pressable
                        key={category.id}
                        onPress={() => {
                          setCategoryId(categoryId === category.id ? null : category.id);
                          setSubcategory(null);
                        }}
                        style={[styles.category, categoryId === category.id && styles.selectedCategory]}
                        accessibilityRole="button"
                        accessibilityState={{ selected: categoryId === category.id }}
                      >
                        <Ionicons name={category.icon} size={23} color={colors.primary} />
                        <Text style={styles.categoryText}>{category.label}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              )}

              <View style={styles.group}>
                <FieldLabel>{isTransfer ? 'FROM WALLET' : 'ACCOUNT / WALLET'}</FieldLabel>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceRow}>
                  {wallets.map((wallet) => (
                    <Chip key={wallet.id} label={wallet.name} selected={accountId === wallet.id}
                      onPress={() => setSelectedAccountId(wallet.id)} />
                  ))}
                </ScrollView>
              </View>

              {isTransfer && (
                <View style={styles.group}>
                  <FieldLabel>TO WALLET</FieldLabel>
                  <ChipRow>
                    {destinations.map((wallet) => (
                      <Chip key={wallet.id} label={wallet.name} selected={destinationId === wallet.id}
                        onPress={() => setToAccountId(wallet.id)} />
                    ))}
                  </ChipRow>
                  {!destinations.length && <Text style={styles.hint}>Create a second wallet to make a transfer.</Text>}
                </View>
              )}

              <View style={styles.group}>
                <FieldLabel>{isExpense ? 'MERCHANT (OPTIONAL)' : 'DESCRIPTION (OPTIONAL)'}</FieldLabel>
                <TextInput
                  value={isExpense ? merchant : description}
                  onChangeText={isExpense ? setMerchant : setDescription}
                  placeholder={isExpense ? 'e.g. Jollibee' : 'e.g. Salary'}
                  placeholderTextColor={colors.textSubtle}
                  maxLength={80} style={formStyles.input}
                  accessibilityLabel={isExpense ? 'Merchant' : 'Description'}
                />
              </View>

              <View style={styles.dateRow}>
                <View style={styles.group}>
                  <FieldLabel>DATE</FieldLabel>
                  <PickerField mode="date" value={occurredAt} onChange={(date) => setOccurredAt((current) =>
                    new Date(date.getFullYear(), date.getMonth(), date.getDate(), current.getHours(), current.getMinutes()))} />
                </View>
                <View style={styles.group}>
                  <FieldLabel>TIME</FieldLabel>
                  <PickerField mode="time" value={occurredAt} onChange={(time) => setOccurredAt((current) =>
                    new Date(current.getFullYear(), current.getMonth(), current.getDate(), time.getHours(), time.getMinutes()))} />
                </View>
              </View>

              {isExpense && (
                <>
                  <Pressable onPress={() => setShowDetails(!showDetails)} style={styles.detailsToggle}
                    accessibilityRole="button" accessibilityState={{ expanded: showDetails }}>
                    <View style={styles.flex}>
                      <Text style={styles.detailsTitle}>{showDetails ? 'Hide optional details' : 'Add optional details'}</Text>
                      <Text style={styles.hint}>Subcategory, notes, location, payment, receipt, tags</Text>
                    </View>
                    <Ionicons name={showDetails ? 'chevron-up' : 'chevron-down'} size={20} color={colors.primary} />
                  </Pressable>
                  {showDetails && (
                    <>
                      <View style={styles.group}>
                        <FieldLabel>SUBCATEGORY (OPTIONAL)</FieldLabel>
                        {categoryId ? (
                          <ChipRow>
                            {(SUBCATEGORIES[categoryId] ?? []).map((option) => (
                              <Chip key={option} label={option} selected={subcategory === option}
                                onPress={() => setSubcategory(subcategory === option ? null : option)} />
                            ))}
                          </ChipRow>
                        ) : <Text style={styles.hint}>Choose a category to see its subcategories.</Text>}
                      </View>
                      <View style={styles.group}>
                        <FieldLabel>NOTES</FieldLabel>
                        <TextInput value={notes} onChangeText={setNotes} multiline maxLength={1000}
                          placeholder="Anything to remember?" placeholderTextColor={colors.textSubtle}
                          style={[formStyles.input, styles.notes]} accessibilityLabel="Notes" />
                      </View>
                      <View style={styles.group}>
                        <FieldLabel>LOCATION</FieldLabel>
                        <TextInput value={location} onChangeText={setLocation} maxLength={160}
                          placeholder="e.g. SM Mall, Quezon City" placeholderTextColor={colors.textSubtle}
                          style={formStyles.input} accessibilityLabel="Location" />
                      </View>
                      <View style={styles.group}>
                        <FieldLabel>PAYMENT METHOD</FieldLabel>
                        <ChipRow>
                          {PAYMENT_METHODS.map((method) => (
                            <Chip key={method} label={method} selected={paymentMethod === method}
                              onPress={() => setPaymentMethod(paymentMethod === method ? null : method)} />
                          ))}
                        </ChipRow>
                      </View>
                      <View style={styles.group}>
                        <FieldLabel>RECEIPT / PHOTO</FieldLabel>
                        <ChipRow>
                          <Chip label={isPicking ? 'Opening...' : 'Take photo'} selected={false}
                            onPress={() => { if (!isPicking) void pickReceipt('camera'); }} />
                          <Chip label="Choose photo" selected={false}
                            onPress={() => { if (!isPicking) void pickReceipt('library'); }} />
                        </ChipRow>
                        {receiptUri && (
                          <>
                            <Image source={{ uri: receiptUri }} style={styles.receipt} resizeMode="contain" accessibilityLabel="Receipt preview" />
                            <Chip label="Remove photo" selected={false} onPress={() => setReceiptUri(null)} />
                          </>
                        )}
                      </View>
                      <View style={styles.group}>
                        <FieldLabel>TAGS</FieldLabel>
                        <TextInput value={tags} onChangeText={setTags} maxLength={300}
                          placeholder="e.g. lunch, work, reimbursable" placeholderTextColor={colors.textSubtle}
                          style={formStyles.input} accessibilityLabel="Tags, separated by commas" />
                        <Text style={styles.hint}>Separate tags with commas.</Text>
                      </View>
                    </>
                  )}
                </>
              )}
            </>
          )}
          {error && <Text style={formStyles.error}>{error}</Text>}
        </ScrollView>
        {!noWallets && (
          <View style={styles.saveBar}>
            <Text style={styles.summary} numberOfLines={1}>
              {amountMinor ? formatMoney(amountMinor, { currency: account?.currency ?? currency }) : 'Enter amount'}
              {categoryId ? ` → ${categoryInfo(categoryId)?.label}` : ''}
              {account ? ` → ${account.name}` : ''}
              {isExpense && merchant.trim() ? ` → ${merchant.trim()}` : ''}
              {` → ${occurredAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
            </Text>
            <PrimaryButton label={title} onPress={handleSave}
              disabled={!canSave || isPicking} loading={isSaving} />
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: colors.background },
  hint: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  group: { gap: spacing.sm },
  amountCard: { padding: spacing.lg, backgroundColor: colors.primarySoft, borderRadius: radius.lg },
  amountInput: { color: colors.text, fontSize: 40, fontWeight: '800', minHeight: 60 },
  choiceRow: { gap: spacing.sm },
  category: { minWidth: 90, minHeight: 76, alignItems: 'center', justifyContent: 'center', padding: spacing.sm,
    gap: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  selectedCategory: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  categoryText: { color: colors.text, fontSize: 12, fontWeight: '600' },
  dateRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  detailsToggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  detailsTitle: { color: colors.primary, fontSize: 15, fontWeight: '700' },
  notes: { minHeight: 96, paddingVertical: spacing.md, textAlignVertical: 'top' },
  receipt: { width: '100%', height: 220, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  saveBar: { width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: 22, paddingVertical: spacing.md,
    gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background },
  summary: { color: colors.textMuted, fontSize: 12 },
});
