import { createThemedStyleSheet } from '../providers/theme-provider';
import type { Session } from '@supabase/supabase-js';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formStyles } from '../components/form';
import { RouteMap } from '../components/route-map';
import { goBack, ScreenHeader } from '../components/screen-header';
import { Stat, StatGrid } from '../components/stat';
import { radius, spacing } from '../constants/theme';
import { getDatabase } from '../database';
import { deleteActivity, getActivity, parseRoute, type ActivityRow } from '../database/activities';
import { activityInfo, formatDuration, formatKm, formatPace } from '../lib/activity';

export function ActivityDetail({ session, activityId }: { session: Session; activityId?: string }) {
  const [activity, setActivity] = useState<ActivityRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activityId) return;
    let active = true;
    (async () => {
      try {
        const row = await getActivity(await getDatabase(session.user.id), activityId);
        if (active) setActivity(row);
      } catch (e: unknown) {
        if (active) setError(e instanceof Error ? e.message : 'Could not load this activity.');
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [session.user.id, activityId]);

  function confirmDelete() {
    if (!activity) return;
    Alert.alert('Delete this activity?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteActivity(await getDatabase(session.user.id), activity.id);
            goBack();
          } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Could not delete this activity.');
          }
        },
      },
    ]);
  }

  const info = activity ? activityInfo(activity.type) : null;
  const pace = activity ? formatPace(activity.type, activity.duration_s, activity.distance_m) : null;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={formStyles.content} showsVerticalScrollIndicator={false}>
        <ScreenHeader title={info?.label ?? 'Activity'} />
        {activity && info && pace ? (
          <>
            <Text style={styles.when}>
              {new Date(activity.started_at).toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
              {' · '}
              {new Date(activity.started_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </Text>
            <StatGrid>
              <Stat label="DISTANCE" value={formatKm(activity.distance_m)} unit="km" />
              <Stat label="TIME" value={formatDuration(activity.duration_s)} />
              <Stat label={activity.type === 'ride' ? 'SPEED' : 'PACE'} value={pace.value} unit={pace.unit} />
              <Stat label="CALORIES" value={String(activity.calories)} unit="kcal" />
              {activity.steps !== null && <Stat label="STEPS" value={activity.steps.toLocaleString('en-US')} />}
            </StatGrid>
            <RouteMap points={parseRoute(activity.route)} />
            <Pressable
              onPress={confirmDelete}
              style={({ pressed }) => [styles.delete, pressed && styles.pressed]}
              accessibilityRole="button"
            >
              <Text style={styles.deleteText}>Delete activity</Text>
            </Pressable>
          </>
        ) : (
          !isLoading && <Text style={styles.when}>This activity could not be found.</Text>
        )}
        {error && <Text style={formStyles.error}>{error}</Text>}
        <View />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = createThemedStyleSheet((colors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  pressed: { opacity: 0.75 },
  when: { color: colors.textMuted, fontSize: 14 },
  delete: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.dangerSoft,
    marginTop: spacing.sm,
  },
  deleteText: { color: colors.danger, fontSize: 15, fontWeight: '700' },
}));
