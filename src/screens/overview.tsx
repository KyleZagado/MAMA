import { createThemedStyleSheet } from '../providers/theme-provider';
import { Ionicons } from '@expo/vector-icons';
import type { Session } from '@supabase/supabase-js';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PageHeader } from '../components/page-header';
import { RoundButton } from '../components/round-button';
import { lightColors as colors, MAX_CONTENT_WIDTH, radius, spacing } from '../constants/theme';
import { getDatabase } from '../database';
import { loadOverviewCalendar, type OverviewActivity, type OverviewActivityType } from '../database/overview';
import { fromDateKey, toDateKey } from '../lib/dates';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const ACTIVITY_STYLE: Record<
  OverviewActivityType,
  { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; color: string }
> = {
  income: { label: 'Income', icon: 'arrow-down-circle-outline', color: '#38825E' },
  expense: { label: 'Expense', icon: 'arrow-up-circle-outline', color: '#BA574D' },
  transfer: { label: 'Transfer', icon: 'swap-horizontal-outline', color: '#7563A8' },
  meal: { label: 'Meal', icon: 'restaurant-outline', color: '#D18A34' },
  water: { label: 'Water', icon: 'water-outline', color: '#3787B8' },
  task: { label: 'Task', icon: 'checkbox-outline', color: '#6477C4' },
  workout: { label: 'Workout', icon: 'barbell-outline', color: '#B46C37' },
  activity: { label: 'Activity', icon: 'walk-outline', color: '#208E82' },
  fast: { label: 'Fast', icon: 'hourglass-outline', color: '#7552A4' },
  five_two: { label: '5:2', icon: 'calendar-outline', color: '#7552A4' },
  journal: { label: 'Journal', icon: 'book-outline', color: '#B35D8A' },
};

