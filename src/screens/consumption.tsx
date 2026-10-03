import { Ionicons } from '@expo/vector-icons';
import type { Session } from '@supabase/supabase-js';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RoundButton } from '../components/round-button';
import { mealTypeLabel } from '../constants/meals';
import { lightColors as colors, MAX_CONTENT_WIDTH, radius, spacing } from '../constants/theme';
import { getDatabase } from '../database';
import { addWater, GLASS_ML } from '../database/consumption';
import { useConsumption } from '../hooks/use-consumption';
import { addDaysToKey, toDateKey } from '../lib/dates';
import { dayLabel, timestampOnDay } from '../lib/dates-day';
import { mealPhotoUri } from '../lib/meal-photos';

export function Consumption({ session }: { session: Session }) {
  const todayKey = toDateKey(new Date());
  const [dateKey, setDateKey] = useState(todayKey);
  const [actionError, setActionError] = useState<string | null>(null);
  const { meals, water, goalGlasses, error, reload } = useConsumption(session.user.id, dateKey);

  const isToday = dateKey >= todayKey;
  const totalMl = water.reduce((sum, entry) => sum + entry.amount_ml, 0);
  const goalMl = goalGlasses * GLASS_ML;
  const progress = Math.min(totalMl / goalMl, 1);
  const glasses = totalMl / GLASS_ML;

  async function addGlass() {
    try {
      setActionError(null);
      const db = await getDatabase(session.user.id);
      await addWater(db, GLASS_ML, timestampOnDay(dateKey));
      await reload();
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Could not log water.');
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.brand}>mama</Text>
        <Text style={styles.title}>Smart Consumption</Text>

        <View style={styles.dateRow}>
          <RoundButton
            icon="chevron-back"
            label="Previous day"
            size={36}
            onPress={() => setDateKey(addDaysToKey(dateKey, -1))}
          />
          <Text style={styles.dateText}>{dayLabel(dateKey, todayKey)}</Text>
          <RoundButton
            icon="chevron-forward"
            label="Next day"
            size={36}
            disabled={isToday}
            onPress={() => setDateKey(addDaysToKey(dateKey, 1))}
          />
        </View>

        <Pressable
          onPress={() => router.push({ pathname: '/water', params: { date: dateKey } })}
          style={styles.waterCard}
          accessibilityRole="button"
          accessibilityLabel="Open water intake"
        >
          <View style={styles.waterTop}>
            <View>
              <Text style={styles.waterLabel}>Water Intake</Text>
              <Text style={styles.waterValue}>
                {Number.isInteger(glasses) ? glasses : glasses.toFixed(1)} of {goalGlasses} Glasses
              </Text>
            </View>
            <Pressable
              onPress={addGlass}
              style={({ pressed }) => [styles.addGlass, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Add one glass of water"
            >
              <Ionicons name="add" size={16} color={colors.heroBackground} />
              <Text style={styles.addGlassText}>1 Glass</Text>
            </Pressable>
          </View>
          <View
            style={styles.track}
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
          >
            <View style={[styles.fill, { width: `${progress * 100}%` }]} />
          </View>
          <View style={styles.waterBottom}>
            <Text style={styles.waterMeta}>{Math.round((totalMl / goalMl) * 100)}% Completed</Text>
            <Text style={styles.waterMeta}>Goal: {goalMl.toLocaleString('en-US')} ml</Text>
          </View>
        </Pressable>

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>{isToday ? 'Meals Today' : 'Meals'}</Text>
        </View>

        {meals.length ? (
          meals.map((meal, index) => (
            <Pressable
              key={meal.id}
              onPress={() => router.push({ pathname: '/meal-form', params: { id: meal.id } })}
              style={({ pressed }) => [
                styles.meal,
                index < meals.length - 1 && styles.mealDivider,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Edit ${meal.name}`}
            >
              {meal.photo ? (
                <Image source={{ uri: mealPhotoUri(meal.photo) }} style={styles.mealPhoto} />
              ) : (
                <View style={[styles.mealPhoto, styles.mealPlaceholder]}>
                  <Ionicons name="restaurant-outline" size={22} color={colors.textSubtle} />
                </View>
              )}
              <View style={styles.mealBody}>
                <Text style={styles.mealName} numberOfLines={1}>
                  {meal.name}
                </Text>
                <Text style={styles.mealNotes} numberOfLines={1}>
                  {meal.notes || 'No notes'}
                </Text>
              </View>
              <View style={styles.mealSide}>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{mealTypeLabel(meal.meal_type)}</Text>
                </View>
                <Text style={styles.mealTime}>
                  {new Date(meal.eaten_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </Text>
              </View>
            </Pressable>
          ))
        ) : (
          <Text style={styles.empty}>No meals logged for this day yet.</Text>
        )}

        {(error || actionError) && <Text style={styles.error}>{error ?? actionError}</Text>}
      </ScrollView>

      <View style={styles.logBar} pointerEvents="box-none">
        <Pressable
          onPress={() => router.push({ pathname: '/meal-form', params: { date: dateKey } })}
          style={({ pressed }) => [styles.logButton, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <Ionicons name="add" size={20} color={colors.onPrimary} />
          <Text style={styles.logText}>Log New Meal</Text>
        </Pressable>
      </View>
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
    paddingBottom: 130,
  },
  pressed: { opacity: 0.75 },
  brand: { color: colors.textMuted, fontSize: 13 },
  title: { color: colors.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.6, marginTop: 2 },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
  },
  dateText: { color: colors.text, fontSize: 16, fontWeight: '700' },
  waterCard: {
    padding: spacing.xl,
    borderRadius: 24,
    backgroundColor: colors.heroBackground,
    gap: spacing.md,
  },
  waterTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  waterLabel: { color: colors.heroTextMuted, fontSize: 13 },
  waterValue: { color: colors.heroText, fontSize: 22, fontWeight: '800', marginTop: 4 },
  addGlass: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  addGlassText: { color: colors.heroBackground, fontSize: 13, fontWeight: '700' },
  track: {
    height: 6,
    overflow: 'hidden',
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  fill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.accent },
  waterBottom: { flexDirection: 'row', justifyContent: 'space-between' },
  waterMeta: { color: colors.heroTextMuted, fontSize: 12 },
  sectionHeading: { marginTop: spacing.xl, marginBottom: spacing.sm },
  sectionTitle: { color: colors.text, fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  meal: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  mealDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  mealPhoto: { width: 52, height: 52, borderRadius: radius.md },
  mealPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  mealBody: { flex: 1, minWidth: 0 },
  mealName: { color: colors.text, fontSize: 15, fontWeight: '700' },
  mealNotes: { color: colors.textMuted, fontSize: 12, marginTop: 3 },
  mealSide: { alignItems: 'flex-end', gap: 6 },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  badgeText: { color: colors.textMuted, fontSize: 10, fontWeight: '600' },
  mealTime: { color: colors.textSubtle, fontSize: 11 },
  empty: { color: colors.textMuted, fontSize: 14, paddingVertical: spacing.md },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing.lg },
  logBar: { position: 'absolute', left: 22, right: 22, bottom: 38 },
  logButton: {
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
  logText: { color: colors.onPrimary, fontSize: 15, fontWeight: '700' },
});
