import { Ionicons } from '@expo/vector-icons';
import type { Session } from '@supabase/supabase-js';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { PickerField } from '../components/picker-field';
import { ProfileButton } from '../components/profile-button';
import { lightColors as colors, MAX_CONTENT_WIDTH, radius, spacing } from '../constants/theme';
import { getDatabase } from '../database';
import {
  addFiveTwoCheckin,
  adjustFastTarget,
  cancelFast,
  countFiveTwoCheckins,
  editCompletedFast,
  editFastPlannedEnd,
  editFastStart,
  finishFast,
  finishFastAt,
  getActiveFast,
  getLastCompletedFast,
  hasFiveTwoCheckin,
  listFastingSessions,
  pauseFast,
  resumeFast,
  startFast,
  type FastingSession,
} from '../database/fasting';

const RING_SIZE = 216;
const STROKE = 18;
const RING_RADIUS = (RING_SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const PROTOCOLS = [
  { id: '12:12', name: '12:12', targetMinutes: 12 * 60, detail: '12 hours fasting · 12-hour eating window' },
  { id: '14:10', name: '14:10', targetMinutes: 14 * 60, detail: '14 hours fasting · 10-hour eating window' },
  { id: '16:8', name: '16:8', targetMinutes: 16 * 60, detail: '16 hours fasting · 8-hour eating window' },
  { id: '18:6', name: '18:6', targetMinutes: 18 * 60, detail: '18 hours fasting · 6-hour eating window' },
  { id: '20:4', name: '20:4', targetMinutes: 20 * 60, detail: '20 hours fasting · 4-hour eating window' },
  { id: 'OMAD', name: 'OMAD', targetMinutes: 23 * 60, detail: 'One meal a day · 23-hour fast goal' },
  { id: '24-hour', name: '24-hour', targetMinutes: 24 * 60, detail: '24-hour fast' },
  { id: '36-hour', name: '36-hour', targetMinutes: 36 * 60, detail: '36-hour fast' },
  { id: '48-hour', name: '48-hour', targetMinutes: 48 * 60, detail: '48-hour fast' },
  { id: '5:2', name: '5:2', targetMinutes: null, detail: '5 regular-eating days · 2 reduced-intake days each week' },
  { id: 'custom', name: 'Custom', targetMinutes: null, detail: 'Choose your fasting duration' },
] as const;

type Protocol = (typeof PROTOCOLS)[number];
type FastEdit = {
  session: FastingSession;
  startedAt: Date;
  endedAt: Date;
};

const EATING_WINDOWS: Record<string, number> = {
  '12:12': 12 * 60,
  '14:10': 10 * 60,
  '16:8': 8 * 60,
  '18:6': 6 * 60,
  '20:4': 4 * 60,
  OMAD: 60,
  '24-hour': 12 * 60,
  '36-hour': 12 * 60,
  '48-hour': 12 * 60,
  custom: 8 * 60,
};

function localWeekRange(now: Date) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { from: start.getTime(), to: end.getTime() };
}

function localDayRange(now: Date) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { from: start.getTime(), to: end.getTime() };
}

