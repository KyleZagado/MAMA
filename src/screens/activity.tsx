import { createThemedStyleSheet } from '../providers/theme-provider';
import { Ionicons } from '@expo/vector-icons';
import type { Session } from '@supabase/supabase-js';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chip, ChipRow, formStyles, PrimaryButton } from '../components/form';
import { RouteMap } from '../components/route-map';
import { goBack, ScreenHeader } from '../components/screen-header';
import { Stat, StatGrid } from '../components/stat';
import { lightColors as colors, radius, spacing } from '../constants/theme';
import { getDatabase } from '../database';
import { saveActivity } from '../database/activities';
import { useActivityTracker } from '../hooks/use-activity-tracker';
import {
  ACTIVITY_TYPES,
  DEFAULT_WEIGHT_KG,
  downsample,
  estimateCalories,
  formatDuration,
  formatKm,
  formatPace,
  type ActivityType,
} from '../lib/activity';
import { toDateKey } from '../lib/dates';

function profileWeight(session: Session) {
  const value = Number(session.user.user_metadata?.weight_kg);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function Activity({ session }: { session: Session }) {
  const [type, setType] = useState<ActivityType>('run');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const tracker = useActivityTracker(type);

  const weightKg = profileWeight(session) ?? DEFAULT_WEIGHT_KG;
  const calories = estimateCalories(type, weightKg, tracker.elapsedS, tracker.distanceM);
  const pace = formatPace(type, tracker.elapsedS, tracker.distanceM);
  const isIdle = tracker.status === 'idle';

  async function persist(durationS: number, steps: number | null) {
    setIsSaving(true);
    setSaveError(null);
    try {
      const db = await getDatabase(session.user.id);
      await saveActivity(db, {
        type,
        logDate: toDateKey(new Date(tracker.startedAt)),
        startedAt: tracker.startedAt,
        durationS,
        distanceM: tracker.distanceM,
        steps,
        calories: estimateCalories(type, weightKg, durationS, tracker.distanceM),
        route: downsample(tracker.points),
      });
      goBack();
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : 'Could not save this activity.');
      setIsSaving(false);
    }
  }

  function handleFinish() {
    tracker.pause();
    Alert.alert('Finish activity?', `${formatKm(tracker.distanceM)} km · ${formatDuration(tracker.elapsedS)}`, [
      { text: 'Save', onPress: () => persist(tracker.elapsedS, tracker.steps) },
      { text: 'Discard', style: 'destructive', onPress: () => goBack() },
      { text: 'Keep going', style: 'cancel', onPress: () => tracker.resume() },
    ]);
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={formStyles.content} showsVerticalScrollIndicator={false}>
        {isIdle ? (
          <ScreenHeader title="Record Activity" />
        ) : (
          <Text style={styles.activeTitle}>
            {ACTIVITY_TYPES.find((item) => item.id === type)?.label}
            {tracker.status === 'paused' ? ' · Paused' : ''}
          </Text>
        )}

        {isIdle ? (
          <>
            <Text style={styles.intro}>
              Distance and your route are recorded with GPS while the app is open. Keep this screen on
              during the activity; it stays awake for you.
            </Text>
            <ChipRow>
              {ACTIVITY_TYPES.map((item) => (
                <Chip key={item.id} label={item.label} selected={type === item.id} onPress={() => setType(item.id)} />
              ))}
            </ChipRow>
            <Text style={styles.note}>
              Calories are an estimate based on {profileWeight(session) ? 'your profile weight' : 'a default weight of 70 kg'}
              {profileWeight(session) ? ` (${weightKg} kg)` : '. Add your weight in your profile for a better estimate'}.
            </Text>
            {(tracker.error || saveError) && <Text style={formStyles.error}>{tracker.error ?? saveError}</Text>}
            <PrimaryButton label="Start" onPress={tracker.start} />
          </>
        ) : (
          <>
            <View style={styles.timer}>
              <Text style={styles.timerLabel}>TIME</Text>
              <Text style={styles.timerValue}>{formatDuration(tracker.elapsedS)}</Text>
            </View>

            <StatGrid>
              <Stat label="DISTANCE" value={formatKm(tracker.distanceM)} unit="km" />
              <Stat label={type === 'ride' ? 'SPEED' : 'PACE'} value={pace.value} unit={pace.unit} />
              <Stat label="CALORIES" value={String(calories)} unit="kcal" />
              {type !== 'ride' && (
                <Stat label="STEPS" value={tracker.steps === null ? '--' : tracker.steps.toLocaleString('en-US')} />
              )}
            </StatGrid>

            <RouteMap points={tracker.points} />

            {(tracker.error || saveError) && <Text style={formStyles.error}>{tracker.error ?? saveError}</Text>}

            <View style={styles.controls}>
              <Pressable
                onPress={tracker.status === 'running' ? tracker.pause : tracker.resume}
                disabled={isSaving}
                style={({ pressed }) => [styles.control, styles.controlSecondary, pressed && styles.pressed]}
                accessibilityRole="button"
              >
                <Ionicons
                  name={tracker.status === 'running' ? 'pause' : 'play'}
                  size={20}
                  color={colors.heroBackground}
                />
                <Text style={styles.controlSecondaryText}>{tracker.status === 'running' ? 'Pause' : 'Resume'}</Text>
              </Pressable>
              <Pressable
                onPress={handleFinish}
                disabled={isSaving}
                style={({ pressed }) => [styles.control, styles.controlPrimary, isSaving && styles.disabled, pressed && styles.pressed]}
                accessibilityRole="button"
              >
                <Ionicons name="stop" size={20} color={colors.onPrimary} />
                <Text style={styles.controlPrimaryText}>{isSaving ? 'Saving…' : 'Finish'}</Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = createThemedStyleSheet((colors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.45 },
  activeTitle: { color: colors.text, fontSize: 18, fontWeight: '800', textAlign: 'center', marginTop: spacing.sm },
  intro: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  note: { color: colors.textSubtle, fontSize: 12, lineHeight: 18 },
  timer: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    borderRadius: 28,
    backgroundColor: colors.heroBackground,
  },
  timerLabel: { color: colors.heroTextMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  timerValue: { color: colors.heroText, fontSize: 54, fontWeight: '800', fontVariant: ['tabular-nums'] },
  controls: { flexDirection: 'row', gap: spacing.md },
  control: {
    flex: 1,
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
  },
  controlSecondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  controlSecondaryText: { color: colors.heroBackground, fontSize: 15, fontWeight: '700' },
  controlPrimary: { backgroundColor: colors.primary },
  controlPrimaryText: { color: colors.onPrimary, fontSize: 15, fontWeight: '700' },
}));
