import type { WidgetSnapshot } from './snapshot';

export async function pushWidgetSnapshot(snapshot: WidgetSnapshot) {
  try {
    // Loaded lazily: expo-widgets is missing in Expo Go, and widgets only exist in development builds.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const widget = require('./mama-widget').default;
    widget.updateSnapshot(snapshot);
  } catch {
    // Not running in a development build, so there is no widget to update.
  }
}
