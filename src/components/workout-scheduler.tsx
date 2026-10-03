import type { Session } from '@supabase/supabase-js';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PickerField } from './picker-field';
import { FieldLabel, PrimaryButton } from './form';
import { lightColors as colors, radius, spacing } from '../constants/theme';
import { getDatabase } from '../database';
import {
  addWorkoutSchedule,
  deleteWorkoutSchedule,
  listWorkoutScheduleInstances,
  updateWorkoutScheduleOccurrence,
  type WorkoutScheduleInstance,
  type WorkoutScheduleKind,
} from '../database/workout-schedules';
import { addDaysToKey, formatDateKey, formatTimeKey, fromDateKey, toDateKey } from '../lib/dates';
import { requestWorkoutReminderPermission, syncWorkoutReminders } from '../lib/workout-reminders';

type CalendarMode = 'day' | 'week' | 'month';

const WEEKDAYS = [
  { label: 'M', day: 1 },
  { label: 'T', day: 2 },
  { label: 'W', day: 3 },
  { label: 'T', day: 4 },
  { label: 'F', day: 5 },
  { label: 'S', day: 6 },
  { label: 'S', day: 0 },
];
const REMINDER_OPTIONS = [null, 5, 10, 15, 30] as const;
const DAY_NAMES = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function monthStart(key: string) {
  const date = fromDateKey(key);
  date.setDate(1);
  return toDateKey(date);
}

function monthEnd(key: string) {
  const date = fromDateKey(key);
  date.setMonth(date.getMonth() + 1, 0);
  return toDateKey(date);
}

function weekStart(key: string) {
  const date = fromDateKey(key);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return toDateKey(date);
}

function monthCells(key: string) {
  const first = fromDateKey(monthStart(key));
  const offset = (first.getDay() + 6) % 7;
  const count = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: count }, (_, index) =>
      toDateKey(new Date(first.getFullYear(), first.getMonth(), index + 1)),
    ),
  ];
}

