import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  DEFAULT_HOME_PAGE_ORDER,
  normalizeHiddenHomePages,
  normalizeHomePageOrder,
  type HomePageId,
} from '../constants/home-pages';

function storageKey(userId: string) {
  return `home_page_order:${userId}`;
}

function hiddenStorageKey(userId: string) {
  return `home_page_hidden:${userId}`;
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

export async function loadHiddenHomePages(userId: string) {
  const saved = await AsyncStorage.getItem(hiddenStorageKey(userId));
  if (saved === null) return [];
  try {
    return normalizeHiddenHomePages(JSON.parse(saved));
  } catch (error: unknown) {
    throw new Error('Saved hidden home pages are invalid.', { cause: error });
  }
}

export async function saveHiddenHomePages(userId: string, hidden: HomePageId[]) {
  const normalized = normalizeHiddenHomePages(hidden);
  await AsyncStorage.setItem(hiddenStorageKey(userId), JSON.stringify(normalized));
  return normalized;
}
