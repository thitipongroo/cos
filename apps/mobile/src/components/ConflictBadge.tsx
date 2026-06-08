// ConflictBadge — shows conflict count; tap navigates to conflict review screen.
// Spec §Phase 10 SITE_ENGINEER nav — ConflictBadge in bottom nav / header.

import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { useConflicts } from '../hooks/useConflicts';

interface ConflictBadgeProps {
  onPress?: () => void;
}

export function ConflictBadge({ onPress }: ConflictBadgeProps) {
  const conflicts = useConflicts();
  const count = conflicts.length;

  if (count === 0) return null;

  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityLabel={`${count} conflict${count === 1 ? '' : 's'} — tap to review`}
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
    borderRadius: 10,
    backgroundColor: '#E53E3E',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
});