function titleForDate(key: string) {
  return fromDateKey(key).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function endTime(startTime: string, duration: number) {
  const [hours, minutes] = startTime.split(':').map(Number);
  const start = new Date();
  start.setHours(hours, minutes, 0, 0);
  const date = new Date(start);
  date.setMinutes(date.getMinutes() + duration);
  const formatted = formatTimeKey(
    `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`,
  );
  return toDateKey(date) === toDateKey(start) ? formatted : `${formatted} next day`;
}

function scheduleId(instance: WorkoutScheduleInstance) {
  return instance.id.slice(0, instance.id.lastIndexOf(':'));
}

export function WorkoutScheduler({ session }: { session: Session }) {
  const today = toDateKey(new Date());
  const [selectedDate, setSelectedDate] = useState(today);
  const [mode, setMode] = useState<CalendarMode>('month');
  const [instances, setInstances] = useState<WorkoutScheduleInstance[]>([]);
  const [isFormVisible, setFormVisible] = useState(false);
  const [movingWorkout, setMovingWorkout] = useState<WorkoutScheduleInstance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reminderWarning, setReminderWarning] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const calendarGrid = React.useRef<View>(null);
  const touchedWorkoutId = React.useRef<string | null>(null);
  const calendarCells = React.useRef(
    new Map<string, { x: number; y: number; width: number; height: number }>(),
  );

  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<WorkoutScheduleKind>('workout');
  const [formDate, setFormDate] = useState(() => fromDateKey(today));
  const [startTime, setStartTime] = useState(() => {
    const date = new Date();
    date.setHours(7, 0, 0, 0);
    return date;
  });
  const [duration, setDuration] = useState('45');
  const [repeatWeekly, setRepeatWeekly] = useState(false);
  const [repeatDays, setRepeatDays] = useState<number[]>([]);
  const [reminderMinutes, setReminderMinutes] = useState<number | null>(15);

  const range = useMemo(() => {
    const first = monthStart(selectedDate);
    const last = monthEnd(selectedDate);
    const todayEnd = addDaysToKey(today, 14);
    const queryStart = addDaysToKey(first, -7);
    const queryEnd = last > todayEnd ? addDaysToKey(last, 7) : todayEnd;
    return { queryStart, queryEnd };
  }, [selectedDate, today]);

  const reload = useCallback(async () => {
    try {
      const db = await getDatabase(session.user.id);
      const [nextInstances, reminderSync] = await Promise.all([
        listWorkoutScheduleInstances(db, range.queryStart, range.queryEnd),
        syncWorkoutReminders(db),
      ]);
      setInstances(nextInstances);
      const hasReminders = nextInstances.some(
            (instance) =>
              instance.kind === 'workout' &&
              instance.status === 'scheduled' &&
              instance.reminderMinutes !== null,
          );
      setReminderWarning(
        !reminderSync.permissionGranted && hasReminders
          ? 'Workout reminders are saved, but notifications are turned off in device settings.'
          : reminderSync.omitted > 0
            ? `Only the next 50 workout reminders are queued; ${reminderSync.omitted} additional reminders could not be scheduled.`
            : null,
      );
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load your workout schedule.');
    }
  }, [range.queryEnd, range.queryStart, session.user.id]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const selectedInstances = instances.filter((instance) => instance.scheduledDate === selectedDate);
  const workoutToday = instances.filter(
    (instance) => instance.scheduledDate === today && instance.kind === 'workout',
  );
  const upcoming = instances
    .filter(
      (instance) =>
        instance.kind === 'workout' &&
        instance.status === 'scheduled' &&
        instance.scheduledDate >= today &&
        instance.scheduledDate <= addDaysToKey(today, 7),
    )
    .sort(
      (a, b) =>
        a.scheduledDate.localeCompare(b.scheduledDate) ||
        (a.startTime ?? '').localeCompare(b.startTime ?? ''),
    );

  const calendarDates = useMemo(() => {
    if (mode === 'day') return [];
    if (mode === 'week') {
      const first = weekStart(selectedDate);
      return Array.from({ length: 7 }, (_, index) => addDaysToKey(first, index));
    }
    return monthCells(selectedDate);
  }, [mode, selectedDate]);

  function changeDate(direction: number) {
    const increment = mode === 'day' ? direction : mode === 'week' ? direction * 7 : 0;
    if (mode !== 'month') {
      setSelectedDate(addDaysToKey(selectedDate, increment));
      return;
    }
    const next = fromDateKey(selectedDate);
    next.setMonth(next.getMonth() + direction, 1);
    setSelectedDate(toDateKey(next));
  }

  const refreshAfterChange = useCallback(() => reload(), [reload]);

  const changeInstance = useCallback(async (
    instance: WorkoutScheduleInstance,
    patch: { scheduledDate?: string; status?: 'scheduled' | 'skipped' | 'completed' },
  ) => {
    try {
      setError(null);
      await updateWorkoutScheduleOccurrence(await getDatabase(session.user.id), instance, patch);
      setMovingWorkout(null);
      if (patch.scheduledDate) setSelectedDate(patch.scheduledDate);
      await refreshAfterChange();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not update this scheduled workout.');
    }
  }, [refreshAfterChange, session.user.id]);

  const handleDatePress = useCallback((date: string) => {
    if (movingWorkout) {
      if (date !== movingWorkout.scheduledDate) {
        void changeInstance(movingWorkout, { scheduledDate: date, status: 'scheduled' });
      } else {
        setMovingWorkout(null);
      }
      return;
    }
    setSelectedDate(date);
  }, [changeInstance, movingWorkout]);

  const handleCalendarCellLayout = useCallback((date: string, event: LayoutChangeEvent) => {
    calendarCells.current.set(date, event.nativeEvent.layout);
  }, []);

  const dropWorkoutOnDate = useCallback((instance: WorkoutScheduleInstance, pageX: number, pageY: number) => {
    calendarGrid.current?.measureInWindow((gridX, gridY) => {
      const visibleDates = calendarDates.filter((date): date is string => date !== null);
      const targetDate = visibleDates.find((date) => {
        const cell = calendarCells.current.get(date);
        if (!cell) return false;
        const left = gridX + cell.x;
        const top = gridY + cell.y;
        return pageX >= left && pageX <= left + cell.width && pageY >= top && pageY <= top + cell.height;
      });
      if (targetDate) {
        void changeInstance(instance, { scheduledDate: targetDate, status: 'scheduled' });
      } else {
        setMovingWorkout(instance);
      }
    });
  }, [calendarDates, changeInstance]);

  const showWorkoutActions = useCallback((instance: WorkoutScheduleInstance) => {
    if (movingWorkout) return;
    const actions = [
      {
        text: instance.status === 'completed' ? 'Mark as planned' : 'Mark complete',
        onPress: () =>
          void changeInstance(instance, {
            status: instance.status === 'completed' ? 'scheduled' : 'completed',
          }),
      },
      {
        text: instance.status === 'skipped' ? 'Restore workout' : 'Skip workout',
        style: (instance.status === 'skipped' ? 'default' : 'destructive') as 'default' | 'destructive',
        onPress: () =>
          void changeInstance(instance, {
            status: instance.status === 'skipped' ? 'scheduled' : 'skipped',
          }),
      },
      {
        text: 'Move to another day',
        onPress: () => setMovingWorkout(instance),
      },
      {
        text: instance.isRecurring ? 'Remove recurring schedule' : 'Remove workout',
        style: 'destructive' as const,
        onPress: () =>
          Alert.alert(
            instance.isRecurring ? 'Remove this weekly schedule?' : 'Remove this workout?',
            instance.isRecurring ? 'This removes all future occurrences of this schedule.' : undefined,
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Remove',
                style: 'destructive',
                onPress: async () => {
                  try {
                    await deleteWorkoutSchedule(await getDatabase(session.user.id), scheduleId(instance));
                    await refreshAfterChange();
                  } catch (e: unknown) {
                    setError(e instanceof Error ? e.message : 'Could not remove this workout.');
                  }
                },
              },
            ],
          ),
      },
      { text: 'Cancel', style: 'cancel' as const },
    ];
    Alert.alert(instance.title, 'Long-press to move this workout to a date on the calendar.', actions);
  }, [changeInstance, movingWorkout, refreshAfterChange, session.user.id]);

  const handleTouchEnd = useCallback(
    (pageX: number, pageY: number) => {
      const touchedId = touchedWorkoutId.current;
      touchedWorkoutId.current = null;
      if (movingWorkout && touchedId === movingWorkout.id) {
        dropWorkoutOnDate(movingWorkout, pageX, pageY);
      }
    },
    [dropWorkoutOnDate, movingWorkout],
  );

  function openForm() {
    setTitle('');
    setKind('workout');
    setFormDate(fromDateKey(selectedDate));
    const defaultTime = new Date();
    defaultTime.setHours(7, 0, 0, 0);
    setStartTime(defaultTime);
    setDuration('45');
    setRepeatWeekly(false);
    setRepeatDays([]);
    setReminderMinutes(15);
    setFormVisible(true);
  }

  async function saveSchedule() {
    const trimmedTitle = title.trim();
    const durationValue = Number(duration);
    if (!trimmedTitle) {
      setError('Enter a name for this workout or rest day.');
      return;
    }
    if (kind === 'workout' && (!Number.isInteger(durationValue) || durationValue < 5 || durationValue > 360)) {
      setError('Workout duration must be between 5 and 360 minutes.');
      return;
    }
    if (repeatWeekly && repeatDays.length === 0) {
      setError('Choose at least one day for the weekly schedule.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const mayRemind =
        kind === 'workout' && reminderMinutes !== null
          ? await requestWorkoutReminderPermission()
          : true;
      await addWorkoutSchedule(await getDatabase(session.user.id), {
        title: trimmedTitle,
        kind,
        scheduledDate: toDateKey(formDate),
        startTime: kind === 'workout' ? formatClock(startTime) : null,
        durationMin: kind === 'workout' ? durationValue : null,
        recurrenceDays: repeatWeekly ? [...repeatDays].sort((a, b) => a - b) : null,
        reminderMinutes: kind === 'workout' && mayRemind ? reminderMinutes : null,
      });
      setFormVisible(false);
      setSelectedDate(toDateKey(formDate));
      setReminderWarning(
        mayRemind
          ? null
          : 'This workout was saved without a reminder because notifications are turned off.',
      );
      await refreshAfterChange();
      if (!mayRemind) {
        Alert.alert(
          'Workout saved without a reminder',
          'Notifications are disabled. You can enable them in your device settings and add the reminder again.',
        );
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not save this schedule.');
    } finally {
      setSaving(false);
    }
  }

  const dateTitle =
    mode === 'month'
      ? fromDateKey(selectedDate).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      : mode === 'week'
        ? `${formatDateKey(weekStart(selectedDate), 'short')} – ${formatDateKey(addDaysToKey(weekStart(selectedDate), 6), 'short')}`
        : titleForDate(selectedDate);

  return (
    <View onTouchEnd={(event) => handleTouchEnd(event.nativeEvent.pageX, event.nativeEvent.pageY)}>
      <View style={styles.dashboardCard}>
        <View style={styles.dashboardIcon}>
          <Text style={styles.dashboardIconText}>✓</Text>
        </View>
        <View style={styles.flex}>
          <Text style={styles.dashboardTitle}>Workout today</Text>
          {workoutToday.length ? (
            workoutToday.map((instance) => (
              <Text key={instance.id} style={styles.dashboardMeta} numberOfLines={1}>
                {instance.status === 'skipped'
                  ? 'Skipped · '
                  : instance.status === 'completed'
                    ? 'Completed · '
                    : ''}
                {instance.startTime ? `${formatTimeKey(instance.startTime)} · ` : ''}
                {instance.title}
              </Text>
            ))
          ) : (
            <Text style={styles.dashboardMeta}>No workout planned today. Make time to move or rest.</Text>
          )}
        </View>
      </View>

      <View style={styles.modeRow}>
        {(['day', 'week', 'month'] as const).map((option) => (
          <Pressable
            key={option}
            onPress={() => setMode(option)}
            style={[styles.modeButton, mode === option && styles.modeButtonSelected]}
            accessibilityRole="button"
            accessibilityState={{ selected: mode === option }}
          >
            <Text style={[styles.modeText, mode === option && styles.modeTextSelected]}>
              {option[0].toUpperCase() + option.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.calendarCard}>
        <View style={styles.calendarHeader}>
          <Pressable
            onPress={() => changeDate(-1)}
            style={styles.navButton}
            accessibilityRole="button"
            accessibilityLabel="Previous date range"
          >
            <Text style={styles.navText}>‹</Text>
          </Pressable>
          <Pressable onPress={() => setSelectedDate(today)} style={styles.dateHeading}>
            <Text style={styles.calendarTitle}>{dateTitle}</Text>
            <Text style={styles.todayLink}>Go to today</Text>
          </Pressable>
          <Pressable
            onPress={() => changeDate(1)}
            style={styles.navButton}
            accessibilityRole="button"
            accessibilityLabel="Next date range"
          >
            <Text style={styles.navText}>›</Text>
          </Pressable>
        </View>

        {mode !== 'day' && (
          <View ref={calendarGrid} style={styles.calendarGrid}>
            {(mode === 'week' ? calendarDates : WEEKDAYS.map(({ label }) => label)).map(
              (value, index) => {
                const date = mode === 'week' ? (value as string) : null;
                const label = date
                  ? DAY_NAMES[fromDateKey(date).getDay()]
                  : (value as string);
                if (!date) {
                  return (
                    <Text key={`${label}${index}`} style={styles.weekdayLabel}>
                      {label}
                    </Text>
                  );
                }
                const active = date === selectedDate;
                const marked = instances.some((instance) => instance.scheduledDate === date);
                return (
                  <Pressable
                    key={date}
                    onPress={() => handleDatePress(date)}
                    onLayout={(event) => handleCalendarCellLayout(date, event)}
                    style={styles.calendarCell}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`${titleForDate(date)}${marked ? ', workout scheduled' : ''}`}
                  >
                    <Text style={styles.weekdayLabel}>{label}</Text>
                    <View
                      style={[
                        styles.dayBubble,
                        date === today && styles.todayBubble,
                        active && styles.selectedBubble,
                      ]}
                    >
                      <Text style={[styles.dayNumber, active && styles.selectedDayNumber]}>
                        {fromDateKey(date).getDate()}
                      </Text>
                    </View>
                    <View style={[styles.dayMarker, marked && styles.dayMarkerActive]} />
                  </Pressable>
                );
              },
            )}
            {mode === 'month' &&
              calendarDates.map((date, index) => {
                if (date === null) return <View key={`empty-${index}`} style={styles.calendarCell} />;
                const active = date === selectedDate;
                const marked = instances.some((instance) => instance.scheduledDate === date);
                return (
                  <Pressable
                    key={date}
                    onPress={() => handleDatePress(date)}
                    onLongPress={() => setSelectedDate(date)}
                    onLayout={(event) => handleCalendarCellLayout(date, event)}
                    style={styles.calendarCell}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`${fromDateKey(date).getDate()}${marked ? ', workout scheduled' : ''}`}
                  >
                    <View
                      style={[
                        styles.dayBubble,
                        date === today && styles.todayBubble,
                        active && styles.selectedBubble,
                      ]}
                    >
                      <Text style={[styles.dayNumber, active && styles.selectedDayNumber]}>
                        {fromDateKey(date).getDate()}
                      </Text>
                    </View>
                    <View style={[styles.dayMarker, marked && styles.dayMarkerActive]} />
                  </Pressable>
                );
              })}
          </View>
        )}
        <Text style={styles.calendarHint}>
          {movingWorkout
            ? `Choose a day to move ${movingWorkout.title} to.`
            : 'Long-press a workout, then choose a date to move it.'}
        </Text>
      </View>

      <View style={styles.sectionHeader}>
        <View style={styles.flex}>
          <Text style={styles.sectionTitle}>{formatDateKey(selectedDate, 'weekday')}</Text>
          <Text style={styles.sectionMeta}>{formatDateKey(selectedDate, 'short')}</Text>
        </View>
        <Pressable
          onPress={openForm}
          style={styles.addButton}
          accessibilityRole="button"
          accessibilityLabel={`Schedule a workout for ${titleForDate(selectedDate)}`}
        >
          <Text style={styles.addButtonText}>+ Schedule</Text>
        </Pressable>
      </View>

      {selectedInstances.length ? (
        selectedInstances.map((instance) => (
          <Pressable
            key={instance.id}
            onPress={() => showWorkoutActions(instance)}
            onTouchStart={() => {
              touchedWorkoutId.current = instance.id;
            }}
            onLongPress={() => setMovingWorkout(instance)}
            style={[
              styles.workoutCard,
              movingWorkout?.id === instance.id && styles.movingCard,
              instance.status === 'skipped' && styles.skippedCard,
              instance.status === 'completed' && styles.completedCard,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`${instance.title}, ${instance.kind === 'rest' ? 'rest day' : 'workout'}, ${instance.status}. Long-press to move.`}
          >
            <View style={styles.workoutIcon}>
              <Text style={styles.workoutIconText}>{instance.kind === 'rest' ? '☾' : '↗'}</Text>
            </View>
            <View style={styles.flex}>
              <Text style={styles.workoutTitle} numberOfLines={1}>{instance.title}</Text>
              <Text style={styles.workoutMeta}>
                {instance.status === 'skipped'
                  ? 'Skipped'
                  : instance.status === 'completed'
                    ? 'Completed'
                    : instance.kind === 'rest'
                      ? 'Rest day'
                      : `${instance.startTime ? formatTimeKey(instance.startTime) : 'Time not set'}${
                          instance.durationMin && instance.startTime
                            ? ` – ${endTime(instance.startTime, instance.durationMin)}`
                            : ''
                        }${instance.durationMin ? ` · ${instance.durationMin} min` : ''}`}
                {instance.isRecurring ? ' · Weekly' : ''}
              </Text>
            </View>
            <Text style={styles.dragHandleText} accessible={false}>⠿</Text>
          </Pressable>
        ))
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Nothing planned</Text>
          <Text style={styles.emptyText}>Schedule a workout, set a rest day, or leave the day open.</Text>
        </View>
      )}

      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitle}>Upcoming workouts</Text>
          <Text style={styles.sectionMeta}>Next 7 days</Text>
        </View>
      </View>
      {upcoming.length ? (
        upcoming.map((instance) => (
          <Pressable
            key={`upcoming-${instance.id}`}
            onPress={() => {
              setSelectedDate(instance.scheduledDate);
              setMode('day');
            }}
            style={({ pressed }) => [styles.upcomingRow, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <Text style={styles.upcomingDate}>{formatDateKey(instance.scheduledDate, 'short')}</Text>
            <View style={styles.flex}>
              <Text style={styles.workoutTitle} numberOfLines={1}>{instance.title}</Text>
              <Text style={styles.workoutMeta}>
                {instance.startTime
                  ? `${formatTimeKey(instance.startTime)}${
                      instance.durationMin ? ` – ${endTime(instance.startTime, instance.durationMin)}` : ''
                    }`
                  : 'Rest day'}
                {instance.durationMin ? ` · ${instance.durationMin} min` : ''}
              </Text>
            </View>
          </Pressable>
        ))
      ) : (
        <Text style={styles.emptyText}>No workouts planned this week.</Text>
      )}

      {reminderWarning && <Text style={styles.warning}>{reminderWarning}</Text>}
      {error && <Text style={styles.error}>{error}</Text>}

      <Modal
        visible={isFormVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setFormVisible(false)}
      >
        <SafeAreaView style={styles.modalSafeArea} edges={['top', 'bottom']}>
          <ScrollView
            contentContainerStyle={styles.formContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.modalHeader}>
              <Pressable onPress={() => setFormVisible(false)} accessibilityRole="button">
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Text style={styles.modalTitle}>Schedule</Text>
              <View style={styles.headerSpacer} />
            </View>

            <View style={styles.formTypeRow}>
              {(['workout', 'rest'] as const).map((option) => (
                <Pressable
                  key={option}
                  onPress={() => {
                    setKind(option);
                    if (option === 'rest' && !title.trim()) setTitle('Rest day');
                    if (option === 'workout' && title.trim() === 'Rest day') setTitle('');
                  }}
                  style={[styles.typeButton, kind === option && styles.typeButtonSelected]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: kind === option }}
                >
                  <Text style={[styles.typeText, kind === option && styles.typeTextSelected]}>
                    {option === 'workout' ? 'Workout' : 'Rest day'}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.formGroup}>
              <FieldLabel>{kind === 'workout' ? 'WORKOUT NAME' : 'REST DAY NAME'}</FieldLabel>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder={kind === 'workout' ? 'e.g. Strength training' : 'Rest day'}
                placeholderTextColor={colors.textSubtle}
                maxLength={60}
                style={styles.input}
                returnKeyType="done"
                accessibilityLabel="Workout name"
              />
            </View>

            <View style={styles.formGroup}>
              <FieldLabel>DATE</FieldLabel>
              <PickerField mode="date" value={formDate} onChange={setFormDate} />
            </View>

            {kind === 'workout' && (
              <>
                <View style={styles.formGroup}>
                  <FieldLabel>START TIME</FieldLabel>
                  <PickerField mode="time" value={startTime} onChange={setStartTime} />
                </View>
                <View style={styles.formGroup}>
                  <FieldLabel>DURATION (MINUTES)</FieldLabel>
                  <TextInput
                    value={duration}
                    onChangeText={setDuration}
                    keyboardType="number-pad"
                    maxLength={3}
                    style={styles.input}
                    accessibilityLabel="Workout duration in minutes"
                  />
                  {Number(duration) > 0 && Number.isInteger(Number(duration)) && (
                    <Text style={styles.formHint}>
                      Ends at {endTime(formatClock(startTime), Number(duration))}
                    </Text>
                  )}
                </View>
                <View style={styles.formGroup}>
                  <FieldLabel>REMIND ME</FieldLabel>
                  <View style={styles.optionRow}>
                    {REMINDER_OPTIONS.map((minutes) => {
                      const selected = reminderMinutes === minutes;
                      return (
                        <Pressable
                          key={minutes ?? 'off'}
                          onPress={() => setReminderMinutes(minutes)}
                          style={[styles.option, selected && styles.optionSelected]}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                        >
                          <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                            {minutes === null ? 'Off' : `${minutes}m`}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              </>
            )}

            <View style={styles.formGroup}>
              <FieldLabel>REPEAT</FieldLabel>
              <View style={styles.optionRow}>
                <Pressable
                  onPress={() => {
                    setRepeatWeekly(false);
                    setRepeatDays([]);
                  }}
                  style={[styles.option, !repeatWeekly && styles.optionSelected]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: !repeatWeekly }}
                >
                  <Text style={[styles.optionText, !repeatWeekly && styles.optionTextSelected]}>Once</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setRepeatWeekly(true);
                    if (!repeatDays.length) setRepeatDays([fromDateKey(toDateKey(formDate)).getDay()]);
                  }}
                  style={[styles.option, repeatWeekly && styles.optionSelected]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: repeatWeekly }}
                >
                  <Text style={[styles.optionText, repeatWeekly && styles.optionTextSelected]}>Weekly</Text>
                </Pressable>
              </View>
              {repeatWeekly && (
                <View style={styles.weekdayOptions}>
                  {WEEKDAYS.map(({ label, day }, index) => {
                    const selected = repeatDays.includes(day);
                    return (
                      <Pressable
                        key={`${day}-${index}`}
                        onPress={() =>
                          setRepeatDays((current) =>
                            selected ? current.filter((value) => value !== day) : [...current, day],
                          )
                        }
                        style={[styles.weekdayOption, selected && styles.optionSelected]}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        accessibilityLabel={`Repeat on ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day]}`}
                      >
                        <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
              <Text style={styles.formHint}>
                {repeatWeekly ? 'Repeats each week on the selected days until removed.' : 'Schedule for one day only.'}
              </Text>
            </View>

            {error && <Text style={styles.error}>{error}</Text>}
            <PrimaryButton
              label={saving ? 'Saving…' : kind === 'rest' ? 'Save rest day' : 'Save workout'}
              onPress={saveSchedule}
              loading={saving}
            />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

function formatClock(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  pressed: { opacity: 0.75 },
  dashboardCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.heroBackground,
  },
  dashboardIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: colors.accent,
  },
  dashboardIconText: { color: colors.heroBackground, fontSize: 20, fontWeight: '800' },
  dashboardTitle: { color: colors.heroText, fontSize: 16, fontWeight: '800' },
  dashboardMeta: { color: colors.heroTextMuted, fontSize: 12, marginTop: 3 },
  modeRow: {
    flexDirection: 'row',
    padding: 4,
    marginTop: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  modeButton: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: radius.sm },
  modeButtonSelected: { backgroundColor: colors.surface, elevation: 1 },
  modeText: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
  modeTextSelected: { color: colors.primary },
  calendarCard: {
    padding: spacing.lg,
    marginTop: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  calendarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  navText: { color: colors.primary, fontSize: 30, fontWeight: '500', lineHeight: 34 },
  dateHeading: { flex: 1, alignItems: 'center' },
  calendarTitle: { color: colors.text, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  todayLink: { color: colors.primary, fontSize: 12, fontWeight: '700', marginTop: 3 },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.md },
  weekdayLabel: {
    width: '14.2857%',
    textAlign: 'center',
    color: colors.textSubtle,
    fontSize: 11,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  calendarCell: { width: '14.2857%', height: 48, alignItems: 'center', justifyContent: 'center' },
  dayBubble: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17 },
  todayBubble: { borderWidth: 1, borderColor: colors.primary },
  selectedBubble: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayNumber: { color: colors.text, fontSize: 13, fontWeight: '600' },
  selectedDayNumber: { color: colors.onPrimary },
  dayMarker: { position: 'absolute', bottom: 0, width: 4, height: 4, borderRadius: 2 },
  dayMarkerActive: { backgroundColor: colors.accent },
  calendarHint: { color: colors.textSubtle, fontSize: 11, textAlign: 'center', marginTop: spacing.sm },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  sectionTitle: { color: colors.text, fontSize: 19, fontWeight: '800', letterSpacing: -0.3 },
  sectionMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  addButton: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  addButtonText: { color: colors.onPrimary, fontSize: 13, fontWeight: '700' },
  workoutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  skippedCard: { opacity: 0.62 },
  completedCard: { borderColor: colors.success },
  movingCard: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  workoutIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
  },
  workoutIconText: { color: colors.primary, fontSize: 18, fontWeight: '800' },
  workoutTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  workoutMeta: { color: colors.textMuted, fontSize: 12, marginTop: 3 },
  dragHandleText: { color: colors.textSubtle, fontSize: 21, fontWeight: '700' },
  emptyCard: {
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  emptyText: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: 4 },
  upcomingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 58,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  upcomingDate: { width: 58, color: colors.primary, fontSize: 12, fontWeight: '700' },
  warning: { color: colors.warning, fontSize: 12, lineHeight: 18, marginTop: spacing.md },
  error: { color: colors.danger, fontSize: 13, lineHeight: 18, marginTop: spacing.md },
  modalSafeArea: { flex: 1, backgroundColor: colors.background },
  formContent: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingHorizontal: 22,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cancelText: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  modalTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  headerSpacer: { width: 48 },
  formTypeRow: { flexDirection: 'row', gap: spacing.sm },
  typeButton: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  typeButtonSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  typeText: { color: colors.textMuted, fontSize: 14, fontWeight: '700' },
  typeTextSelected: { color: colors.primary },
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
  formHint: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  option: {
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  optionSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  optionText: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
  optionTextSelected: { color: colors.primary },
  weekdayOptions: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.xs },
  weekdayOption: {
    flex: 1,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 19,
    backgroundColor: colors.surface,
  },
});
