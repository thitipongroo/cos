// ConflictBadge — shows conflict count; tap navigates to conflict review screen.
// Spec §Phase 10 SITE_ENGINEER nav — ConflictBadge in bottom nav / header.

import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { useConflicts } from '../hooks/useConflicts';
import { useT } from '../i18n';
import { colors, fontFamily, radius } from '../theme/tokens';

interface ConflictBadgeProps {
  onPress?: () => void;
}

export function ConflictBadge({ onPress }: ConflictBadgeProps) {
  const conflicts = useConflicts();
  const count = conflicts.length;
  const t = useT();

  if (count === 0) return null;

  return (
    <TouchableOpacity
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
