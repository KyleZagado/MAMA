import Constants from 'expo-constants';

import type { WidgetSnapshot } from './snapshot';

export async function pushWidgetSnapshot(snapshot: WidgetSnapshot) {
  if (Constants.expoGoConfig) return;

  try {
    // Loaded lazily because the native widget module is only included in configured app builds.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const widget = require('./mama-widget').default;
    widget.updateSnapshot(snapshot);
  } catch {
    // Not running in a development build, so there is no widget to update.
  }
}
