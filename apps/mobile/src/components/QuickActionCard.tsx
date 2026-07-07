// QuickActionCard (§32.7; G-M9) — 60px min-height tap target with an icon + label + optional count
// badge, single tap. Used on the field Home for one-tap access to daily actions.

import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, fontFamily, spacing, typography } from '../theme/tokens';

export function QuickActionCard({
  icon,
  label,
  badge,
  onPress,
  testID,
}: {
  icon?: string;
  label: string;
  badge?: number;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <TouchableOpacity
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.card}
      onPress={onPress}
    >
      {icon ? <Text style={styles.icon}>{icon}</Text> : null}
      <Text style={styles.label} numberOfLines={2}>
        {label}
      </Text>
      {typeof badge === 'number' && badge > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minHeight: 60,
    backgroundColor: colors.surface,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  icon: { fontSize: 22 },
  label: {
    fontSize: typography.caption.fontSize,
    fontFamily: fontFamily.medium,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  badge: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: colors.bg,
    fontSize: 10,
    fontFamily: fontFamily.bold,
  },
});
