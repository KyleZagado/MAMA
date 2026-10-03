import type { Session } from '@supabase/supabase-js';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { lightColors as colors } from '../constants/theme';
import { refreshWidgets } from '../widgets/refresh';
import { Consumption } from './consumption';
import { Dashboard } from './dashboard';
import { Fasting } from './fasting';
import { Fitness } from './fitness';
import { Todos } from './todos';

const PAGES = ['Wallets', 'To-do list', 'Food and water', 'Fitness', 'Fasting Tracker'];

// Swipe left through the main feature pages; swipe right to go back.
export function HomePager({ session }: { session: Session }) {
  const scrollRef = useRef<ScrollView>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [page, setPage] = useState(0);

  // Keep the home screen widgets current: refresh on return to this screen and when leaving the app.
  useFocusEffect(
    useCallback(() => {
      refreshWidgets(session);
    }, [session]),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') refreshWidgets(session);
    });
    return () => subscription.remove();
  }, [session]);

  function onLayout(event: LayoutChangeEvent) {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width, height });
  }

  function onScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (size.width) setPage(Math.round(event.nativeEvent.contentOffset.x / size.width));
  }

  function goTo(index: number) {
    scrollRef.current?.scrollTo({ x: index * size.width, animated: true });
    setPage(index);
  }

  return (
    <View style={styles.container} onLayout={onLayout}>
      {size.width > 0 && (
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          directionalLockEnabled
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onMomentumScrollEnd={onScrollEnd}
        >
          <View style={size}>
            <Dashboard session={session} />
          </View>
          <View style={size}>
            <Todos session={session} />
          </View>
          <View style={size}>
            <Consumption session={session} />
          </View>
          <View style={size}>
            <Fitness session={session} />
          </View>
          <View style={size}>
            <Fasting session={session} />
          </View>
        </ScrollView>
      )}
      <View style={styles.dots} pointerEvents="box-none">
        {PAGES.map((label, index) => (
          <Pressable
            key={label}
            onPress={() => goTo(index)}
            hitSlop={8}
            style={[styles.dot, page === index && styles.dotActive]}
            accessibilityRole="button"
            accessibilityLabel={`Show ${label}`}
            accessibilityState={{ selected: page === index }}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  dots: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { width: 22, backgroundColor: colors.primary },
});
