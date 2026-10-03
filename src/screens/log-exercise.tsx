import type { Session } from '@supabase/supabase-js';
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FieldLabel, formStyles, PrimaryButton } from '../components/form';
import { goBack, ScreenHeader } from '../components/screen-header';
import { exerciseById } from '../constants/exercises';
import { lightColors as colors, spacing } from '../constants/theme';
import { getDatabase } from '../database';
import { addWorkoutLog, getLastLog } from '../database/workouts';
import { fromDateKey } from '../lib/dates';

function wholeNumber(text: string, min: number, max: number) {
  const value = Number(text.trim());
  return Number.isInteger(value) && value >= min && value <= max ? value : null;
}

export function LogExercise({
  session,
  exerciseId,
  dateKey,
}: {
  session: Session;
  exerciseId?: string;
  dateKey: string;
}) {
  const exercise = exerciseId ? exerciseById(exerciseId) : null;
  const isCardio = exercise?.group === 'Cardio';
  const [sets, setSets] = useState('3');
  const [reps, setReps] = useState('10');
  const [weight, setWeight] = useState('');
  const [duration, setDuration] = useState('30');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Start from the last time this exercise was logged.
  useEffect(() => {
    if (!exercise) return;
    let active = true;
    (async () => {
      try {
        const last = await getLastLog(await getDatabase(session.user.id), exercise.id);
        if (!active || !last) return;
        if (last.sets) setSets(String(last.sets));
        if (last.reps) setReps(String(last.reps));
        if (last.weight_kg) setWeight(String(last.weight_kg));
        if (last.duration_min) setDuration(String(last.duration_min));
      } catch {
        // Defaults are fine when the history can't be read.
      }
    })();
    return () => {
      active = false;
    };
  }, [session.user.id, exercise]);

  const setsValue = wholeNumber(sets, 1, 50);
  const repsValue = wholeNumber(reps, 1, 500);
  const durationValue = wholeNumber(duration, 1, 1000);
  const weightValue = weight.trim() ? Number(weight.trim().replace(',', '.')) : null;
  const weightInvalid = weightValue !== null && !(Number.isFinite(weightValue) && weightValue >= 0 && weightValue <= 1000);
  const canSave = Boolean(exercise) && (isCardio ? durationValue !== null : setsValue !== null && repsValue !== null && !weightInvalid);

  async function handleSave() {
    if (!exercise || !canSave) return;
    setIsSaving(true);
    setError(null);
    try {
      await addWorkoutLog(await getDatabase(session.user.id), {
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        muscleGroup: exercise.group,
        date: dateKey,
        sets: isCardio ? null : setsValue,
        reps: isCardio ? null : repsValue,
        weightKg: isCardio ? null : weightValue || null,
        durationMin: isCardio ? durationValue : null,
      });
      goBack();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not save this workout.');
      setIsSaving(false);
    }
  }

  const dateText = fromDateKey(dateKey).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={formStyles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <ScreenHeader title="Log Exercise" />
          {exercise ? (
            <>
              <View>
                <Text style={styles.name}>{exercise.name}</Text>
                <Text style={styles.meta}>
                  {exercise.group} · {exercise.equipment}
                </Text>
                <Text style={styles.date}>{dateText}</Text>
              </View>

              {isCardio ? (
                <>
                  <FieldLabel>DURATION (MINUTES)</FieldLabel>
                  <TextInput
                    value={duration}
                    onChangeText={setDuration}
                    keyboardType="number-pad"
                    maxLength={4}
                    style={formStyles.input}
                    accessibilityLabel="Duration in minutes"
                  />
                </>
              ) : (
                <>
                  <View style={styles.row}>
                    <View style={styles.flex}>
                      <FieldLabel>SETS</FieldLabel>
                      <TextInput
                        value={sets}
                        onChangeText={setSets}
                        keyboardType="number-pad"
                        maxLength={2}
                        style={[formStyles.input, styles.fieldGap]}
                        accessibilityLabel="Sets"
                      />
                    </View>
                    <View style={styles.flex}>
                      <FieldLabel>REPS</FieldLabel>
                      <TextInput
                        value={reps}
                        onChangeText={setReps}
                        keyboardType="number-pad"
                        maxLength={3}
                        style={[formStyles.input, styles.fieldGap]}
                        accessibilityLabel="Reps"
                      />
                    </View>
                  </View>
                  <FieldLabel>WEIGHT (KG, OPTIONAL)</FieldLabel>
                  <TextInput
                    value={weight}
                    onChangeText={setWeight}
                    keyboardType="decimal-pad"
                    placeholder="Bodyweight"
                    placeholderTextColor={colors.textSubtle}
                    maxLength={7}
                    style={formStyles.input}
                    accessibilityLabel="Weight in kilograms"
                  />
                  {weightInvalid && <Text style={formStyles.error}>Enter a weight between 0 and 1000 kg.</Text>}
                </>
              )}

              {error && <Text style={formStyles.error}>{error}</Text>}
              <PrimaryButton label="Add to workout" onPress={handleSave} disabled={!canSave} loading={isSaving} />
            </>
          ) : (
            <Text style={styles.meta}>This exercise could not be found.</Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: colors.background },
  name: { color: colors.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  meta: { color: colors.textMuted, fontSize: 14, marginTop: 4 },
  date: { color: colors.primary, fontSize: 14, fontWeight: '600', marginTop: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.md },
  fieldGap: { marginTop: spacing.sm },
});
