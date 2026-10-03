import { Ionicons } from '@expo/vector-icons';
import type { Session } from '@supabase/supabase-js';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FieldLabel, PrimaryButton } from '../components/form';
import { PickerField } from '../components/picker-field';
import { ProfileButton } from '../components/profile-button';
import { TransactionRow } from '../components/transaction-row';
import { accountTypeInfo } from '../constants/finance';
import { lightColors as colors, MAX_CONTENT_WIDTH, radius, spacing } from '../constants/theme';
import { getDatabase } from '../database';
import { addBill, deleteBill, markBillPaid, setMonthlyBudget } from '../database/finance';
import { useCurrency } from '../hooks/use-currency';
import { useFinance } from '../hooks/use-finance';
import { fromDateKey, toDateKey } from '../lib/dates';
import { formatMoney, parseMoney } from '../lib/money';

type DashboardProps = {
  session: Session;
};

const RECENT_LIMIT = 5;

function firstName(session: Session) {
  const fullName = session.user.user_metadata?.display_name;
  return typeof fullName === 'string' && fullName.trim()
    ? fullName.trim().split(/\s+/)[0]
    : (session.user.email?.split('@')[0] ?? 'there');
}

export function Dashboard({ session }: DashboardProps) {
  const { wallets, transactions, totalMinor, goalMinor, monthly, isLoading, error, reload } =
    useFinance(session.user.id, RECENT_LIMIT);

  const currency = useCurrency();
  const goalProgress = goalMinor ? Math.max(0, Math.min(totalMinor / goalMinor, 1)) : 0;
  const [modal, setModal] = useState<'budget' | 'bill' | null>(null);
  const [budgetInput, setBudgetInput] = useState('');
  const [billName, setBillName] = useState('');
  const [billAmount, setBillAmount] = useState('');
  const [billDueDate, setBillDueDate] = useState(() => fromDateKey(toDateKey(new Date())));
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  function addTransaction(type: 'expense' | 'income') {
    router.push(wallets.length ? { pathname: '/add-transaction', params: { type } } : '/wallet-form');
  }

  async function saveBudget() {
    const parsed = budgetInput.trim() ? parseMoney(budgetInput) : null;
    if (budgetInput.trim() && (!parsed || parsed <= 0)) {
      setFormError('Enter a monthly budget greater than zero.');
      return;
    }
    setIsSaving(true);
    setFormError(null);
    try {
      await setMonthlyBudget(await getDatabase(session.user.id), parsed);
      setModal(null);
      await reload();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Could not save your budget.');
    } finally {
      setIsSaving(false);
    }
  }

  async function saveBill() {
    const amountMinor = parseMoney(billAmount);
    if (!billName.trim() || !amountMinor || amountMinor <= 0) {
      setFormError('Enter a bill name and an amount greater than zero.');
      return;
    }
    setIsSaving(true);
    setFormError(null);
    try {
      await addBill(await getDatabase(session.user.id), {
        name: billName.trim(),
        amountMinor,
        dueDate: toDateKey(billDueDate),
      });
      setModal(null);
      setBillName('');
      setBillAmount('');
      await reload();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Could not save this bill.');
    } finally {
      setIsSaving(false);
    }
  }

  function showBillActions(bill: (typeof monthly.bills)[number]) {
    Alert.alert(bill.name, `${formatMoney(bill.amount_minor, { currency })} · Due ${bill.due_date}`, [
      {
        text: 'Mark paid',
        onPress: async () => {
          try {
            await markBillPaid(await getDatabase(session.user.id), bill.id);
            await reload();
          } catch (e: unknown) {
            Alert.alert('Could not update bill', e instanceof Error ? e.message : 'Please try again.');
          }
        },
      },
      {
        text: 'Remove bill',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteBill(await getDatabase(session.user.id), bill.id);
            await reload();
          } catch (e: unknown) {
            Alert.alert('Could not remove bill', e instanceof Error ? e.message : 'Please try again.');
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>mama</Text>
            <Text style={styles.greeting}>Hi, {firstName(session)}</Text>
          </View>
          <ProfileButton session={session} />
        </View>

        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <Text style={styles.heroLabel}>Total balance</Text>
          </View>
          <Text style={styles.heroAmount} adjustsFontSizeToFit numberOfLines={1}>
            {formatMoney(totalMinor, { currency })}
          </Text>
          <Text style={styles.heroSubtext}>Across your wallets</Text>
        </View>

        <View style={styles.metricGrid}>
          <MetricCard label="Net worth" value={formatMoney(totalMinor, { currency, compact: true })} icon="trending-up" />
          <MetricCard
            label="Income this month"
            value={formatMoney(monthly.incomeMinor, { currency, compact: true })}
            icon="arrow-down-circle-outline"
            positive
          />
          <MetricCard
            label="Expenses this month"
            value={formatMoney(monthly.expensesMinor, { currency, compact: true })}
            icon="arrow-up-circle-outline"
            negative
          />
          <MetricCard
            label="Savings this month"
            value={formatMoney(monthly.savingsMinor, { currency, compact: true })}
            icon="save-outline"
            positive={monthly.savingsMinor >= 0}
            negative={monthly.savingsMinor < 0}
          />
        </View>

        <Pressable
          onPress={() => router.push('/income')}
          style={styles.insightCard}
          accessibilityRole="button"
          accessibilityLabel="Manage income sources, pay schedules and income history"
        >
          <Text style={styles.cardTitle}>Income &amp; pay schedules</Text>
          <Text style={styles.cardSubtitle}>Salary, side income, monthly / annual totals and 15th + 30th paydays →</Text>
        </Pressable>

        <View style={styles.insightCard}>
          <View style={styles.insightHeader}>
            <View>
              <Text style={styles.cardTitle}>Spending vs. budget</Text>
              <Text style={styles.cardSubtitle}>
                {monthly.budgetMinor
                  ? `${formatMoney(monthly.expensesMinor, { currency, compact: true })} of ${formatMoney(monthly.budgetMinor, { currency, compact: true })}`
                  : 'Set a monthly limit to track spending'}
              </Text>
            </View>
            <Pressable
              onPress={() => {
                setBudgetInput(monthly.budgetMinor ? String(monthly.budgetMinor / 100) : '');
                setFormError(null);
                setModal('budget');
              }}
              accessibilityRole="button"
            >
              <Text style={styles.sectionLink}>{monthly.budgetMinor ? 'Edit' : 'Set budget'}</Text>
            </Pressable>
          </View>
          <View
            style={styles.budgetTrack}
            accessibilityRole="progressbar"
            accessibilityValue={{
              min: 0,
              max: monthly.budgetMinor ?? 0,
              now: monthly.expensesMinor,
            }}
          >
            <View
              style={[
                styles.budgetFill,
                Boolean(monthly.budgetMinor && monthly.expensesMinor > monthly.budgetMinor) && styles.budgetOver,
                {
                  width: `${monthly.budgetMinor ? Math.min(monthly.expensesMinor / monthly.budgetMinor, 1) * 100 : 0}%`,
                },
              ]}
            />
          </View>
          {monthly.budgetMinor && monthly.expensesMinor > monthly.budgetMinor && (
            <Text style={styles.overBudgetText}>
              {formatMoney(monthly.expensesMinor - monthly.budgetMinor, { currency, compact: true })} over budget
            </Text>
          )}
        </View>

        <View style={styles.insightRow}>
          <Pressable onPress={() => router.push('/wallets')} style={[styles.insightCard, styles.halfCard]}>
            <Text style={styles.cardTitle}>Savings goal</Text>
            {goalMinor ? (
              <>
                <Text style={styles.insightValue}>{Math.round(goalProgress * 100)}%</Text>
                <Text style={styles.cardSubtitle}>
                  {formatMoney(totalMinor, { currency, compact: true })} of {formatMoney(goalMinor, { currency, compact: true })}
                </Text>
                <View style={styles.budgetTrack}>
                  <View style={[styles.budgetFill, { width: `${goalProgress * 100}%` }]} />
                </View>
              </>
            ) : (
              <Text style={styles.cardSubtitle}>Set a savings goal</Text>
            )}
          </Pressable>
          <View style={[styles.insightCard, styles.halfCard]}>
            <Text style={styles.cardTitle}>Spending streak</Text>
            <Text style={styles.insightValue}>🔥 {monthly.spendingStreak}</Text>
            <Text style={styles.cardSubtitle}>
              {monthly.spendingStreak === 1 ? 'day with spending' : 'consecutive days with spending'}
            </Text>
          </View>
        </View>

        <View style={styles.sectionHeading}>
          <View>
            <Text style={styles.sectionTitle}>Upcoming bills</Text>
            <Text style={styles.cardSubtitle}>Due in the next 30 days</Text>
          </View>
          <Pressable
            onPress={() => {
              setBillName('');
              setBillAmount('');
              setBillDueDate(fromDateKey(toDateKey(new Date())));
              setFormError(null);
              setModal('bill');
            }}
            accessibilityRole="button"
          >
            <Text style={styles.sectionLink}>+ Add bill</Text>
          </Pressable>
        </View>
        {monthly.bills.length ? (
          <View style={styles.billList}>
            {monthly.bills.map((bill) => (
              <Pressable
                key={bill.id}
                onPress={() => showBillActions(bill)}
                style={({ pressed }) => [styles.billRow, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={`${bill.name}, ${formatMoney(bill.amount_minor, { currency })}, due ${bill.due_date}`}
              >
                <View style={styles.billIcon}>
                  <Ionicons name="receipt-outline" size={19} color={colors.primary} />
                </View>
                <View style={styles.billDetails}>
                  <Text style={styles.billName} numberOfLines={1}>{bill.name}</Text>
                  <Text style={styles.cardSubtitle}>Due {formatBillDate(bill.due_date)}</Text>
                </View>
                <Text style={styles.billAmount}>{formatMoney(bill.amount_minor, { currency, compact: true })}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <Pressable
            onPress={() => {
              setBillName('');
              setBillAmount('');
              setBillDueDate(fromDateKey(toDateKey(new Date())));
              setFormError(null);
              setModal('bill');
            }}
            style={styles.emptyBill}
          >
            <Text style={styles.empty}>No upcoming bills. Tap + Add bill to add a reminder.</Text>
          </Pressable>
        )}

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>My Wallets</Text>
          <Pressable onPress={() => router.push('/wallets')} hitSlop={8}>
            <Text style={styles.sectionLink}>Manage</Text>
          </Pressable>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.walletScroll}
          nestedScrollEnabled
          contentContainerStyle={styles.walletRow}
        >
          {wallets.map((wallet) => {
            const info = accountTypeInfo(wallet.type);
            return (
              <Pressable
                key={wallet.id}
                onPress={() => router.push({ pathname: '/wallet-detail', params: { id: wallet.id } })}
                style={({ pressed }) => [styles.walletCard, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={`${wallet.name}, ${formatMoney(wallet.balance_minor, { currency: wallet.currency })}`}
              >
                <View style={styles.walletTop}>
                  <View style={[styles.walletIcon, { backgroundColor: info.background }]}>
                    <Ionicons name={info.icon} size={22} color={info.foreground} />
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
                </View>
                <Text style={styles.walletName} numberOfLines={1}>
                  {wallet.name}
                </Text>
                <Text style={styles.walletBalance} numberOfLines={1}>
                  {formatMoney(wallet.balance_minor, { currency: wallet.currency, compact: true })}
                </Text>
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => router.push('/wallet-form')}
            style={({ pressed }) => [styles.walletCard, styles.addCard, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Add wallet"
          >
            <Ionicons name="add-circle-outline" size={30} color={colors.primary} />
            <Text style={styles.addText}>Add wallet</Text>
          </Pressable>
        </ScrollView>

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Recent Transactions</Text>
          <Pressable onPress={() => router.push('/transactions')} hitSlop={8}>
            <Text style={styles.sectionLink}>See All</Text>
          </Pressable>
        </View>
        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={styles.loading} />
        ) : transactions.length ? (
          <View>
            {transactions.map((item, index) => (
              <TransactionRow key={item.id} item={item} showDivider={index < transactions.length - 1} />
            ))}
          </View>
        ) : (
          <Text style={styles.empty}>
            {wallets.length
              ? 'No transactions yet. Tap + to add your first one.'
              : 'Create a wallet to start tracking your money.'}
          </Text>
        )}

        {error && <Text style={styles.error}>Could not load your data: {error}</Text>}
      </ScrollView>

      <View style={styles.quickActions}>
        <Pressable
          onPress={() => addTransaction('expense')}
          style={({ pressed }) => [styles.quickButton, styles.expenseButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Add Expense"
        >
          <Ionicons name="add" size={21} color={colors.onPrimary} />
          <Text style={styles.quickButtonText}>Add Expense</Text>
        </Pressable>
        <Pressable
          onPress={() => addTransaction('income')}
          style={({ pressed }) => [styles.quickButton, styles.incomeButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Add Income"
        >
          <Ionicons name="add" size={21} color={colors.onPrimary} />
          <Text style={styles.quickButtonText}>Add Income</Text>
        </Pressable>
      </View>

      <Modal
        visible={modal !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModal(null)}
      >
        <SafeAreaView style={styles.modalSafeArea} edges={['top', 'bottom']}>
          <ScrollView
            contentContainerStyle={styles.modalContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.modalHeader}>
              <Pressable onPress={() => setModal(null)}>
                <Text style={styles.modalCancel}>Cancel</Text>
              </Pressable>
              <Text style={styles.modalTitle}>{modal === 'budget' ? 'Monthly budget' : 'Add a bill'}</Text>
              <View style={styles.modalSpacer} />
            </View>
            {modal === 'budget' ? (
              <>
                <View style={styles.formGroup}>
                  <FieldLabel>MONTHLY SPENDING LIMIT</FieldLabel>
                  <TextInput
                    value={budgetInput}
                    onChangeText={setBudgetInput}
                    placeholder="e.g. 1500"
                    placeholderTextColor={colors.textSubtle}
                    keyboardType="decimal-pad"
                    maxLength={14}
                    style={styles.input}
                    accessibilityLabel="Monthly budget"
                  />
                  <Text style={styles.formHint}>Leave empty and save to remove the budget.</Text>
                </View>
                {formError && <Text style={styles.error}>{formError}</Text>}
                <PrimaryButton label="Save budget" onPress={saveBudget} loading={isSaving} />
              </>
            ) : (
              <>
                <View style={styles.formGroup}>
                  <FieldLabel>BILL NAME</FieldLabel>
                  <TextInput
                    value={billName}
                    onChangeText={setBillName}
                    placeholder="e.g. Electricity"
                    placeholderTextColor={colors.textSubtle}
                    maxLength={60}
                    style={styles.input}
                    accessibilityLabel="Bill name"
                  />
                </View>
                <View style={styles.formGroup}>
                  <FieldLabel>AMOUNT</FieldLabel>
                  <TextInput
                    value={billAmount}
                    onChangeText={setBillAmount}
                    placeholder="0.00"
                    placeholderTextColor={colors.textSubtle}
                    keyboardType="decimal-pad"
                    maxLength={14}
                    style={styles.input}
                    accessibilityLabel="Bill amount"
                  />
                </View>
                <View style={styles.formGroup}>
                  <FieldLabel>DUE DATE</FieldLabel>
                  <PickerField mode="date" value={billDueDate} onChange={setBillDueDate} />
                </View>
                {formError && <Text style={styles.error}>{formError}</Text>}
                <PrimaryButton label="Save bill" onPress={saveBill} loading={isSaving} />
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function MetricCard({
  label,
  value,
  icon,
  positive,
  negative,
}: {
  label: string;
  value: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  positive?: boolean;
  negative?: boolean;
}) {
  return (
    <View style={styles.metricCard}>
      <View style={styles.metricTop}>
        <Text style={styles.metricLabel}>{label}</Text>
        <Ionicons
          name={icon}
          size={19}
          color={negative ? colors.danger : positive ? colors.success : colors.primary}
        />
      </View>
      <Text style={[styles.metricValue, negative && styles.negativeValue]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

function formatBillDate(key: string) {
  return fromDateKey(key).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: 22,
    paddingTop: spacing.md,
    paddingBottom: 120,
  },
  pressed: { opacity: 0.75 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  brand: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.4,
    marginBottom: 4,
  },
  greeting: { color: colors.text, fontSize: 26, fontWeight: '700', letterSpacing: -0.8 },
  hero: {
    padding: 24,
    borderRadius: 32,
    backgroundColor: colors.heroBackground,
    gap: spacing.md,
  },
  heroSubtext: { color: colors.heroTextMuted, fontSize: 13 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroLabel: { color: colors.heroTextMuted, fontSize: 16 },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  pillText: { color: colors.heroBackground, fontSize: 13, fontWeight: '700' },
  heroAmount: { color: colors.heroText, fontSize: 44, fontWeight: '800', letterSpacing: -1 },
  goalRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginTop: spacing.xs },
  goalText: { color: colors.heroTextMuted, fontSize: 14 },
  track: {
    flex: 1,
    height: 6,
    overflow: 'hidden',
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  fill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.accent },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  metricCard: {
    width: '48.5%',
    minHeight: 86,
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metricTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs },
  metricLabel: { flex: 1, color: colors.textMuted, fontSize: 11, fontWeight: '600' },
  metricValue: { color: colors.text, fontSize: 17, fontWeight: '800', marginTop: spacing.sm },
  negativeValue: { color: colors.danger },
  insightCard: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.md,
  },
  insightHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  cardTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  cardSubtitle: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  budgetTrack: { height: 7, overflow: 'hidden', marginTop: spacing.md, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt },
  budgetFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.primary },
  budgetOver: { backgroundColor: colors.danger },
  overBudgetText: { color: colors.danger, fontSize: 12, fontWeight: '600', marginTop: spacing.xs },
  insightRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  halfCard: { flex: 1, minWidth: 0, marginTop: 0, padding: spacing.md },
  insightValue: { color: colors.primary, fontSize: 21, fontWeight: '800', marginTop: spacing.sm },
  billList: { paddingHorizontal: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface },
  billRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 62, borderBottomWidth: 1, borderBottomColor: colors.border },
  billIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, backgroundColor: colors.primarySoft },
  billDetails: { flex: 1, minWidth: 0 },
  billName: { color: colors.text, fontSize: 14, fontWeight: '700' },
  billAmount: { color: colors.text, fontSize: 14, fontWeight: '700' },
  emptyBill: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  sectionTitle: { color: colors.text, fontSize: 22, fontWeight: '700', letterSpacing: -0.4 },
  sectionLink: { color: colors.accent, fontSize: 16, fontWeight: '600' },
  walletScroll: { marginHorizontal: -22 },
  walletRow: { paddingHorizontal: 22, gap: spacing.md },
  walletCard: {
    width: 156,
    padding: spacing.lg,
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  walletTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  walletIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  walletName: { color: colors.textMuted, fontSize: 15 },
  walletBalance: { color: colors.text, fontSize: 20, fontWeight: '800', marginTop: 2 },
  addCard: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    backgroundColor: 'transparent',
  },
  addText: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  loading: { marginVertical: spacing.xl },
  empty: { color: colors.textMuted, fontSize: 14, paddingVertical: spacing.lg },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing.lg },
  quickActions: {
    position: 'absolute',
    left: 22,
    right: 22,
    bottom: 38,
    flexDirection: 'row',
    gap: spacing.md,
  },
  quickButton: {
    flex: 1,
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radius.md,
    elevation: 4,
  },
  expenseButton: { backgroundColor: colors.danger },
  incomeButton: { backgroundColor: colors.primary },
  quickButtonText: { color: colors.onPrimary, fontSize: 14, fontWeight: '700' },
  modalSafeArea: { flex: 1, backgroundColor: colors.background },
  modalContent: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingHorizontal: 22,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalCancel: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  modalTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  modalSpacer: { width: 48 },
  formGroup: { gap: spacing.sm },
  input: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 16,
  },
  formHint: { color: colors.textMuted, fontSize: 12 },
});