function monthKeyOf(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

function monthRange(year: number, month: number) {
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  const from = new Date(start);
  from.setDate(from.getDate() - ((from.getDay() + 6) % 7));
  const through = new Date(end);
  through.setDate(through.getDate() + (6 - ((through.getDay() + 6) % 7)));
  return { from: toDateKey(from), through: toDateKey(through) };
}

function dayTitle(dateKey: string) {
  return fromDateKey(dateKey).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function timeLabel(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function monthLabel(year: number, month: number) {
  return new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export function Overview({ session, isVisible = true }: { session: Session; isVisible?: boolean }) {
  const today = toDateKey(new Date());
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [selectedDate, setSelectedDate] = useState(today);
  const [activities, setActivities] = useState<OverviewActivity[]>([]);
  const [monthCounts, setMonthCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);

  const range = useMemo(() => monthRange(cursor.year, cursor.month), [cursor]);
  const cells = useMemo(() => {
    const offset = (new Date(cursor.year, cursor.month, 1).getDay() + 6) % 7;
    const days = new Date(cursor.year, cursor.month + 1, 0).getDate();
    const monthKey = monthKeyOf(cursor.year, cursor.month);
    return [
      ...Array.from({ length: offset }, () => null),
      ...Array.from({ length: days }, (_, index) => `${monthKey}-${String(index + 1).padStart(2, '0')}`),
    ];
  }, [cursor]);

  const reload = useCallback(async () => {
      const token = ++request.current;
      setIsLoading(true);
      setError(null);
      try {
        const data = await loadOverviewCalendar(
          await getDatabase(session.user.id),
          range.from,
          range.through,
        );
        if (token !== request.current) return;
        setActivities(data.activities);
        setMonthCounts(data.monthCounts);
        setError(null);
      } catch (e: unknown) {
        if (token === request.current) {
          setError(e instanceof Error ? e.message : 'Could not load activity overview.');
        }
      } finally {
        if (token === request.current) setIsLoading(false);
      }
  }, [range, session.user.id]);

  useFocusEffect(
    useCallback(() => {
      if (!isVisible) return;
      void reload();
      return () => {
        request.current += 1;
      };
    }, [isVisible, reload]),
  );

  const selectedActivities = activities
    .filter((activity) => activity.date === selectedDate)
    .sort((a, b) => a.timestamp - b.timestamp);
  const activityCounts = selectedActivities.reduce<Partial<Record<OverviewActivityType, number>>>(
    (counts, activity) => {
      counts[activity.type] = (counts[activity.type] ?? 0) + 1;
      return counts;
    },
    {},
  );
  const monthActivities = activities.filter(
    (activity) => activity.date.slice(0, 7) === monthKeyOf(cursor.year, cursor.month),
  );
  const activeDays = Object.keys(monthCounts).filter(
    (date) => date.slice(0, 7) === monthKeyOf(cursor.year, cursor.month),
  ).length;

  function changeMonth(delta: number) {
    const next = new Date(cursor.year, cursor.month + delta, 1);
    setCursor({ year: next.getFullYear(), month: next.getMonth() });
    setSelectedDate(toDateKey(next));
  }

  function renderActivity(activity: OverviewActivity) {
    const visual = ACTIVITY_STYLE[activity.type];
    return (
      <View key={activity.id} style={styles.activityRow}>
        <View style={[styles.activityIcon, { backgroundColor: `${visual.color}18` }]}>
          <Ionicons name={visual.icon} size={19} color={visual.color} />
        </View>
        <View style={styles.activityBody}>
          <View style={styles.activityTitleRow}>
            <Text style={styles.activityTitle} numberOfLines={1}>{activity.title}</Text>
            <Text style={styles.activityTime}>{timeLabel(activity.timestamp)}</Text>
          </View>
          <Text style={styles.activityDetail}>{activity.detail}</Text>
          <Text style={[styles.activityType, { color: visual.color }]}>{visual.label}</Text>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <PageHeader session={session} title="Overview" />

        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{monthActivities.length}</Text>
            <Text style={styles.summaryLabel}>Activities this month</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{activeDays}</Text>
            <Text style={styles.summaryLabel}>Active days</Text>
          </View>
        </View>

        <View style={styles.calendarCard}>
          <View style={styles.monthRow}>
            <RoundButton icon="chevron-back" label="Previous month" size={30} iconSize={16} color={colors.textMuted} onPress={() => changeMonth(-1)} />
            <View style={styles.monthTitleBlock}>
              <Text style={styles.monthTitle}>{monthLabel(cursor.year, cursor.month)}</Text>
              <View style={styles.monthMetaRow}>
                <Text style={styles.monthMeta}>
                  {activeDays} active {activeDays === 1 ? 'day' : 'days'}
                </Text>
                {isLoading && <ActivityIndicator size="small" color={colors.textSubtle} />}
              </View>
            </View>
            <RoundButton icon="chevron-forward" label="Next month" size={30} iconSize={16} color={colors.textMuted} onPress={() => changeMonth(1)} />
          </View>
          <View style={styles.calendarGrid}>
            {WEEKDAYS.map((day, index) => (
              <Text key={`${day}-${index}`} style={styles.weekday}>{day}</Text>
            ))}
            {cells.map((dateKey, index) => {
              if (dateKey === null) return <View key={`blank-${index}`} style={styles.dayCell} />;
              const isSelected = dateKey === selectedDate;
              const count = monthCounts[dateKey] ?? 0;
              return (
                <Pressable
                  key={dateKey}
                  onPress={() => setSelectedDate(dateKey)}
                  style={styles.dayCell}
                  accessibilityRole="button"
                  accessibilityLabel={`${dayTitle(dateKey)}${count ? `, ${count} activities` : ', no activity'}`}
                  accessibilityState={{ selected: isSelected }}
                >
                  <View style={[styles.day, dateKey === today && styles.today, isSelected && styles.selectedDay]}>
                    <Text style={[styles.dayNumber, isSelected && styles.selectedDayNumber]}>
                      {fromDateKey(dateKey).getDate()}
                    </Text>
                  </View>
                  <View style={[styles.marker, count > 0 && styles.markerOn]} />
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.selectedHeading}>
          <View>
            <Text style={styles.sectionTitle}>{dayTitle(selectedDate)}</Text>
            <Text style={styles.sectionMeta}>
              {selectedActivities.length
                ? `${selectedActivities.length} ${selectedActivities.length === 1 ? 'activity' : 'activities'}`
                : 'No activities logged'}
            </Text>
          </View>
          {selectedDate !== today && (
            <Pressable
              onPress={() => {
                const now = new Date();
                setCursor({ year: now.getFullYear(), month: now.getMonth() });
                setSelectedDate(today);
              }}
              style={styles.todayButton}
              accessibilityRole="button"
            >
              <Text style={styles.todayButtonText}>Today</Text>
            </Pressable>
          )}
        </View>

        {Object.keys(activityCounts).length > 0 && (
          <View style={styles.categoryChips}>
            {(Object.entries(activityCounts) as [OverviewActivityType, number][]).map(([type, count]) => (
              <View key={type} style={styles.categoryChip}>
                <View style={[styles.categoryDot, { backgroundColor: ACTIVITY_STYLE[type].color }]} />
                <Text style={styles.categoryChipText}>
                  {ACTIVITY_STYLE[type].label} {count > 1 ? `· ${count}` : ''}
                </Text>
              </View>
            ))}
          </View>
        )}

        {selectedActivities.length ? (
          <View style={styles.activityCard}>
            {selectedActivities.map(renderActivity)}
          </View>
        ) : !isLoading ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Ionicons name="calendar-clear-outline" size={26} color={colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>Nothing logged this day</Text>
            <Text style={styles.emptyText}>Activity from your pages will show here as you log it.</Text>
          </View>
        ) : null}
        {error && (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable
              onPress={() => void reload()}
              style={styles.retryButton}
              accessibilityRole="button"
            >
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = createThemedStyleSheet((colors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: 22,
    paddingTop: spacing.md,
    paddingBottom: 60,
  },
  summaryRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  summaryCard: { flex: 1, padding: spacing.lg, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  summaryValue: { color: colors.text, fontSize: 24, fontWeight: '800' },
  summaryLabel: { color: colors.textMuted, fontSize: 12, marginTop: spacing.xs },
  calendarCard: { padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthTitleBlock: { alignItems: 'center' },
  monthTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  monthMetaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 2 },
  monthMeta: { color: colors.textMuted, fontSize: 12 },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.md },
  weekday: { width: '14.2857%', textAlign: 'center', color: colors.textSubtle, fontSize: 12, fontWeight: '700', marginBottom: spacing.sm },
  dayCell: { width: '14.2857%', height: 42, alignItems: 'center', justifyContent: 'center' },
  day: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 16 },
  today: { borderWidth: 1, borderColor: colors.primary },
  selectedDay: { backgroundColor: colors.heroBackground, borderColor: colors.heroBackground },
  dayNumber: { color: colors.text, fontSize: 14, fontWeight: '600' },
  selectedDayNumber: { color: colors.onPrimary },
  marker: { width: 5, height: 5, borderRadius: 3, marginTop: 2, backgroundColor: 'transparent' },
  markerOn: { backgroundColor: colors.accent },
  selectedHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xl, marginBottom: spacing.md },
  sectionTitle: { color: colors.text, fontSize: 19, fontWeight: '800' },
  sectionMeta: { color: colors.textMuted, fontSize: 13, marginTop: 3 },
  todayButton: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.primarySoft },
  todayButtonText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  categoryChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.md },
  categoryChip: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.surface },
  categoryDot: { width: 7, height: 7, borderRadius: 4 },
  categoryChipText: { color: colors.textMuted, fontSize: 11, fontWeight: '600' },
  activityCard: { paddingHorizontal: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  activityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 78, borderBottomWidth: 1, borderBottomColor: colors.border },
  activityIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md },
  activityBody: { flex: 1, minWidth: 0, paddingVertical: spacing.sm },
  activityTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  activityTitle: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '700' },
  activityTime: { color: colors.textSubtle, fontSize: 11 },
  activityDetail: { color: colors.textMuted, fontSize: 12, marginTop: 3 },
  activityType: { fontSize: 10, fontWeight: '700', marginTop: 3 },
  emptyCard: { alignItems: 'center', padding: spacing.xl, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  emptyIcon: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 26, backgroundColor: colors.primarySoft },
  emptyTitle: { color: colors.text, fontSize: 15, fontWeight: '800', marginTop: spacing.md },
  emptyText: { color: colors.textMuted, fontSize: 12, textAlign: 'center', lineHeight: 18, marginTop: spacing.xs },
  errorCard: { padding: spacing.md, marginTop: spacing.md, borderRadius: radius.md, backgroundColor: colors.dangerSoft },
  errorText: { color: colors.danger, fontSize: 13 },
  retryButton: { alignSelf: 'flex-start', paddingVertical: spacing.sm, marginTop: spacing.xs },
  retryText: { color: colors.danger, fontWeight: '700', fontSize: 13 },
}));
