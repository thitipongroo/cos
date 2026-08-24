// The four sync states, their precedence, and what each one says — resolved once for every
// indicator that shows them.
//
// <SyncPill /> (the TopBar glyph) and <OverlaySyncPill /> (the labelled pill an overlay's own bar
// carries) are deliberately DIFFERENT components: PO 2026-08-04/2026-08-09 keeps the top-bar one
// glyph-only, because a word would crowd a row that also holds the brand and two icon buttons,
// while a full-screen overlay has room for it. What is NOT meant to differ is what they say —
// both docs record "same four states, same order of precedence, same source". That agreement was
// being maintained by two copies of the same ternary, which is how it quietly stopped being true —
// the two had drifted on the SYNCED glyph (settled below).
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

const SYNCED_ICON: IconName = 'cloud-done';

/**
 * SYNCED IS `cloud-done` EVERYWHERE (PO 2026-08-06, reaffirmed 2026-08-20).
 *
 * Pulling the two pills onto one hook exposed that they had drifted: the top-bar pill drew
 * `cloud-done` and the overlay pill drew `check-circle`, taken from a mockup that letters the pill
 * `✓ SYNCED`. The original decision names `check-circle` as the option it rejected — two glyphs for
 * one state teach the holder that the tick and the cloud mean different things — and the cloud also
 * says WHERE the work is, on the server, which is the question a tick leaves open. The drawer and
 * the sync queue already drew the cloud, so the overlay was the only dissenter. It is a constant
 * rather than a parameter so a third indicator cannot reopen this by passing something else.
 */
export function useSyncPillView(): SyncPillView {
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
  return { icon: SYNCED_ICON, color: darkColors.success, label: t('sync.pill.synced') };
}
