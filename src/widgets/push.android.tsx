import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';

import { MamaAndroidWidget } from './android-widget';
import { SNAPSHOT_STORAGE_KEY } from './android-task-handler';
import type { WidgetSnapshot } from './snapshot';

export async function pushWidgetSnapshot(snapshot: WidgetSnapshot) {
  try {
    await AsyncStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshot));
    // Loaded lazily: the native widget module is missing in Expo Go.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { requestWidgetUpdate } = require('react-native-android-widget');
    await requestWidgetUpdate({
      widgetName: 'MamaWidget',
      renderWidget: () => <MamaAndroidWidget snapshot={snapshot} />,
    });
  } catch {
    // Not running in a development build, so there is no widget to update.
  }
}