function formatDuration(milliseconds: number) {
  const totalMinutes = Math.max(0, Math.floor(milliseconds / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function formatClock(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatTimestamp(timestamp: number) {
  return new Date(timestamp).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function withClock(date: Date, clock: Date) {
  const next = new Date(date);
  next.setHours(clock.getHours(), clock.getMinutes(), 0, 0);
  return next;
}

function phaseLabel(progress: number, reached: boolean) {
  if (reached) return 'Goal reached';
  if (progress < 0.25) return 'Getting started';
  if (progress < 0.75) return 'Steady progress';
  return 'Final stretch';
}

export function Fasting({ session }: { session: Session }) {
  const [selectedId, setSelectedId] = useState<string>('16:8');
  const [customHours, setCustomHours] = useState('16');
  const [now, setNow] = useState(0);
  const [active, setActive] = useState<FastingSession | null>(null);
  const [lastCompletedFast, setLastCompletedFast] = useState<FastingSession | null>(null);
  const [history, setHistory] = useState<FastingSession[]>([]);
  const [weeklyCheckins, setWeeklyCheckins] = useState(0);
  const [checkedInToday, setCheckedInToday] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [countdownMode, setCountdownMode] = useState(true);
  const [fastEdit, setFastEdit] = useState<FastEdit | null>(null);

  const selected = PROTOCOLS.find((item) => item.id === selectedId) ?? PROTOCOLS[2];
  const customHoursValue = Number(customHours.trim());
  const validCustomHours =
    Number.isInteger(customHoursValue) && customHoursValue >= 1 && customHoursValue <= 72;
  const targetMinutes =
    selected.id === 'custom'
      ? validCustomHours
        ? customHoursValue * 60
        : null
      : selected.targetMinutes;
  const pausedAt = active?.state === 'paused' ? active.paused_at ?? now : now;
  const elapsed = active
    ? Math.max(0, pausedAt - active.started_at - active.paused_duration_ms)
    : 0;
  const activeGoalMs = active?.target_minutes ? active.target_minutes * 60_000 : 0;
  const remaining = active ? Math.max(0, activeGoalMs - elapsed) : 0;
  const progress = activeGoalMs ? Math.min(elapsed / activeGoalMs, 1) : 0;
  const selectedProtocol =
    selected.id === 'custom'
      ? validCustomHours
        ? `${customHoursValue}-hour custom`
        : 'Custom fast'
      : selected.name;

  const reload = useCallback(async () => {
    try {
      const db = await getDatabase(session.user.id);
      const current = new Date();
      const week = localWeekRange(current);
      const day = localDayRange(current);
      const [nextActive, nextHistory, lastCompleted, checkins, todayCheckin] = await Promise.all([
        getActiveFast(db),
        listFastingSessions(db),
        getLastCompletedFast(db),
        countFiveTwoCheckins(db, week.from, week.to),
        hasFiveTwoCheckin(db, day.from, day.to),
      ]);
      setActive(nextActive);
      setHistory(nextHistory);
      setLastCompletedFast(lastCompleted);
      setWeeklyCheckins(checkins?.count ?? 0);
      setCheckedInToday(Boolean(todayCheckin));
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load your fasting tracker.');
    }
  }, [session.user.id]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  useEffect(() => {
    const sync = setTimeout(() => setNow(Date.now()), 0);
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => {
      clearTimeout(sync);
      clearInterval(timer);
    };
  }, []);

  async function start() {
    if (targetMinutes === null || active) return;
    setBusy(true);
    setError(null);
    try {
      const db = await getDatabase(session.user.id);
      await startFast(db, selected.id, selectedProtocol, targetMinutes);
      await reload();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not start your fast.');
    } finally {
      setBusy(false);
    }
  }

  async function end() {
    if (!active || busy) return;
    setBusy(true);
    setError(null);
    try {
      await finishFast(await getDatabase(session.user.id), active.id);
      await reload();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not end your fast.');
    } finally {
      setBusy(false);
    }
  }

  async function runActiveAction(action: (db: Awaited<ReturnType<typeof getDatabase>>) => Promise<unknown>) {
    if (!active || busy) return;
    setBusy(true);
    setError(null);
    try {
      await action(await getDatabase(session.user.id));
      await reload();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not update your fast.');
    } finally {
      setBusy(false);
    }
  }

  function confirmCancel() {
    if (!active) return;
    Alert.alert('Cancel this fast?', 'This fast will be saved in your history as cancelled.', [
      { text: 'Keep fasting', style: 'cancel' },
      { text: 'Cancel fast', style: 'destructive', onPress: () => runActiveAction((db) => cancelFast(db, active.id)) },
    ]);
  }

  function openEdit(entry: FastingSession) {
    setFastEdit({
      session: entry,
      startedAt: new Date(entry.started_at),
      endedAt: new Date(
        entry.state === 'active' || entry.state === 'paused'
          ? entry.planned_end_at ?? now + (entry.target_minutes ?? 60) * 60_000
          : entry.ended_at ?? now,
      ),
    });
  }

  function changeEditedTime(field: 'startedAt' | 'endedAt', mode: 'date' | 'time', value: Date) {
    setFastEdit((current) => {
      if (!current) return current;
      const currentValue = current[field];
      const nextValue =
        mode === 'date'
          ? withClock(value, currentValue)
          : withClock(currentValue, value);
      return { ...current, [field]: nextValue };
    });
  }

  async function saveEdit() {
    if (!fastEdit || busy) return;
    const { session: entry, startedAt, endedAt } = fastEdit;
    setBusy(true);
    setError(null);
    try {
      const db = await getDatabase(session.user.id);
      if (entry.state === 'active' || entry.state === 'paused') {
        if (startedAt.getTime() !== entry.started_at) {
          await editFastStart(db, entry.id, startedAt.getTime());
        }
        if (endedAt.getTime() !== entry.planned_end_at) {
          if (endedAt.getTime() <= Date.now()) {
            await finishFastAt(db, entry.id, endedAt.getTime());
          } else {
            await editFastPlannedEnd(db, entry.id, endedAt.getTime());
          }
        }
      } else if (entry.state === 'completed') {
        await editCompletedFast(db, entry.id, startedAt.getTime(), endedAt.getTime());
      }
      setFastEdit(null);
      await reload();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not save the edited times.');
    } finally {
      setBusy(false);
    }
  }

  async function logFiveTwoDay() {
    if (checkedInToday || weeklyCheckins >= 2 || busy) return;
    setBusy(true);
    setError(null);
    try {
      await addFiveTwoCheckin(await getDatabase(session.user.id));
      await reload();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not log your 5:2 day.');
    } finally {
      setBusy(false);
    }
  }

  function chooseProtocol(protocol: Protocol) {
    if (!active) setSelectedId(protocol.id);
  }

  const activeTarget = active?.target_minutes ?? 0;
  const goalReached = Boolean(active && elapsed >= activeTarget * 60_000);
  const eatingWindowMs = lastCompletedFast
    ? (EATING_WINDOWS[lastCompletedFast.protocol_id] ?? EATING_WINDOWS.custom) * 60_000
    : 0;
  const nextFastAt = lastCompletedFast?.ended_at
    ? lastCompletedFast.ended_at + eatingWindowMs
    : null;
  const eatingWindowRemaining = nextFastAt === null ? 0 : Math.max(0, nextFastAt - now);
  const todayStart = localDayRange(new Date(now)).from;
  const dailyStatus = active
    ? active.state === 'paused'
      ? 'Fast paused'
      : 'Fast in progress'
    : lastCompletedFast?.ended_at && lastCompletedFast.ended_at >= todayStart
      ? 'Fast completed today'
      : nextFastAt !== null && now < nextFastAt
        ? 'Eating window'
        : 'Ready to start';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>mama</Text>
            <Text style={styles.title}>Fasting Tracker</Text>
          </View>
          <ProfileButton session={session} />
        </View>

        <View style={styles.hero}>
          <Text style={styles.heroEyebrow}>{active ? 'FAST IN PROGRESS' : 'YOUR FASTING PLAN'}</Text>
          {active && (
            <View style={styles.timerMode}>
              {(['countdown', 'count-up'] as const).map((mode) => (
                <Pressable
                  key={mode}
                  onPress={() => setCountdownMode(mode === 'countdown')}
                  style={[styles.timerModeOption, countdownMode === (mode === 'countdown') && styles.timerModeSelected]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: countdownMode === (mode === 'countdown') }}
                >
                  <Text style={[styles.timerModeText, countdownMode === (mode === 'countdown') && styles.timerModeTextSelected]}>
                    {mode === 'countdown' ? 'Countdown' : 'Count-up'}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
          <View style={styles.ringWrap}>
            <Svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
              <Circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
                stroke="rgba(255,255,255,0.14)"
                strokeWidth={STROKE}
                fill="none"
              />
              <Circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
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
              <Text style={styles.timerValue}>
                {active
                  ? formatDuration(countdownMode ? remaining : elapsed)
                  : targetMinutes
                    ? `${String(Math.floor(targetMinutes / 60)).padStart(2, '0')}:00`
                    : '--:--'}
              </Text>
              <Text style={styles.timerCaption}>
                {active
                  ? countdownMode
                    ? 'REMAINING'
                    : 'ELAPSED'
                  : selected.id === '5:2'
                    ? 'WEEKLY PLAN'
                    : 'HOUR GOAL'}
              </Text>
            </View>
          </View>
          <Text style={styles.heroProtocol}>
            {active ? active.protocol_name : selected.id === '5:2' ? '5:2 weekly rhythm' : selectedProtocol}
          </Text>
          <Text style={styles.heroSubtext}>
            {active
              ? `${phaseLabel(progress, goalReached)} · Started ${formatTimestamp(active.started_at)}`
              : selected.id === '5:2'
                ? `${weeklyCheckins} of 2 reduced-intake days logged this week`
                : selected.detail}
          </Text>
          {active ? (
            <View style={styles.activeControls}>
              <View style={styles.primaryControls}>
                <Pressable
                  onPress={() =>
                    runActiveAction((db) =>
                      active.state === 'paused' ? resumeFast(db, active.id) : pauseFast(db, active.id),
                    )
                  }
                  disabled={busy}
                  style={({ pressed }) => [
                    styles.heroButton,
                    styles.startButton,
                    busy && styles.disabled,
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="button"
                >
                  <Ionicons name={active.state === 'paused' ? 'play' : 'pause'} size={17} color={colors.heroBackground} />
                  <Text style={styles.heroButtonText}>{active.state === 'paused' ? 'Resume fast' : 'Pause fast'}</Text>
                </Pressable>
                <Pressable
                  onPress={end}
                  disabled={busy}
                  style={({ pressed }) => [
                    styles.heroButton,
                    styles.endButton,
                    busy && styles.disabled,
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="button"
                >
                  <Ionicons name="stop" size={17} color={colors.heroBackground} />
                  <Text style={styles.heroButtonText}>End fast</Text>
                </Pressable>
              </View>
              <View style={styles.secondaryControls}>
                <Pressable
                  onPress={() => runActiveAction((db) => adjustFastTarget(db, active.id, -30))}
                  disabled={busy || active.state !== 'active' || activeTarget <= 30}
                  style={({ pressed }) => [
                    styles.controlChip,
                    (busy || active.state !== 'active' || activeTarget <= 30) && styles.disabled,
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Shorten fast by 30 minutes"
                >
                  <Ionicons name="remove" size={17} color={colors.primary} />
                  <Text style={styles.controlChipText}>Shorten 30m</Text>
                </Pressable>
                <Pressable
                  onPress={() => runActiveAction((db) => adjustFastTarget(db, active.id, 30))}
                  disabled={busy || active.state !== 'active' || activeTarget >= 4320}
                  style={({ pressed }) => [
                    styles.controlChip,
                    (busy || active.state !== 'active' || activeTarget >= 4320) && styles.disabled,
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Extend fast by 30 minutes"
                >
                  <Ionicons name="add" size={17} color={colors.primary} />
                  <Text style={styles.controlChipText}>Extend 30m</Text>
                </Pressable>
                <Pressable
                  onPress={() => openEdit(active)}
                  disabled={busy}
                  style={({ pressed }) => [styles.controlChip, busy && styles.disabled, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Manually edit fast start and end times"
                >
                  <Ionicons name="create-outline" size={16} color={colors.primary} />
                  <Text style={styles.controlChipText}>Edit times</Text>
                </Pressable>
                <Pressable
                  onPress={confirmCancel}
                  disabled={busy}
                  style={({ pressed }) => [styles.controlChip, styles.cancelChip, busy && styles.disabled, pressed && styles.pressed]}
                  accessibilityRole="button"
                >
                  <Text style={styles.cancelChipText}>Cancel fast</Text>
                </Pressable>
              </View>
            </View>
          ) : selected.id === '5:2' ? (
            <Pressable
              onPress={logFiveTwoDay}
              disabled={busy || checkedInToday || weeklyCheckins >= 2}
              style={({ pressed }) => [
                styles.heroButton,
                styles.startButton,
                (busy || checkedInToday || weeklyCheckins >= 2) && styles.disabled,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
            >
              <Ionicons name={checkedInToday ? 'checkmark' : 'add'} size={19} color={colors.heroBackground} />
              <Text style={styles.heroButtonText}>
                {checkedInToday ? 'Day logged' : weeklyCheckins >= 2 ? 'Weekly goal complete' : 'Log reduced-intake day'}
              </Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={start}
              disabled={busy || targetMinutes === null}
              style={({ pressed }) => [
                styles.heroButton,
                styles.startButton,
                (busy || targetMinutes === null) && styles.disabled,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
            >
              <Ionicons name="play" size={17} color={colors.heroBackground} />
              <Text style={styles.heroButtonText}>{busy ? 'Saving…' : 'Start fast'}</Text>
            </Pressable>
          )}
        </View>

        {active && (
          <View style={styles.timelineCard}>
            <View style={styles.timelineHeading}>
              <Text style={styles.timelineTitle}>Fast timeline</Text>
              <Text style={styles.percentage}>{Math.round(progress * 100)}%</Text>
            </View>
            <View
              style={styles.timelineTrack}
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
            >
              <View style={[styles.timelineFill, { width: `${Math.round(progress * 100)}%` }]} />
            </View>
            <View style={styles.timelineLabels}>
              <Text style={styles.timelineLabel}>Start · {formatClock(active.started_at)}</Text>
              <Text style={styles.timelineLabel}>
                Goal · {formatClock(active.planned_end_at ?? active.started_at + activeGoalMs)}
              </Text>
            </View>
          </View>
        )}

        <View style={styles.statusGrid}>
          <View style={styles.statusCard}>
            <Text style={styles.statusLabel}>Today</Text>
            <Text style={styles.statusValue}>{dailyStatus}</Text>
            <Text style={styles.statusMeta}>
              {new Date(now).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            </Text>
          </View>
          <View style={styles.statusCard}>
            <Text style={styles.statusLabel}>
              {active
                ? 'Next eating window'
                : nextFastAt && now < nextFastAt
                  ? 'Eating window ends'
                  : 'Next fasting window'}
            </Text>
            <Text style={styles.statusValue}>
              {active
                ? active.state === 'paused'
                  ? 'Paused'
                  : formatDuration(remaining)
                : nextFastAt && now < nextFastAt
                  ? formatDuration(eatingWindowRemaining)
                  : nextFastAt
                    ? formatClock(nextFastAt)
                    : 'Not scheduled'}
            </Text>
            <Text style={styles.statusMeta}>
              {active
                ? active.state === 'paused'
                  ? `Resume · ${formatTimestamp(active.planned_end_at ?? now)}`
                  : `Opens · ${formatTimestamp(active.planned_end_at ?? now)}`
                : nextFastAt && now < nextFastAt
                  ? `Next fast · ${formatTimestamp(nextFastAt)}`
                  : nextFastAt
                    ? 'Suggested next fast'
                    : 'Complete a fast to see the next window'}
            </Text>
          </View>
        </View>

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Choose a protocol</Text>
          <Text style={styles.sectionMeta}>Select a plan to get started</Text>
        </View>
        <View style={styles.protocolGrid}>
          {PROTOCOLS.map((protocol) => {
            const selectedProtocol = selectedId === protocol.id;
            return (
              <Pressable
                key={protocol.id}
                onPress={() => chooseProtocol(protocol)}
                disabled={Boolean(active)}
                style={({ pressed }) => [
                  styles.protocolCard,
                  selectedProtocol && styles.protocolSelected,
                  active && styles.protocolDisabled,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: selectedProtocol, disabled: Boolean(active) }}
              >
                <Text style={[styles.protocolName, selectedProtocol && styles.protocolNameSelected]}>
                  {protocol.name}
                </Text>
                <Text style={[styles.protocolDetail, selectedProtocol && styles.protocolDetailSelected]}>
                  {protocol.id === '5:2'
                    ? '5 regular · 2 low-intake days'
                    : protocol.id === 'custom'
                      ? 'Set your own duration'
                      : protocol.detail.split(' · ')[0]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {selected.id === 'custom' && !active && (
          <View style={styles.customCard}>
            <Text style={styles.customLabel}>Fasting duration</Text>
            <View style={styles.customControl}>
              <TextInput
                value={customHours}
                onChangeText={setCustomHours}
                keyboardType="number-pad"
                maxLength={2}
                style={styles.customInput}
                accessibilityLabel="Custom fasting duration in hours"
              />
              <Text style={styles.customUnit}>hours</Text>
            </View>
            <Text style={styles.customHint}>Choose from 1 to 72 hours.</Text>
            {!validCustomHours && <Text style={styles.error}>Enter a whole number from 1 to 72.</Text>}
          </View>
        )}

        {selected.id === '5:2' && (
          <View style={styles.infoCard}>
            <View style={styles.infoIcon}>
              <Ionicons name="calendar-outline" size={19} color={colors.primary} />
            </View>
            <View style={styles.infoBody}>
              <Text style={styles.infoTitle}>Your 5:2 week</Text>
              <Text style={styles.infoText}>
                Track up to two reduced-intake days per Monday–Sunday week. This is a weekly pattern, not a timed fast.
              </Text>
            </View>
          </View>
        )}

        <View style={styles.safetyNote}>
          <Ionicons name="information-circle-outline" size={18} color={colors.warning} />
          <Text style={styles.safetyText}>
            Fasting is not suitable for everyone. Check with a healthcare professional before trying extended fasts.
          </Text>
        </View>

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Recent activity</Text>
          <Text style={styles.sectionMeta}>{history.length} entries</Text>
        </View>
        {history.length ? (
          <View style={styles.historyCard}>
            {history.map((entry, index) => (
              <View key={entry.id} style={[styles.historyRow, index > 0 && styles.historyDivider]}>
                <View style={[styles.historyIcon, entry.kind === 'five_two' && styles.fiveTwoIcon]}>
                  <Ionicons
                    name={entry.kind === 'five_two' ? 'calendar-outline' : 'hourglass-outline'}
                    size={18}
                    color={colors.primary}
                  />
                </View>
                <View style={styles.historyBody}>
                  <Text style={styles.historyTitle}>{entry.kind === 'five_two' ? '5:2 reduced-intake day' : entry.protocol_name}</Text>
                  <Text style={styles.historyMeta}>
                    {formatTimestamp(entry.started_at)}
                    {entry.kind === 'fast' && entry.ended_at
                      ? ` – ${formatTimestamp(entry.ended_at)} · ${formatDuration(entry.ended_at - entry.started_at - entry.paused_duration_ms)}`
                      : entry.kind === 'fast'
                        ? ` · ${entry.state === 'paused' ? 'Paused' : 'In progress'}`
                        : ''}
                  </Text>
                </View>
                {entry.kind === 'fast' && entry.state === 'completed' && (
                  <Pressable
                    onPress={() => openEdit(entry)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit start and end time for ${entry.protocol_name}`}
                  >
                    <Ionicons name="create-outline" size={19} color={colors.primary} />
                  </Pressable>
                )}
                {entry.kind === 'fast' && entry.state === 'cancelled' && (
                  <Text style={styles.cancelledLabel}>Cancelled</Text>
                )}
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>Your fasting sessions and 5:2 check-ins will appear here.</Text>
          </View>
        )}
        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>
      <Modal
        visible={Boolean(fastEdit)}
        transparent
        animationType="fade"
        onRequestClose={() => setFastEdit(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.editModal}>
            <Text style={styles.modalTitle}>
              {fastEdit?.session.state === 'completed' ? 'Edit fast times' : 'Edit planned times'}
            </Text>
            <Text style={styles.modalHint}>Adjust the date and time on this device.</Text>
            <Text style={styles.editLabel}>Start</Text>
            {fastEdit && (
              <View style={styles.pickerRow}>
                <PickerField
                  mode="date"
                  value={fastEdit.startedAt}
                  onChange={(date) => changeEditedTime('startedAt', 'date', date)}
                />
                <PickerField
                  mode="time"
                  value={fastEdit.startedAt}
                  onChange={(date) => changeEditedTime('startedAt', 'time', date)}
                />
              </View>
            )}
            <Text style={styles.editLabel}>
              {fastEdit?.session.state === 'completed' ? 'End' : 'Planned end'}
            </Text>
            {fastEdit && (
              <View style={styles.pickerRow}>
                <PickerField
                  mode="date"
                  value={fastEdit.endedAt}
                  onChange={(date) => changeEditedTime('endedAt', 'date', date)}
                />
                <PickerField
                  mode="time"
                  value={fastEdit.endedAt}
                  onChange={(date) => changeEditedTime('endedAt', 'time', date)}
                />
              </View>
            )}
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setFastEdit(null)}
                style={({ pressed }) => [styles.modalButton, styles.modalCancel, pressed && styles.pressed]}
                accessibilityRole="button"
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={saveEdit}
                disabled={busy}
                style={({ pressed }) => [
                  styles.modalButton,
                  styles.modalSave,
                  busy && styles.disabled,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
              >
                <Text style={styles.modalSaveText}>{busy ? 'Saving…' : 'Save times'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
    paddingBottom: 58,
  },
  pressed: { opacity: 0.76 },
  disabled: { opacity: 0.55 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  brand: { color: colors.textMuted, fontSize: 13 },
  title: { color: colors.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.6, marginTop: 2 },
  hero: {
    alignItems: 'center',
    padding: spacing.lg,
    paddingTop: spacing.xl,
    marginBottom: spacing.xl,
    borderRadius: 28,
    backgroundColor: colors.heroBackground,
  },
  heroEyebrow: { color: colors.heroTextMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.4 },
  ringWrap: { width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center', marginTop: spacing.md },
  ringCenter: { position: 'absolute', alignItems: 'center' },
  timerValue: { color: colors.heroText, fontSize: 42, fontWeight: '800', letterSpacing: -1.5, fontVariant: ['tabular-nums'] },
  timerCaption: { color: colors.heroTextMuted, fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginTop: 4 },
  timerMode: {
    flexDirection: 'row',
    gap: 2,
    padding: 3,
    marginTop: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  timerModeOption: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill },
  timerModeSelected: { backgroundColor: colors.surface },
  timerModeText: { color: colors.heroTextMuted, fontSize: 12, fontWeight: '700' },
  timerModeTextSelected: { color: colors.heroBackground },
  heroProtocol: { color: colors.heroText, fontSize: 19, fontWeight: '800', marginTop: spacing.xs },
  heroSubtext: { color: colors.heroTextMuted, fontSize: 13, textAlign: 'center', marginTop: spacing.xs, lineHeight: 19 },
  heroButton: {
    minHeight: 48,
    minWidth: 180,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.lg,
    borderRadius: radius.pill,
  },
  startButton: { backgroundColor: colors.accent },
  endButton: { backgroundColor: colors.surface },
  heroButtonText: { color: colors.heroBackground, fontSize: 15, fontWeight: '800' },
  activeControls: { alignSelf: 'stretch', alignItems: 'center' },
  primaryControls: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, width: '100%' },
  secondaryControls: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  controlChip: { minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.surface },
  controlChipText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  cancelChip: { backgroundColor: 'rgba(255,255,255,0.1)' },
  cancelChipText: { color: colors.heroText, fontSize: 12, fontWeight: '700' },
  timelineCard: { padding: spacing.lg, marginBottom: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  timelineHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  timelineTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  percentage: { color: colors.primary, fontSize: 15, fontWeight: '800' },
  timelineTrack: { height: 10, overflow: 'hidden', marginTop: spacing.md, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt },
  timelineFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.accent },
  timelineLabels: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm, marginTop: spacing.sm },
  timelineLabel: { color: colors.textMuted, fontSize: 11 },
  statusGrid: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xl },
  statusCard: { flex: 1, minHeight: 104, justifyContent: 'center', padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  statusLabel: { color: colors.textSubtle, fontSize: 11, fontWeight: '700' },
  statusValue: { color: colors.text, fontSize: 14, fontWeight: '800', marginTop: spacing.xs },
  statusMeta: { color: colors.textMuted, fontSize: 11, marginTop: spacing.xs },
  sectionHeading: { marginBottom: spacing.md },
  sectionTitle: { color: colors.text, fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  sectionMeta: { color: colors.textMuted, fontSize: 13, marginTop: 3 },
  protocolGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  protocolCard: {
    width: '48%',
    minHeight: 72,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  protocolSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  protocolDisabled: { opacity: 0.62 },
  protocolName: { color: colors.text, fontSize: 15, fontWeight: '800' },
  protocolNameSelected: { color: colors.primary },
  protocolDetail: { color: colors.textMuted, fontSize: 11, marginTop: 4 },
  protocolDetailSelected: { color: colors.primary },
  customCard: { padding: spacing.lg, marginBottom: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  customLabel: { color: colors.text, fontSize: 14, fontWeight: '700' },
  customControl: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  customInput: { width: 84, height: 48, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, color: colors.text, fontSize: 19, fontWeight: '700' },
  customUnit: { color: colors.textMuted, fontSize: 15 },
  customHint: { color: colors.textMuted, fontSize: 12, marginTop: spacing.xs },
  infoCard: { flexDirection: 'row', gap: spacing.md, padding: spacing.lg, marginBottom: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  infoIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, backgroundColor: colors.primarySoft },
  infoBody: { flex: 1 },
  infoTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  infoText: { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  safetyNote: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingHorizontal: spacing.xs, marginBottom: spacing.xl },
  safetyText: { flex: 1, color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  historyCard: { paddingHorizontal: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 68 },
  historyDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  historyIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, backgroundColor: colors.primarySoft },
  fiveTwoIcon: { backgroundColor: colors.accentSoft },
  historyBody: { flex: 1, minWidth: 0 },
  historyTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  historyMeta: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  cancelledLabel: { color: colors.textSubtle, fontSize: 11, fontWeight: '700' },
  emptyCard: { padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  emptyText: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  error: { color: colors.danger, fontSize: 13, lineHeight: 18, marginTop: spacing.sm },
  modalBackdrop: { flex: 1, justifyContent: 'center', padding: spacing.lg, backgroundColor: colors.overlay },
  editModal: { width: '100%', maxWidth: 420, alignSelf: 'center', padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.background },
  modalTitle: { color: colors.text, fontSize: 20, fontWeight: '800' },
  modalHint: { color: colors.textMuted, fontSize: 13, marginTop: spacing.xs, marginBottom: spacing.md },
  editLabel: { color: colors.text, fontSize: 13, fontWeight: '700', marginTop: spacing.md, marginBottom: spacing.xs },
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.xl },
  modalButton: { minHeight: 42, justifyContent: 'center', paddingHorizontal: spacing.lg, borderRadius: radius.pill },
  modalCancel: { backgroundColor: colors.surfaceAlt },
  modalSave: { backgroundColor: colors.primary },
  modalCancelText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  modalSaveText: { color: colors.onPrimary, fontSize: 14, fontWeight: '700' },
});
