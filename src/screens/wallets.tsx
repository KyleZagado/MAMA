import { createThemedStyleSheet } from '../providers/theme-provider';
import { Ionicons } from '@expo/vector-icons';
import type { Session } from '@supabase/supabase-js';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FieldLabel, formStyles, PrimaryButton } from '../components/form';
import { ScreenHeader } from '../components/screen-header';
import { accountTypeInfo } from '../constants/finance';
import { lightColors as colors, radius, spacing } from '../constants/theme';
import { getDatabase } from '../database';
import { setSavingsGoal } from '../database/finance';
import { useCurrency } from '../hooks/use-currency';
import { useFinance } from '../hooks/use-finance';
import { formatMoney, minorToInput, parseMoney } from '../lib/money';

export function Wallets({ session }: { session: Session }) {
  const { wallets, totalMinor, goalMinor, isLoading, error } = useFinance(session.user.id, 1);
  const currency = useCurrency();
  const [goalEdit, setGoalEdit] = useState<string | null>(null);
  const [savedGoal, setSavedGoal] = useState<number | null | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const currentGoal = savedGoal === undefined ? goalMinor : savedGoal;
  const goal = goalEdit ?? (currentGoal ? minorToInput(currentGoal) : '');
  const trimmed = goal.trim();
  const parsed = trimmed ? parseMoney(trimmed) : null;
  const invalid = trimmed.length > 0 && (parsed === null || parsed === 0);
  const unchanged = (parsed ?? null) === (currentGoal ?? null);

  async function saveGoal() {
    setIsSaving(true);
    setMessage(null);
    try {
      const db = await getDatabase(session.user.id);
      await setSavingsGoal(db, parsed);
      setSavedGoal(parsed);
      setGoalEdit(null);
      setMessage({ ok: true, text: parsed ? 'Savings goal saved.' : 'Savings goal removed.' });
    } catch (e: unknown) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'Could not save the goal.' });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={formStyles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <ScreenHeader title="Manage Wallets" />
          {error && <Text style={formStyles.error}>{error}</Text>}

          <View style={styles.total}>
            <Text style={styles.totalLabel}>Total balance</Text>
            <Text style={styles.totalValue}>{formatMoney(totalMinor, { currency })}</Text>
          </View>

          <View style={formStyles.card}>
            {wallets.map((wallet, index) => {
              const info = accountTypeInfo(wallet.type);
              return (
                <Pressable
                  key={wallet.id}
                  onPress={() => router.push({ pathname: '/wallet-detail', params: { id: wallet.id } })}
                  style={({ pressed }) => [
                    styles.row,
                    index < wallets.length - 1 && styles.divider,
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="button"
                >
                  <View style={[styles.icon, { backgroundColor: info.background }]}>
                    <Ionicons name={info.icon} size={22} color={info.foreground} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.name} numberOfLines={1}>
                      {wallet.name}
                    </Text>
                    <Text style={styles.meta} numberOfLines={1}>
                      {wallet.details ? `${info.label} · ${wallet.details}` : info.label}
                    </Text>
                  </View>
                  <Text style={styles.balance}>{formatMoney(wallet.balance_minor, { currency: wallet.currency })}</Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
                </Pressable>
              );
            })}
            {!wallets.length && !isLoading && (
              <Text style={styles.meta}>No wallets yet. Create your first one below.</Text>
            )}
          </View>

          <PrimaryButton label="Add wallet" onPress={() => router.push('/wallet-form')} />

          <View style={formStyles.card}>
            <FieldLabel>SAVINGS GOAL</FieldLabel>
            <TextInput
              value={goal}
              onChangeText={(text) => {
                setGoalEdit(text);
                setMessage(null);
              }}
              placeholder="e.g. 30000"
              placeholderTextColor={colors.textSubtle}
              keyboardType="decimal-pad"
              maxLength={14}
              style={formStyles.input}
              accessibilityLabel="Savings goal"
            />
            {invalid && <Text style={formStyles.error}>Enter an amount greater than zero.</Text>}
            {message && (
              <Text style={[styles.message, message.ok ? styles.ok : formStyles.error]}>{message.text}</Text>
            )}
            <View style={formStyles.gap}>
              <PrimaryButton
                label="Save goal"
                onPress={saveGoal}
                disabled={invalid || unchanged}
                loading={isSaving}
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = createThemedStyleSheet((colors) => StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: colors.background },
  total: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.heroBackground,
    gap: spacing.xs,
  },
  totalLabel: { color: colors.heroTextMuted, fontSize: 14 },
  totalValue: { color: colors.heroText, fontSize: 30, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  pressed: { opacity: 0.7 },
  icon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  name: { color: colors.text, fontSize: 16, fontWeight: '600' },
  meta: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  balance: { color: colors.text, fontSize: 16, fontWeight: '700' },
  message: { fontSize: 13 },
  ok: { color: colors.success },
}));
