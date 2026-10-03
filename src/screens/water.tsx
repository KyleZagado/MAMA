import { Ionicons } from '@expo/vector-icons';
import type { Session } from '@supabase/supabase-js';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { RoundButton } from '../components/round-button';
import { goBack } from '../components/screen-header';
import { lightColors as colors, MAX_CONTENT_WIDTH, radius, spacing } from '../constants/theme';
import { getDatabase } from '../database';
import { addWater, deleteWater, GLASS_ML, setWaterGoalGlasses } from '../database/consumption';
import { useConsumption } from '../hooks/use-consumption';
import { toDateKey } from '../lib/dates';
import { dayLabel, timestampOnDay, waterLabel, weekStartKey } from '../lib/dates-day';

const RING_SIZE = 240;
const STROKE = 24;
const RADIUS = (RING_SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const BAR_AREA = 96;
const MAX_GOAL_GLASSES = 30;

function glassesText(ml: number) {
  return (ml / GLASS_ML).toFixed(1);
}

export function Water({ session, dateKey }: { session: Session; dateKey: string }) {
  const todayKey = toDateKey(new Date());
  const { water, weekMl, goalGlasses, error, reload } = useConsumption(session.user.id, dateKey);
  const [customOpen, setCustomOpen] = useState(false);
  const [customMl, setCustomMl] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const totalMl = water.reduce((sum, entry) => sum + entry.amount_ml, 0);
  const goalMl = goalGlasses * GLASS_ML;
  const percent = Math.round((totalMl / goalMl) * 100);
  const progress = Math.min(totalMl / goalMl, 1);
  const glasses = totalMl / GLASS_ML;

  const weekStart = weekStartKey(dateKey);
  const selectedIndex = Math.round(
    (new Date(dateKey).getTime() - new Date(weekStart).getTime()) / 86_400_000,
  );
  const chartMax = Math.max(goalMl, ...weekMl);
  const activeDays = weekMl.filter((ml) => ml > 0);
  const average = activeDays.length ? activeDays.reduce((a, b) => a + b, 0) / activeDays.length : 0;

  const customValue = Number(customMl.trim());
  const customValid = Number.isInteger(customValue) && customValue > 0 && customValue <= 5000;

  async function run(action: (db: Awaited<ReturnType<typeof getDatabase>>) => Promise<unknown>) {
    try {
      setActionError(null);
      await action(await getDatabase(session.user.id));
      await reload();
      return true;
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Something went wrong.');
      return false;
    }
  }

  function log(ml: number) {
    return run((db) => addWater(db, ml, timestampOnDay(dateKey)));
  }

  function changeGoal(delta: number) {
    const next = goalGlasses + delta;
    if (next < 1 || next > MAX_GOAL_GLASSES) return;
    run((db) => setWaterGoalGlasses(db, next));
  }

  function confirmDelete(id: string) {
    Alert.alert('Delete this entry?', undefined, [
      { text: 'Delete', style: 'destructive', onPress: () => run((db) => deleteWater(db, id)) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <RoundButton icon="arrow-back" label="Go back" onPress={goBack} />
          <View style={styles.titleBlock}>
            <Text style={styles.title}>Water Intake</Text>
            <Text style={styles.subtitle}>{dayLabel(dateKey, todayKey)}</Text>
          </View>
          <View style={styles.topSpacer} />
        </View>

        <View style={styles.ringWrap}>
          <Svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RADIUS}
              stroke="#E3E8EE"
              strokeWidth={STROKE}
              fill="none"
            />
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RADIUS}
              stroke={colors.accent}
              strokeWidth={STROKE}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${CIRCUMFERENCE}`}
              strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
              transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
            />
          </Svg>
          <View style={styles.ringCenter} pointerEvents="none">
            <Text style={styles.ringValue}>{Number.isInteger(glasses) ? glasses : glasses.toFixed(1)}</Text>
            <Text style={styles.ringOf}>of {goalGlasses} Glasses</Text>
            <Text style={styles.ringPercent}>{percent}% GOAL</Text>
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable
            onPress={() => log(GLASS_ML)}
            style={({ pressed }) => [styles.action, styles.actionPrimary, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <Ionicons name="add" size={16} color={colors.onPrimary} />
            <Text style={[styles.actionText, styles.actionTextPrimary]}>1 Glass</Text>
          </Pressable>
          <Pressable
            onPress={() => log(GLASS_ML / 2)}
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <Ionicons name="add" size={16} color={colors.textMuted} />
            <Text style={styles.actionText}>½ Glass</Text>
          </Pressable>
          <Pressable
            onPress={() => setCustomOpen((open) => !open)}
            style={({ pressed }) => [styles.action, customOpen && styles.actionOpen, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityState={{ expanded: customOpen }}
          >
            <Text style={styles.actionText}>Custom</Text>
          </Pressable>
        </View>

        {customOpen && (
          <View style={styles.customRow}>
            <TextInput
              value={customMl}
              onChangeText={setCustomMl}
              placeholder="Amount in ml"
              placeholderTextColor={colors.textSubtle}
              keyboardType="number-pad"
              maxLength={4}
              style={styles.customInput}
              accessibilityLabel="Custom amount in milliliters"
            />
            <Pressable
              onPress={async () => {
                if (await log(customValue)) {
                  setCustomMl('');
                  setCustomOpen(false);
                }
              }}
              disabled={!customValid}
              style={({ pressed }) => [styles.customAdd, !customValid && styles.disabled, pressed && styles.pressed]}
              accessibilityRole="button"
            >
              <Text style={styles.customAddText}>Add</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Weekly Performance</Text>
            <Text style={styles.cardMeta}>Avg: {glassesText(average)} Glasses</Text>
          </View>
          <View style={styles.chart}>
            {weekMl.map((ml, index) => (
              <View key={WEEKDAYS[index]} style={styles.barColumn}>
                <View style={styles.barArea}>
                  <View
                    style={[
                      styles.bar,
                      { height: Math.max(4, (ml / chartMax) * BAR_AREA) },
                      index === selectedIndex && styles.barSelected,
                      ml === 0 && styles.barEmpty,
                    ]}
                  />
                </View>
                <Text style={styles.barLabel}>{WEEKDAYS[index]}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.goalRow}>
          <Text style={styles.goalLabel}>Daily goal · {goalMl.toLocaleString('en-US')} ml</Text>
          <View style={styles.stepper}>
            <RoundButton
              icon="remove"
              label="Decrease daily goal"
              size={36}
              disabled={goalGlasses <= 1}
              onPress={() => changeGoal(-1)}
            />
            <Text style={styles.goalValue}>{goalGlasses}</Text>
            <RoundButton
              icon="add"
              label="Increase daily goal"
              size={36}
              disabled={goalGlasses >= MAX_GOAL_GLASSES}
              onPress={() => changeGoal(1)}
            />
          </View>
        </View>

        <Text style={styles.logTitle}>{dateKey === todayKey ? 'Today’s Water Log' : 'Water Log'}</Text>
        {water.length ? (
          water.map((entry, index) => (
            <Pressable
              key={entry.id}
              onPress={() => confirmDelete(entry.id)}
              style={[styles.logRow, index < water.length - 1 && styles.logDivider]}
              accessibilityRole="button"
              accessibilityLabel="Delete water entry"
            >
              <View style={styles.dropIcon}>
                <Ionicons name="water" size={14} color="#3B82F6" />
              </View>
              <Text style={styles.logText} numberOfLines={1}>
                <Text style={styles.logTime}>
                  {new Date(entry.logged_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </Text>
                {' — '}
                {waterLabel(entry.logged_at)}
              </Text>
              <Text style={styles.logAmount}>{glassesText(entry.amount_ml)} glass</Text>
            </Pressable>
          ))
        ) : (
          <Text style={styles.empty}>Nothing logged yet. Tap “1 Glass” to start.</Text>
        )}
        {water.length > 0 && <Text style={styles.hint}>Tap an entry to delete it.</Text>}

        {(error || actionError) && <Text style={styles.error}>{error ?? actionError}</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: 22,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.45 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleBlock: { alignItems: 'center' },
  title: { color: colors.text, fontSize: 18, fontWeight: '800' },
  subtitle: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  topSpacer: { width: 44 },
  ringWrap: { alignItems: 'center', justifyContent: 'center', marginVertical: spacing.xl },
  ringCenter: { position: 'absolute', alignItems: 'center' },
  ringValue: { color: colors.text, fontSize: 56, fontWeight: '800' },
  ringOf: { color: colors.textMuted, fontSize: 14 },
  ringPercent: { color: colors.accent, fontSize: 12, fontWeight: '800', letterSpacing: 0.6, marginTop: 4 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: {
    flex: 1,
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  actionPrimary: { backgroundColor: colors.heroBackground, borderColor: colors.heroBackground },
  actionOpen: { borderColor: colors.heroBackground },
  actionText: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
  actionTextPrimary: { color: colors.onPrimary },
  customRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  customInput: {
    flex: 1,
    minHeight: 46,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 16,
  },
  customAdd: {
    minHeight: 46,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
  },
  customAddText: { color: colors.heroBackground, fontSize: 15, fontWeight: '700' },
  card: {
    marginTop: spacing.xl,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  cardMeta: { color: colors.textMuted, fontSize: 12 },
  chart: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.lg },
  barColumn: { flex: 1, alignItems: 'center', gap: spacing.sm },
  barArea: { height: BAR_AREA, justifyContent: 'flex-end' },
  bar: { width: 12, borderRadius: 6, backgroundColor: colors.heroBackground },
  barSelected: { backgroundColor: colors.accent },
  barEmpty: { backgroundColor: '#E3E8EE' },
  barLabel: { color: colors.textSubtle, fontSize: 11 },
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
  },
  goalLabel: { color: colors.textMuted, fontSize: 13 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  goalValue: { color: colors.text, fontSize: 16, fontWeight: '800', minWidth: 24, textAlign: 'center' },
  logTitle: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: spacing.xl, marginBottom: spacing.sm },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  logDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  dropIcon: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#E8F0FE',
  },
  logText: { flex: 1, color: colors.textMuted, fontSize: 14 },
  logTime: { color: colors.text, fontWeight: '800' },
  logAmount: { color: colors.text, fontSize: 14, fontWeight: '800' },
  empty: { color: colors.textMuted, fontSize: 14 },
  hint: { color: colors.textSubtle, fontSize: 12, textAlign: 'center', marginTop: spacing.md },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing.lg },
});
