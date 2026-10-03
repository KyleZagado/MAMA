import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import {
  darkColors,
  getActiveThemeMode,
  lightColors,
  setActiveThemeMode,
  type ThemeColors,
  type ThemeMode,
} from '../constants/theme';

const THEME_STORAGE_KEY = 'appearance_theme';

type ThemeContextValue = {
  mode: ThemeMode;
  isLoading: boolean;
  error: string | null;
  setMode: (mode: ThemeMode) => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: React.PropsWithChildren) {
  const [mode, setModeState] = useState<ThemeMode>(getActiveThemeMode());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then((stored) => {
        if (stored !== null && stored !== 'light' && stored !== 'dark') {
          throw new Error('Saved appearance setting is invalid.');
        }
        if (mounted && stored) {
          setActiveThemeMode(stored);
          setModeState(stored);
        }
        if (mounted) setError(null);
      })
      .catch((cause: unknown) => {
        if (mounted) {
          setError(cause instanceof Error ? cause.message : 'Could not load appearance setting.');
        }
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const setMode = useCallback(async (next: ThemeMode) => {
    await AsyncStorage.setItem(THEME_STORAGE_KEY, next);
    setActiveThemeMode(next);
    setModeState(next);
    setError(null);
  }, []);

  const value = useMemo(() => ({ mode, isLoading, error, setMode }), [mode, isLoading, error, setMode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside ThemeProvider.');
  return context;
}

export function useThemeColors() {
  const { mode } = useTheme();
  return mode === 'dark' ? darkColors : lightColors;
}

export function createThemedStyleSheet<T extends Record<string, unknown>>(
  factory: (colors: ThemeColors) => T,
): T {
  const cache = new Map<ThemeMode, T>();
  return new Proxy({} as T, {
    get(_target, property) {
      const mode = getActiveThemeMode();
      let styles = cache.get(mode);
      if (!styles) {
        styles = factory(mode === 'dark' ? darkColors : lightColors);
        cache.set(mode, styles);
      }
      return Reflect.get(styles, property);
    },
    ownKeys() {
      const mode = getActiveThemeMode();
      let styles = cache.get(mode);
      if (!styles) {
        styles = factory(mode === 'dark' ? darkColors : lightColors);
        cache.set(mode, styles);
      }
      return Reflect.ownKeys(styles);
    },
    getOwnPropertyDescriptor(_target, property) {
      const mode = getActiveThemeMode();
      let styles = cache.get(mode);
      if (!styles) {
        styles = factory(mode === 'dark' ? darkColors : lightColors);
        cache.set(mode, styles);
      }
      return Object.getOwnPropertyDescriptor(styles, property);
    },
  });
}
