import type { WidgetSnapshot } from './snapshot';

// Web has no home screen widgets. iOS and Android use push.ios.ts and push.android.tsx.
export async function pushWidgetSnapshot(snapshot: WidgetSnapshot) {
  void snapshot;
}
