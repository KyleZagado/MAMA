import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';

import { MamaAndroidWidget } from './android-widget';
import { SIGNED_OUT_SNAPSHOT, type WidgetSnapshot } from './snapshot';

export const SNAPSHOT_STORAGE_KEY = 'mama.widget.snapshot';

export async function readSnapshot(): Promise<WidgetSnapshot> {
  try {
    const raw = await AsyncStorage.getItem(SNAPSHOT_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as WidgetSnapshot) : SIGNED_OUT_SNAPSHOT;
  } catch {
    return SIGNED_OUT_SNAPSHOT;
  }
}

// Runs headless when the launcher adds, resizes or refreshes the widget.
export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  if (props.widgetInfo.widgetName !== 'MamaWidget') return;
  if (props.widgetAction === 'WIDGET_DELETED' || props.widgetAction === 'WIDGET_CLICK') return;
  props.renderWidget(<MamaAndroidWidget snapshot={await readSnapshot()} />);
}
