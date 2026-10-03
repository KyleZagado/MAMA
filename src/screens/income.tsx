import { createThemedStyleSheet } from '../providers/theme-provider';
import type { Session } from '@supabase/supabase-js';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform,
  Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chip, ChipRow, FieldLabel, formStyles, PrimaryButton } from '../components/form';
import { PickerField } from '../components/picker-field';
import { ScreenHeader } from '../components/screen-header';
import { TransactionDetails } from '../components/transaction-details';
import { TransactionRow } from '../components/transaction-row';
import { CATEGORIES, categoryInfo } from '../constants/finance';
import { lightColors as colors, radius, spacing } from '../constants/theme';
import { getDatabase } from '../database';
import { deleteTransaction, listWallets, type TransactionItem, type Wallet } from '../database/finance';
import {
  addIncomeSchedule, confirmIncome, getIncomeTotals, listExpectedIncome, listIncomeHistory,
  listIncomeSchedules, removeIncomeSchedule, type ExpectedIncome, type IncomeSchedule, type IncomeTotals,
} from '../database/income';
import { useCurrency } from '../hooks/use-currency';
import { toDateKey } from '../lib/dates';
import { INCOME_FREQUENCIES, incomePeriod, type IncomeFrequency } from '../lib/income-recurrence';
import { formatMoney, parseMoney } from '../lib/money';

const incomeCategories = CATEGORIES.filter((item) => item.kind === 'income');
const emptyTotals: IncomeTotals = { currencies: [], categories: [] };

