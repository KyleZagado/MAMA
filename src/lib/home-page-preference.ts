import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  DEFAULT_HOME_PAGE_ORDER,
  normalizeHomePageOrder,
  type HomePageId,
} from '../constants/home-pages';

function storageKey(userId: string) {
  return `home_page_order:${userId}`;
}

export async function loadHomePageOrder(userId: string) {
  const saved = await AsyncStorage.getItem(storageKey(userId));
  if (saved === null) return [...DEFAULT_HOME_PAGE_ORDER];
  try {
    return normalizeHomePageOrder(JSON.parse(saved));
  } catch (error: unknown) {
    throw new Error('Saved home page order is invalid.', { cause: error });
  }
}

export async function saveHomePageOrder(userId: string, order: HomePageId[]) {
  const normalized = normalizeHomePageOrder(order);
  await AsyncStorage.setItem(storageKey(userId), JSON.stringify(normalized));
  return normalized;
}
