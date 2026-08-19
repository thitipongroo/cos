// The four sync states, their precedence, and what each one says — resolved once for every
// indicator that shows them.
//
// <SyncPill /> (the TopBar glyph) and <OverlaySyncPill /> (the labelled pill an overlay's own bar
// carries) are deliberately DIFFERENT components: PO 2026-08-04/2026-08-09 keeps the top-bar one
// glyph-only, because a word would crowd a row that also holds the brand and two icon buttons,
// while a full-screen overlay has room for it. What is NOT meant to differ is what they say —
// both docs record "same four states, same order of precedence, same source". That agreement was
// being maintained by two copies of the same ternary, which is how it quietly stopped being true
// (see `syncedIcon` below).
//
// So the precedence lives here and the presentation stays with each component.

import type { MaterialIcons } from '@expo/vector-icons';
import { useSyncStatus } from './useSyncStatus';
import { usePendingCount } from './usePendingCount';
import { useT } from '../i18n';
import { darkColors } from '../theme/tokens';

type IconName = keyof typeof MaterialIcons.glyphMap;

export interface SyncPillView {
  icon: IconName;
  color: string;
  label: string;
}

/**
 * @param syncedIcon the glyph for the SYNCED state.
 *
 * A parameter, not a constant, because the two callers do not agree today: the top-bar pill uses
 * `cloud-done` on PO decision 2026-08-06 ("two glyphs for one state taught the holder that the tick
 * and the cloud meant different things" — the drawer and the sync queue draw the cloud too), and
 * the overlay pill uses `check-circle` because its mockup draws `✓ SYNCED`. Passing it keeps both
 * components rendering exactly what they render today rather than this refactor silently picking a
 * winner; the disagreement is now in ONE place instead of hidden in two copies of a ternary.
 */
export function useSyncPillView(syncedIcon: IconName): SyncPillView {
  const status = useSyncStatus();
  const pending = usePendingCount();
  const t = useT();

  // NO SEPARATE OFFLINE STATE, deliberately (PO 2026-08-06). Losing the network is not a state of
  // its own — it is what PRODUCES the pending one: every write made offline enqueues, `pendingCount`
  // rises, and the indicator already says `cloud-upload` with the count. A distinct "offline" branch
  // would be a second name for the same fact, and offline with an empty queue genuinely is synced —
  // nothing is waiting.
  if (status === 'error') {
    return { icon: 'sync-problem', color: darkColors.danger, label: t('sync.pill.error') };
  }
  if (status === 'syncing') {
    return { icon: 'sync', color: darkColors.syncing, label: t('sync.pill.syncing') };
  }
  if (pending > 0) {
    return {
      icon: 'cloud-upload',
      color: darkColors.syncing,
      label: t('sync.pill.pending', { count: pending }),
    };
  }
  return { icon: syncedIcon, color: darkColors.success, label: t('sync.pill.synced') };
}