export function Income({ session }: { session: Session }) {
  const currency = useCurrency();
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [annual, setAnnual] = useState(false);
  const monthlyPeriod = useMemo(() => incomePeriod(month), [month]);
  const annualPeriod = useMemo(() => incomePeriod(month, true), [month]);
  const historyPeriod = annual ? annualPeriod : monthlyPeriod;
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [schedules, setSchedules] = useState<IncomeSchedule[]>([]);
  const [expected, setExpected] = useState<ExpectedIncome[]>([]);
  const [monthlyTotals, setMonthlyTotals] = useState(emptyTotals);
  const [annualTotals, setAnnualTotals] = useState(emptyTotals);
  const [history, setHistory] = useState<TransactionItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSchedule, setShowSchedule] = useState(false);
  const [confirming, setConfirming] = useState<ExpectedIncome | null>(null);
  const [amount, setAmount] = useState('');
  const [receivedAt, setReceivedAt] = useState(() => new Date());
  const [selected, setSelected] = useState<TransactionItem | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const saving = useRef(false);
  const generation = useRef(0);
  const morePending = useRef(false);
  const today = toDateKey(new Date());

  const reload = useCallback(async () => {
    const request = ++generation.current;
    setIsLoading(true);
    setLoadingMore(false);
    setError(null);
    try {
      const db = await getDatabase(session.user.id);
      const [nextWallets, nextSchedules, nextExpected, monthly, yearly, rows] = await Promise.all([
        listWallets(db), listIncomeSchedules(db),
        listExpectedIncome(db, monthlyPeriod.from, monthlyPeriod.through),
        getIncomeTotals(db, monthlyPeriod.startAt, monthlyPeriod.endAt),
        getIncomeTotals(db, annualPeriod.startAt, annualPeriod.endAt),
        listIncomeHistory(db, historyPeriod.startAt, historyPeriod.endAt),
      ]);
      if (request !== generation.current) return;
      setWallets(nextWallets);
      setSchedules(nextSchedules);
      setExpected(nextExpected);
      setMonthlyTotals(monthly);
      setAnnualTotals(yearly);
      setHistory(rows);
      setHasMore(rows.length === 50);
    } catch (e: unknown) {
      if (request === generation.current) setError(e instanceof Error ? e.message : 'Could not load income.');
    } finally {
      if (request === generation.current) setIsLoading(false);
    }
  }, [session.user.id, monthlyPeriod, annualPeriod, historyPeriod]);

  useFocusEffect(useCallback(() => {
    void reload();
    return () => { generation.current++; };
  }, [reload]));

  async function loadMore() {
    if (isLoading || morePending.current || !hasMore) return;
    morePending.current = true;
    const request = generation.current;
    setLoadingMore(true);
    setError(null);
    try {
      const rows = await listIncomeHistory(await getDatabase(session.user.id),
        historyPeriod.startAt, historyPeriod.endAt, history.length);
      if (request !== generation.current) return;
      setHistory((current) => [...current, ...rows]);
      setHasMore(rows.length === 50);
    } catch (e: unknown) {
      if (request === generation.current) setError(e instanceof Error ? e.message : 'Could not load more income.');
    } finally {
      morePending.current = false;
      if (request === generation.current) setLoadingMore(false);
    }
  }

  async function receive() {
    if (!confirming || saving.current) return;
    const amountMinor = parseMoney(amount);
    if (!amountMinor || amountMinor <= 0) {
      setFormError('Enter the amount actually received, greater than zero.');
      return;
    }
    saving.current = true;
    setIsSaving(true);
    setFormError(null);
    try {
      await confirmIncome(await getDatabase(session.user.id), {
        scheduleId: confirming.schedule.id, dueDate: confirming.dueDate,
        amountMinor, receivedAt: receivedAt.getTime(),
      });
      setConfirming(null);
      await reload();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Could not confirm this payment.');
    } finally {
      saving.current = false;
      setIsSaving(false);
    }
  }

  function removeSchedule(schedule: IncomeSchedule) {
    Alert.alert('Remove pay schedule?', `${schedule.name}: future expected payments will be removed. Recorded income stays in history.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try {
          await removeIncomeSchedule(await getDatabase(session.user.id), schedule.id);
          await reload();
        } catch (e: unknown) {
          Alert.alert('Could not remove schedule', e instanceof Error ? e.message : 'Please try again.');
        }
      } },
    ]);
  }

  function removeTransaction(item: TransactionItem) {
    Alert.alert('Delete income?', 'Your balance and totals will update. A scheduled payment can then be confirmed again.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await deleteTransaction(await getDatabase(session.user.id), item.id);
          setSelected(null);
          await reload();
        } catch (e: unknown) {
          Alert.alert('Could not delete income', e instanceof Error ? e.message : 'Please try again.');
        }
      } },
    ]);
  }

  const totals = annual ? annualTotals : monthlyTotals;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <FlatList
        data={isLoading || error ? [] : history}
        keyExtractor={(item) => item.id}
        contentContainerStyle={formStyles.content}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.stack}>
            <ScreenHeader title="Income" />
            <Text style={styles.hint}>Track every source. Expected payments only affect your balance after you confirm receipt.</Text>
            <PrimaryButton label="+ Add Income" onPress={() => router.push({ pathname: '/add-transaction', params: { type: 'income' } })} />
            <View style={styles.monthRow}>
              <Chip label="Previous" selected={false} onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} />
              <Text style={styles.heading}>{month.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</Text>
              <Chip label="Next" selected={false} onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} />
            </View>
            {isLoading ? <ActivityIndicator color={colors.primary} /> : error ? (
              <View style={styles.stack}>
                <Text style={formStyles.error}>{error}</Text>
                <PrimaryButton label="Retry" onPress={() => void reload()} />
              </View>
            ) : (
              <>
                <View style={formStyles.card}>
                  <FieldLabel>{`RECEIVED IN ${month.toLocaleDateString('en-US', { month: 'long' }).toUpperCase()}`}</FieldLabel>
                  <IncomeTotalAmounts totals={monthlyTotals} currency={currency} />
                  <FieldLabel>{`RECEIVED IN ${month.getFullYear()}`}</FieldLabel>
                  <IncomeTotalAmounts totals={annualTotals} currency={currency} />
                  <Text style={styles.hint}>Actual receipt dates determine your monthly and annual totals.</Text>
                </View>
                <Text style={styles.heading}>Pay schedules</Text>
                {wallets.length ? <PrimaryButton label="+ Add recurring income" onPress={() => setShowSchedule(true)} /> :
                  <PrimaryButton label="Create a wallet to schedule income" onPress={() => router.push('/wallet-form')} />}
                {!schedules.length && <Text style={styles.hint}>Add salary, freelance work, or other recurring sources.</Text>}
                {schedules.map((schedule) => (
                  <View key={schedule.id} style={formStyles.card}>
                    <Text style={styles.heading}>{schedule.name}</Text>
                    <Text style={styles.hint}>
                      {categoryInfo(schedule.category_id)?.label} · {schedule.wallet_name} · {formatMoney(schedule.amount_minor, { currency: schedule.currency })} per payment
                    </Text>
                    <Text style={styles.hint}>{scheduleDescription(schedule)} · From {schedule.start_date}</Text>
                    <Pressable onPress={() => removeSchedule(schedule)} accessibilityRole="button" style={styles.textButton}>
                      <Text style={formStyles.error}>Remove schedule</Text>
                    </Pressable>
                  </View>
                ))}
                <Text style={styles.heading}>Expected payments this month</Text>
                <Text style={styles.hint}>Use Previous / Next to view upcoming months or confirm missed payments.</Text>
                {!expected.length && <Text style={styles.hint}>No payments scheduled for this month.</Text>}
                {expected.map((item) => (
                  <View key={`${item.schedule.id}/${item.dueDate}`} style={formStyles.card}>
                    <Text style={styles.heading}>{item.schedule.name}</Text>
                    <Text style={styles.hint}>{item.dueDate} · {item.schedule.wallet_name} · Expected {formatMoney(item.schedule.amount_minor, { currency: item.schedule.currency })}</Text>
                    <Text style={styles.hint}>{item.received ? 'Received' : item.dueDate < today ? 'Overdue / not confirmed' : item.dueDate === today ? 'Due today' : 'Upcoming'}</Text>
                    {!item.received && item.dueDate <= today && (
                      <PrimaryButton label="Confirm received" onPress={() => {
                        setFormError(null);
                        setAmount(String(item.schedule.amount_minor / 100));
                        setReceivedAt(new Date());
                        setConfirming(item);
                      }} />
                    )}
                  </View>
                ))}
                <Text style={styles.heading}>Income categories &amp; history</Text>
                <ChipRow>
                  <Chip label="Selected month" selected={!annual} onPress={() => setAnnual(false)} />
                  <Chip label="Selected year" selected={annual} onPress={() => setAnnual(true)} />
                </ChipRow>
                <View style={formStyles.card}>
                  {totals.categories.length ? totals.categories.map((item) => (
                    <View key={`${item.currency}/${item.category_id ?? 'uncategorized'}`} style={styles.monthRow}>
                      <Text style={styles.hint}>{categoryInfo(item.category_id)?.label ?? 'Other'}</Text>
                      <Text style={styles.heading}>{formatMoney(item.amount_minor, { currency: item.currency })}</Text>
                    </View>
                  )) : <Text style={styles.hint}>No received income in this period.</Text>}
                </View>
              </>
            )}
          </View>
        }
        renderItem={({ item }) => <TransactionRow item={item} showDivider onPress={() => setSelected(item)} />}
        ListFooterComponent={!isLoading && !error && hasMore
          ? <PrimaryButton label={loadingMore ? 'Loading...' : 'Load more income'} disabled={loadingMore} onPress={() => void loadMore()} />
          : null}
      />
      <TransactionDetails item={selected} onClose={() => setSelected(null)} onDelete={removeTransaction} />
      <IncomeDialog visible={Boolean(confirming)} title="Confirm received" onClose={() => { if (!isSaving) setConfirming(null); }}>
        <Text style={styles.hint}>{confirming?.schedule.name} · Scheduled {confirming?.dueDate}</Text>
        <FieldLabel>{`ACTUAL AMOUNT (${confirming?.schedule.currency ?? currency})`}</FieldLabel>
        <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" maxLength={14} style={formStyles.input} accessibilityLabel="Actual income received" />
        <FieldLabel>RECEIVED DATE</FieldLabel>
        <PickerField mode="date" value={receivedAt} onChange={(date) => setReceivedAt(new Date(date.getFullYear(), date.getMonth(), date.getDate()))} />
        <Text style={styles.hint}>This creates one income transaction in your wallet. Change the amount if your take-home pay differs.</Text>
        {formError && <Text style={formStyles.error}>{formError}</Text>}
        <PrimaryButton label="Record income received" loading={isSaving} onPress={() => void receive()} />
      </IncomeDialog>
      {showSchedule && <IncomeScheduleForm session={session} wallets={wallets} onClose={() => setShowSchedule(false)} onSaved={async () => {
        setShowSchedule(false);
        await reload();
      }} />}
    </SafeAreaView>
  );
}

function IncomeTotalAmounts({ totals, currency }: { totals: IncomeTotals; currency: string }) {
  return totals.currencies.length
    ? totals.currencies.map((item) => <Text key={item.currency} style={styles.total}>{formatMoney(item.totalMinor, { currency: item.currency })}</Text>)
    : <Text style={styles.total}>{formatMoney(0, { currency })}</Text>;
}

function scheduleDescription(schedule: IncomeSchedule) {
  if (schedule.frequency === 'monthly' || schedule.frequency === 'semimonthly') {
    return `Monthly on day(s) ${JSON.parse(schedule.month_days).join(' + ')} (last day in shorter months)`;
  }
  return INCOME_FREQUENCIES.find((item) => item.id === schedule.frequency)?.label;
}

function IncomeDialog({ visible, title, onClose, children }: {
  visible: boolean; title: string; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <KeyboardAvoidingView style={styles.safeArea} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={formStyles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.monthRow}>
              <Text style={styles.heading}>{title}</Text>
              <Chip label="Close" selected={false} onPress={onClose} />
            </View>
            {children}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function IncomeScheduleForm({ session, wallets, onClose, onSaved }: {
  session: Session; wallets: Wallet[]; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState(wallets[0]?.id ?? '');
  const [categoryId, setCategoryId] = useState('salary');
  const [frequency, setFrequency] = useState<IncomeFrequency>('semimonthly');
  const [startDate, setStartDate] = useState(() => new Date());
  const [firstDay, setFirstDay] = useState('15');
  const [secondDay, setSecondDay] = useState('30');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const saving = useRef(false);
  const wallet = wallets.find((item) => item.id === accountId);

  async function save() {
    if (saving.current) return;
    const amountMinor = parseMoney(amount);
    if (!amountMinor || !wallet) {
      setError('Choose a wallet and an amount greater than zero.');
      return;
    }
    saving.current = true;
    setIsSaving(true);
    setError(null);
    try {
      await addIncomeSchedule(await getDatabase(session.user.id), {
        name, amountMinor, accountId, categoryId, frequency, startDate: toDateKey(startDate),
        monthDays: frequency === 'monthly' ? [Number(firstDay)]
          : frequency === 'semimonthly' ? [Number(firstDay), Number(secondDay)] : [],
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not save this pay schedule.');
      saving.current = false;
      setIsSaving(false);
      return;
    }
    await onSaved();
  }

  return (
    <IncomeDialog visible title="Recurring income" onClose={() => { if (!isSaving) onClose(); }}>
      <FieldLabel>SOURCE NAME</FieldLabel>
      <TextInput value={name} onChangeText={setName} placeholder="e.g. Employer salary or design clients" maxLength={80} style={formStyles.input} />
      <FieldLabel>{`AMOUNT PER PAYMENT (${wallet?.currency ?? 'PHP'})`}</FieldLabel>
      <TextInput value={amount} onChangeText={setAmount} placeholder="15000" keyboardType="decimal-pad" maxLength={14} style={formStyles.input} />
      <Text style={styles.hint}>For twice-monthly pay, enter each payout amount, not your full monthly salary. Use separate schedules if amounts differ.</Text>
      <FieldLabel>INCOME CATEGORY</FieldLabel>
      <ChipRow>{incomeCategories.map((item) => <Chip key={item.id} label={item.label} selected={item.id === categoryId} onPress={() => setCategoryId(item.id)} />)}</ChipRow>
      <FieldLabel>DEPOSIT WALLET</FieldLabel>
      <ChipRow>{wallets.map((item) => <Chip key={item.id} label={item.name} selected={item.id === accountId} onPress={() => setAccountId(item.id)} />)}</ChipRow>
      <FieldLabel>PAY SCHEDULE</FieldLabel>
      <ChipRow>{INCOME_FREQUENCIES.map((item) => <Chip key={item.id} label={item.label} selected={item.id === frequency} onPress={() => setFrequency(item.id)} />)}</ChipRow>
      {(frequency === 'monthly' || frequency === 'semimonthly') && (
        <>
          <FieldLabel>{frequency === 'semimonthly' ? 'PAY DAYS (1-31)' : 'PAY DAY (1-31)'}</FieldLabel>
          <View style={styles.monthRow}>
            <TextInput value={firstDay} onChangeText={setFirstDay} keyboardType="number-pad" maxLength={2} style={[formStyles.input, styles.dayInput]} accessibilityLabel="First pay day" />
            {frequency === 'semimonthly' && <TextInput value={secondDay} onChangeText={setSecondDay} keyboardType="number-pad" maxLength={2} style={[formStyles.input, styles.dayInput]} accessibilityLabel="Second pay day" />}
          </View>
          {frequency === 'semimonthly' && <Chip label="Philippines: 15th + 30th" selected={firstDay === '15' && secondDay === '30'} onPress={() => { setFirstDay('15'); setSecondDay('30'); }} />}
          <Text style={styles.hint}>If a pay day does not exist, use the last day of that month. For two pay days that overlap in February, use separate monthly schedules.</Text>
        </>
      )}
      <FieldLabel>START DATE</FieldLabel>
      <PickerField mode="date" value={startDate} onChange={setStartDate} />
      <Text style={styles.hint}>Weekly / every 2 weeks repeat from the start date. Annual schedules repeat its month and day. No automatic deposits are made.</Text>
      {error && <Text style={formStyles.error}>{error}</Text>}
      <PrimaryButton label="Save pay schedule" loading={isSaving} onPress={() => void save()} />
    </IncomeDialog>
  );
}

const styles = createThemedStyleSheet((colors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  stack: { gap: spacing.lg },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  heading: { color: colors.text, fontSize: 16, fontWeight: '700', flexShrink: 1 },
  total: { color: colors.primary, fontSize: 28, fontWeight: '700' },
  hint: { color: colors.textMuted, fontSize: 14, lineHeight: 21 },
  dayInput: { flex: 1 },
  textButton: { minHeight: 40, justifyContent: 'center', alignSelf: 'flex-start', borderRadius: radius.sm },
}));
