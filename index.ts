import 'expo-router/entry';

import { Platform } from 'react-native';

// The Android widget task handler must be registered when the JS bundle loads, even
// when the app UI is not open. It is skipped where the native widget module is missing (Expo Go).
if (Platform.OS === 'android') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { registerWidgetTaskHandler } = require('react-native-android-widget');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { widgetTaskHandler } = require('./src/widgets/android-task-handler');
    registerWidgetTaskHandler(widgetTaskHandler);
  } catch {
    // Widgets are only available in development and production builds.
  }
}
