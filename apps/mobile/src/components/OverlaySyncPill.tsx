// <OverlaySyncPill /> — the LABELLED sync pill an overlay's own top bar carries.
//
// Distinct from <SyncPill />, and deliberately so. That one lives in the shared TopBar and is
// glyph-only: it sits between the brand and two icon buttons, where a word would crowd the row
// (§32.7 / PO 2026-08-04). A full-screen overlay has its own bar with room to spare, and both
// quick-action mockups draw a pill with the WORD in it —
// 04_tenant_admin/01_home/02_quick_action_button/01_quick_action_menu shows `✓ SYNCED`.
//
// Extracted from <QuickAddMenu />'s private StatusPill on 2026-08-09, when the Site Worker's menu
// was made to match that overlay: the second copy is the point at which it stops being one screen's
// detail. Same four states, same order of precedence, and the same source as every other sync
// indicator — error > syncing > pending > synced, where offline is not a state but a producer of
// pending.
//
// Always dark: an overlay is not the page beneath it.

import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSyncPillView } from '../hooks/useSyncPillView';
import { fontFamily, radius, spacing } from '../theme/tokens';

export function OverlaySyncPill({ testID = 'overlay-sync-pill' }: { testID?: string }) {
  // `check-circle`, because the overlay's mockup draws `✓ SYNCED`; the top-bar pill draws
  // `cloud-done` on PO 2026-08-06. See useSyncPillView's `syncedIcon` — the two do not agree, and
  // that is recorded there rather than settled here.
  const v = useSyncPillView('check-circle');

  return (
    // `1A` is 10% alpha — the pill is a tint OF its own state colour, so one rule covers all four.
    <View testID={testID} style={[styles.pill, { backgroundColor: `${v.color}1A` }]}>
      <MaterialIcons name={v.icon} size={14} color={v.color} accessibilityLabel={v.label} />
      <Text style={[styles.text, { color: v.color }]}>{v.label.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.xl,
  },
  text: { fontFamily: fontFamily.bold, fontSize: 10, letterSpacing: 1 },
});
