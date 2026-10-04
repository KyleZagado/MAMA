import { createThemedStyleSheet } from '../providers/theme-provider';
import { Ionicons } from '@expo/vector-icons';
import type { Session } from '@supabase/supabase-js';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PageHeader } from '../components/page-header';
import { CalendarToggleButton, CompactCalendar } from '../components/compact-calendar';
import { WorkoutScheduler } from '../components/workout-scheduler';
import { EXERCISES, MUSCLE_GROUPS, type MuscleGroup } from '../constants/exercises';
import { lightColors as colors, MAX_CONTENT_WIDTH, radius, spacing } from '../constants/theme';
import { getDatabase } from '../database';
import { deleteWorkoutLog, type WorkoutLog } from '../database/workouts';
import { activityInfo, formatDuration, formatKm } from '../lib/activity';
import { useWorkouts } from '../hooks/use-workouts';
import {
  bmiCategory,
  bodyMassIndex,
  formatBodyNumber,
  profileHeightCm,
  profileWeightKg,
} from '../lib/body-metrics';
import { fromDateKey, toDateKey } from '../lib/dates';

function monthKeyOf(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

function describeLog(log: WorkoutLog) {
  if (log.duration_min) return `${log.duration_min} min`;
  const volume = `${log.sets ?? 1} × ${log.reps ?? 1}`;
  return log.weight_kg ? `${volume} · ${log.weight_kg} kg` : volume;
}

export function Fitness({ session }: { session: Session }) {
  const todayKey = toDateKey(new Date());
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [selectedKey, setSelectedKey] = useState(todayKey);
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState<MuscleGroup | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'schedule' | 'history'>('schedule');
  const [calendarOpen, setCalendarOpen] = useState(false);

  const weightKg = profileWeightKg(session);
  const heightCm = profileHeightCm(session);
  const bmi = bodyMassIndex(weightKg, heightCm);
  const monthKey = monthKeyOf(cursor.year, cursor.month);
  const { logs, activities, error, reload } = useWorkouts(session.user.id, monthKey);

  const daysWithLogs = useMemo(
    () => new Set([...logs.map((log) => log.log_date), ...activities.map((a) => a.log_date)]),
    [logs, activities],
  );
  const selectedLogs = logs.filter((log) => log.log_date === selectedKey);
  const selectedActivities = activities.filter((a) => a.log_date === selectedKey);
  const selectedCount = selectedLogs.length + selectedActivities.length;

  const exercises = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return EXERCISES.filter(
      (exercise) =>
        (!group || exercise.group === group) &&
        (!needle ||
          `${exercise.name} ${exercise.group} ${exercise.equipment}`.toLowerCase().includes(needle)),
    );
  }, [search, group]);

  function changeMonth(delta: number) {
    const next = new Date(cursor.year, cursor.month + delta, 1);
    const isCurrent =
      next.getFullYear() === new Date().getFullYear() && next.getMonth() === new Date().getMonth();
    setCursor({ year: next.getFullYear(), month: next.getMonth() });
    setSelectedKey(isCurrent ? todayKey : toDateKey(next));
  }

  function selectDate(dateKey: string) {
    const date = fromDateKey(dateKey);
    if (date.getFullYear() !== cursor.year || date.getMonth() !== cursor.month) {
      setCursor({ year: date.getFullYear(), month: date.getMonth() });
    }
    setSelectedKey(dateKey);
  }

  function toggleCalendar() {
    if (activeTab !== 'history') {
      setActiveTab('history');
      setCalendarOpen(true);
      return;
    }
    setCalendarOpen((open) => !open);
  }

  function confirmDelete(log: WorkoutLog) {
    Alert.alert(`Remove ${log.exercise_name}?`, undefined, [
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            setActionError(null);
            await deleteWorkoutLog(await getDatabase(session.user.id), log.id);
            await reload();
          } catch (e: unknown) {
            setActionError(e instanceof Error ? e.message : 'Could not remove this entry.');
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  const selectedTitle = fromDateKey(selectedKey).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <PageHeader
          session={session}
          title="Fitness"
          actions={
            <CalendarToggleButton
              expanded={activeTab === 'history' && calendarOpen}
              onPress={toggleCalendar}
            />
          }
        />

        <Pressable
          onPress={() => router.push('/profile')}
          style={({ pressed }) => [styles.body, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={
            weightKg || heightCm
              ? `Body stats: ${weightKg ? `${weightKg} kilograms` : 'weight not set'}, ${heightCm ? `${heightCm} centimetres` : 'height not set'}${bmi ? `, BMI ${bmi}` : ''}. Edit in profile`
              : 'Add your weight and height in profile'
          }
        >
          {weightKg || heightCm ? (
            <>
              <BodyStat label="Weight" value={weightKg ? `${formatBodyNumber(weightKg)} kg` : '—'} />
              <View style={styles.bodyDivider} />
              <BodyStat label="Height" value={heightCm ? `${formatBodyNumber(heightCm)} cm` : '—'} />
              <View style={styles.bodyDivider} />
              <BodyStat label="BMI" value={bmi ? String(bmi) : '—'} meta={bmi ? bmiCategory(bmi) : undefined} />
            </>
          ) : (
            <>
              <Ionicons name="body-outline" size={16} color={colors.primary} />
              <Text style={[styles.flex, styles.bodyEmpty]}>Add weight & height in Profile</Text>
            </>
          )}
          <Ionicons name="chevron-forward" size={14} color={colors.textSubtle} />
        </Pressable>

        <View style={styles.tabs}>
          {(['schedule', 'history'] as const).map((tab) => (
            <Pressable
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={[styles.tab, activeTab === tab && styles.tabSelected]}
              accessibilityRole="button"
              accessibilityState={{ selected: activeTab === tab }}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextSelected]}>
                {tab === 'schedule' ? 'Schedule' : 'History'}
              </Text>
            </Pressable>
          ))}
        </View>

        {activeTab === 'schedule' ? (
          <WorkoutScheduler session={session} />
        ) : (
          <>
        <View style={styles.historyHeading}>
          <Text style={styles.sectionTitle}>Workout history</Text>
          <Text style={styles.historyMeta}>Logged workouts and activities</Text>
        </View>
        <CompactCalendar
          selectedDate={selectedKey}
          onSelectDate={selectDate}
          month={cursor}
          onChangeMonth={changeMonth}
          expanded={calendarOpen}
          onExpandedChange={setCalendarOpen}
          isMarked={(dateKey) => daysWithLogs.has(dateKey)}
          markedLabel="workout logged"
          meta={`${daysWithLogs.size} workout ${daysWithLogs.size === 1 ? 'day' : 'days'}`}
        />

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>{selectedTitle}</Text>
          <Text style={styles.sectionMeta}>
            {selectedCount} {selectedCount === 1 ? 'entry' : 'entries'}
          </Text>
        </View>
        {selectedActivities.map((activity) => {
          const info = activityInfo(activity.type);
          return (
            <Pressable
              key={activity.id}
              onPress={() => router.push({ pathname: '/activity-detail', params: { id: activity.id } })}
              style={[styles.logRow, styles.divider]}
              accessibilityRole="button"
              accessibilityLabel={`${info.label}, ${formatKm(activity.distance_m)} kilometers`}
            >
              <View style={[styles.logIcon, styles.activityIcon]}>
                <Ionicons name={info.icon} size={16} color={colors.accent} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.rowTitle}>{info.label}</Text>
                <Text style={styles.rowMeta}>
                  {formatDuration(activity.duration_s)} · {activity.calories} kcal
                  {activity.steps !== null ? ` · ${activity.steps.toLocaleString('en-US')} steps` : ''}
                </Text>
              </View>
              <Text style={styles.logValue}>{formatKm(activity.distance_m)} km</Text>
            </Pressable>
          );
        })}
        {selectedLogs.length ? (
          selectedLogs.map((log, index) => (
            <Pressable
              key={log.id}
              onPress={() => confirmDelete(log)}
              style={[styles.logRow, index < selectedLogs.length - 1 && styles.divider]}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${log.exercise_name}`}
            >
              <View style={styles.logIcon}>
                <Ionicons name="barbell-outline" size={16} color={colors.primary} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {log.exercise_name}
                </Text>
                <Text style={styles.rowMeta}>{log.muscle_group}</Text>
              </View>
              <Text style={styles.logValue}>{describeLog(log)}</Text>
            </Pressable>
          ))
        ) : (
          selectedActivities.length === 0 && (
            <Text style={styles.empty}>No workout logged. Pick an exercise below to add one.</Text>
          )
        )}
        {selectedLogs.length > 0 && <Text style={styles.hint}>Tap an exercise to remove it.</Text>}

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Exercises</Text>
          <Text style={styles.sectionMeta}>{exercises.length} total</Text>
        </View>

        <View style={styles.search}>
          <Ionicons name="search" size={16} color={colors.textSubtle} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search exercises"
            placeholderTextColor={colors.textSubtle}
            style={styles.searchInput}
            accessibilityLabel="Search exercises"
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')} hitSlop={8} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={16} color={colors.textSubtle} />
            </Pressable>
          )}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          nestedScrollEnabled
          style={styles.chipScroll}
          contentContainerStyle={styles.chipRow}
        >
          {[null, ...MUSCLE_GROUPS].map((option) => {
            const selected = group === option;
            return (
              <Pressable
                key={option ?? 'all'}
                onPress={() => setGroup(option)}
                style={[styles.chip, selected && styles.chipSelected]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{option ?? 'All'}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {exercises.length ? (
          exercises.map((exercise, index) => (
            <Pressable
              key={exercise.id}
              onPress={() =>
                router.push({ pathname: '/log-exercise', params: { exercise: exercise.id, date: selectedKey } })
              }
              style={({ pressed }) => [
                styles.exerciseRow,
                index < exercises.length - 1 && styles.divider,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Log ${exercise.name}`}
            >
              <View style={styles.flex}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {exercise.name}
                </Text>
                <Text style={styles.rowMeta}>
                  {exercise.group} · {exercise.equipment}
                </Text>
              </View>
              <Ionicons name="add" size={20} color={colors.primary} />
            </Pressable>
          ))
        ) : (
          <Text style={styles.empty}>No exercises match your search.</Text>
        )}

        {(error || actionError) && <Text style={styles.error}>{error ?? actionError}</Text>}
          </>
        )}
      </ScrollView>

      <View style={styles.recordBar} pointerEvents="box-none">
        <Pressable
          onPress={() => router.push('/activity')}
          style={({ pressed }) => [styles.recordButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Record an activity: run, walk or ride"
        >
          <Ionicons name="navigate" size={18} color={colors.onPrimary} />
          <Text style={styles.recordText}>Record Activity</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function BodyStat({ label, value, meta }: { label: string; value: string; meta?: string }) {
  return (
    <View style={styles.bodyStat}>
      <Text style={styles.bodyLabel}>{label}</Text>
      <Text style={styles.bodyValue} numberOfLines={1}>
        {value}
        {meta ? <Text style={styles.bodyMeta}> {meta}</Text> : null}
      </Text>
    </View>
  );
}

const styles = createThemedStyleSheet((colors) => StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: 22,
    paddingTop: spacing.md,
    paddingBottom: 130,
  },
  pressed: { opacity: 0.7 },
  recordBar: { position: 'absolute', left: 22, right: 22, bottom: 38 },
  recordButton: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.heroBackground,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  recordText: { color: colors.onPrimary, fontSize: 15, fontWeight: '700' },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  bodyStat: { flex: 1, minWidth: 0 },
  bodyLabel: { color: colors.textSubtle, fontSize: 10, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  bodyValue: { color: colors.text, fontSize: 14, fontWeight: '700', marginTop: 1 },
  bodyMeta: { color: colors.textMuted, fontSize: 11, fontWeight: '500' },
  bodyDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: colors.border },
  bodyEmpty: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  tabs: {
    flexDirection: 'row',
    padding: 2,
    marginBottom: spacing.md,
    borderRadius: radius.sm + 2,
    backgroundColor: colors.surfaceAlt,
  },
  tab: { flex: 1, minHeight: 30, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  tabSelected: { backgroundColor: colors.surface, elevation: 1 },
  tabText: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  tabTextSelected: { color: colors.primary },
  historyHeading: { marginTop: spacing.sm, marginBottom: spacing.md },
  historyMeta: { color: colors.textMuted, fontSize: 13, marginTop: spacing.xs },
  activityIcon: { backgroundColor: colors.accentSoft },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '700', letterSpacing: -0.3 },
  sectionMeta: { color: colors.textMuted, fontSize: 13 },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  logIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
  },
  logValue: { color: colors.text, fontSize: 14, fontWeight: '700' },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  rowMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  empty: { color: colors.textMuted, fontSize: 14 },
  hint: { color: colors.textSubtle, fontSize: 12, textAlign: 'center', marginTop: spacing.sm },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 15, paddingVertical: 6 },
  chipScroll: { marginHorizontal: -22, marginVertical: spacing.sm, flexGrow: 0 },
  chipRow: { paddingHorizontal: 22, gap: 6 },
  chip: {
    minHeight: 28,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  chipSelected: { backgroundColor: colors.primarySoft },
  chipText: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  chipTextSelected: { color: colors.primary },
  exerciseRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10 },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing.lg },
}));
