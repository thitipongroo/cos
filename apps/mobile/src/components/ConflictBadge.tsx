// ConflictBadge — shows conflict count; tap navigates to conflict review screen.
// Spec §Phase 10 SITE_ENGINEER nav — ConflictBadge in bottom nav / header.

import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { useConflicts } from '../hooks/useConflicts';
import { useT } from '../i18n';
import { colors, fontFamily, radius } from '../theme/tokens';

interface ConflictBadgeProps {
  onPress?: () => void;
  /**
   * Defaults to `conflict-badge`, which is the id `e2e/sync-conflict.spec.ts` drives.
   *
   * It had none until 2026-08-20, so that spec's assertion sat behind an `isVisible` guard that
   * could never be true — the block never ran and the test passed having checked nothing. A badge
   * that renders `null` at zero genuinely needs the guard; what it did not need was to be
   * unreachable even when it is there.
   */
  testID?: string;
}

export function ConflictBadge({ onPress, testID = 'conflict-badge' }: ConflictBadgeProps) {
  const conflicts = useConflicts();
  const count = conflicts.length;
  const t = useT();

  if (count === 0) return null;

  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      accessibilityLabel={t('sync.conflictBadge.label', { count })}
    >
      <View style={styles.badge}>
        <Text style={styles.text}>{count > 99 ? '99+' : count}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: radius.xl,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  text: {
    color: colors.bg,
    fontSize: 11,
    fontFamily: fontFamily.bold,
  },
});
