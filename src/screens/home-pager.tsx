import { createThemedStyleSheet } from '../providers/theme-provider';
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
  Text,
  View,
} from 'react-native';

import { HOME_PAGES, type HomePageId } from '../constants/home-pages';
import { loadHomePageOrder } from '../lib/home-page-preference';
import { refreshWidgets } from '../widgets/refresh';
import { Consumption } from './consumption';
import { Dashboard } from './dashboard';
import { Fasting } from './fasting';
import { Fitness } from './fitness';
import { Journal } from './journal';
import { Overview } from './overview';
import { Todos } from './todos';

// Swipe left through the main feature pages; swipe right to go back.
export function HomePager({ session }: { session: Session }) {
  const scrollRef = useRef<ScrollView>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [page, setPage] = useState(0);
  const [pageOrder, setPageOrder] = useState<HomePageId[]>(HOME_PAGES.map((item) => item.id));
  const [orderError, setOrderError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      loadHomePageOrder(session.user.id)
        .then((order) => {
          if (!mounted) return;
          setPageOrder(order);
          setPage(0);
          scrollRef.current?.scrollTo({ x: 0, animated: false });
          setOrderError(null);
        })
        .catch((error: unknown) => {
          if (mounted) {
            setOrderError(
              error instanceof Error ? error.message : 'Could not load your home page order.',
            );
          }
        });
      return () => {
        mounted = false;
      };
    }, [session.user.id]),
  );

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

  const pages = new Map<HomePageId, React.ReactNode>([
    ['finance', <Dashboard key="finance" session={session} />],
    ['todos', <Todos key="todos" session={session} />],
    ['consumption', <Consumption key="consumption" session={session} />],
    ['fitness', <Fitness key="fitness" session={session} />],
    ['fasting', <Fasting key="fasting" session={session} />],
    ['overview', <Overview key="overview" session={session} isVisible={pageOrder[page] === 'overview'} />],
    ['journal', <Journal key="journal" session={session} isVisible={pageOrder[page] === 'journal'} />],
  ]);

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
          {pageOrder.map((id) => (
            <View key={id} style={size}>
              {pages.get(id)}
            </View>
          ))}
        </ScrollView>
      )}
      {orderError && <Text style={styles.error}>{orderError}</Text>}
      <View style={styles.dots} pointerEvents="box-none">
        {pageOrder.map((id, index) => {
          const label = HOME_PAGES.find((item) => item.id === id)?.label ?? id;
          return (
            <Pressable
              key={id}
              onPress={() => goTo(index)}
              hitSlop={8}
              style={[styles.dot, page === index && styles.dotActive]}
              accessibilityRole="button"
              accessibilityLabel={`Show ${label}`}
              accessibilityState={{ selected: page === index }}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = createThemedStyleSheet((colors) => StyleSheet.create({
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
  error: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 42,
    color: colors.danger,
    fontSize: 12,
    textAlign: 'center',
  },
}));
