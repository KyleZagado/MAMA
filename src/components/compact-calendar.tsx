import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { RoundButton } from './round-button';
import { lightColors as colors, radius, spacing } from '../constants/theme';
import { addDaysToKey, fromDateKey, toDateKey } from '../lib/dates';
import { createThemedStyleSheet } from '../providers/theme-provider';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

type Props = {
  selectedDate: string;
  onSelectDate: (dateKey: string) => void;
  /** Month shown in the expanded calendar. */
  month: { year: number; month: number };
  onChangeMonth: (delta: number) => void;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  isMarked: (dateKey: string) => boolean;
  /** Accessibility suffix for marked days, e.g. "activity logged". */
  markedLabel: string;
  meta?: string;
  isLoading?: boolean;
};

function dateLabel(dateKey: string) {
  return fromDateKey(dateKey).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export function CalendarToggleButton({
  expanded,
  onPress,
}: {
  expanded: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.toggle, expanded && styles.toggleActive]}
      accessibilityRole="button"
      accessibilityLabel={expanded ? 'Hide month calendar' : 'Show month calendar'}
      accessibilityState={{ expanded }}
    >
      <Ionicons name="calendar-outline" size={19} color={colors.primary} />
    </Pressable>
  );
}

export function CompactCalendar({
  selectedDate,
  onSelectDate,
  month,
  onChangeMonth,
  expanded,
  onExpandedChange,
  isMarked,
  markedLabel,
  meta,
  isLoading = false,
}: Props) {
  const today = toDateKey(new Date());

  const weekDays = useMemo(() => {
    const start = addDaysToKey(selectedDate, -((fromDateKey(selectedDate).getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, index) => addDaysToKey(start, index));
  }, [selectedDate]);

  const monthCells = useMemo(() => {
    const offset = (new Date(month.year, month.month, 1).getDay() + 6) % 7;
    const days = new Date(month.year, month.month + 1, 0).getDate();
    const prefix = `${month.year}-${String(month.month + 1).padStart(2, '0')}`;
    return [
      ...Array.from({ length: offset }, () => null),
      ...Array.from({ length: days }, (_, index) => `${prefix}-${String(index + 1).padStart(2, '0')}`),
    ];
  }, [month]);

  function renderDay(dateKey: string, compact: boolean) {
    const selected = dateKey === selectedDate;
    const marked = isMarked(dateKey);
    return (
      <Pressable
        key={dateKey}
        onPress={() => {
          if (!compact) onExpandedChange(false);
          onSelectDate(dateKey);
        }}
        style={compact ? undefined : styles.cell}
        accessibilityRole="button"
        accessibilityLabel={`${dateLabel(dateKey)}${marked ? `, ${markedLabel}` : ''}`}
        accessibilityState={{ selected }}
      >
        <View style={[styles.day, selected && styles.daySelected]}>
          <Text
            style={[
              styles.dayText,
              dateKey === today && !selected && styles.dayTextToday,
              selected && styles.dayTextSelected,
            ]}
          >
            {fromDateKey(dateKey).getDate()}
          </Text>
        </View>
        <View style={[styles.marker, marked && styles.markerOn]} />
      </Pressable>
    );
  }

  if (!expanded) {
    return (
      <View style={styles.weekStrip}>
        <Pressable
          onPress={() => onSelectDate(addDaysToKey(selectedDate, -7))}
          style={styles.weekArrow}
          accessibilityRole="button"
          accessibilityLabel="Previous week"
        >
          <Ionicons name="chevron-back" size={16} color={colors.textMuted} />
        </Pressable>
        {weekDays.map((dateKey, index) => (
          <View key={dateKey} style={styles.weekDay}>
            <Text style={styles.weekdayCompact}>{WEEKDAYS[index]}</Text>
            {renderDay(dateKey, true)}
          </View>
        ))}
        <Pressable
          onPress={() => onSelectDate(addDaysToKey(selectedDate, 7))}
          style={styles.weekArrow}
          accessibilityRole="button"
          accessibilityLabel="Next week"
        >
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </Pressable>
      </View>
    );
  }

  const monthTitle = new Date(month.year, month.month, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <View style={styles.card}>
      <View style={styles.monthRow}>
        <RoundButton icon="chevron-back" label="Previous month" size={30} iconSize={16} color={colors.textMuted} onPress={() => onChangeMonth(-1)} />
        <View style={styles.monthTitleBlock}>
          <Text style={styles.monthTitle}>{monthTitle}</Text>
          {(meta || isLoading) && (
            <View style={styles.monthMetaRow}>
              {meta ? <Text style={styles.monthMeta}>{meta}</Text> : null}
              {isLoading && <ActivityIndicator size="small" color={colors.textSubtle} />}
            </View>
          )}
        </View>
        <RoundButton icon="chevron-forward" label="Next month" size={30} iconSize={16} color={colors.textMuted} onPress={() => onChangeMonth(1)} />
      </View>
      <View style={styles.grid}>
        {WEEKDAYS.map((day, index) => (
          <Text key={`${day}${index}`} style={styles.weekday}>
            {day}
          </Text>
        ))}
        {monthCells.map((dateKey, index) =>
          dateKey === null ? <View key={`blank-${index}`} style={styles.cell} /> : renderDay(dateKey, false),
        )}
      </View>
    </View>
  );
}

const styles = createThemedStyleSheet((colors) => StyleSheet.create({
  toggle: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: colors.surfaceAlt,
  },
  toggleActive: { backgroundColor: colors.primarySoft },
  card: {
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthTitleBlock: { alignItems: 'center' },
  monthTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  monthMetaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 2 },
  monthMeta: { color: colors.textMuted, fontSize: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.md },
  weekday: {
    width: '14.2857%',
    textAlign: 'center',
    color: colors.textSubtle,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  cell: { width: '14.2857%', height: 42, alignItems: 'center', justifyContent: 'center' },
  day: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 16 },
  daySelected: { backgroundColor: colors.heroBackground },
  dayText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  dayTextToday: { color: colors.primary, fontWeight: '800' },
  dayTextSelected: { color: colors.onPrimary },
  marker: { width: 5, height: 5, borderRadius: 3, marginTop: 2, alignSelf: 'center', backgroundColor: 'transparent' },
  markerOn: { backgroundColor: colors.accent },
  weekStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 2,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  weekArrow: { width: 26, height: 44, alignItems: 'center', justifyContent: 'center' },
  weekDay: { flex: 1, alignItems: 'center' },
  weekdayCompact: { color: colors.textSubtle, fontSize: 10, fontWeight: '700', marginBottom: 2 },
}));
