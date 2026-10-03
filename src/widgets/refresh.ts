import type { Session } from '@supabase/supabase-js';

import { pushWidgetSnapshot } from './push';
import { buildSnapshot, SIGNED_OUT_SNAPSHOT } from './snapshot';

export async function refreshWidgets(session: Session) {
  try {
    await pushWidgetSnapshot(await buildSnapshot(session));
  } catch {
    // A widget that fails to refresh keeps showing its last data.
  }
}

export function clearWidgets() {
  return pushWidgetSnapshot(SIGNED_OUT_SNAPSHOT).catch(() => {});
}
